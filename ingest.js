import fs from "fs";
import path from "path";
import pdf from "pdf-parse/lib/pdf-parse.js";
import crypto from "crypto";
import OpenAI from "openai";
import { supabase, supabaseAdmin } from "./supabase.js";
import { normalizeCanonicalText } from "./canon.js";
import dotenv from "dotenv"; dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// limits
const MAX_CHARS = 200_000;      // ~200 KB of text
const EMBED_BATCH = 48;

// New chunker: sentence-aware
function chunkBySentences(text, targetSize = 500) {
  const sentences = text
    .split(/(?:(?<=[.?!])\s+|\n+(?=\S))/)   // end of sentence OR newline block
    .map(s => s.trim())
    .filter(Boolean);

  const chunks = [];
  let current = "";
  let charStart = 0;

  for (const s of sentences) {
    if ((current ? current + " " + s : s).length > targetSize && current) {
      chunks.push({ charStart, charEnd: charStart + current.length, text: current });
      charStart += current.length + 1;
      current = s;
    } else {
      current += (current ? " " : "") + s;
    }
  }
  if (current) {
    chunks.push({ charStart, charEnd: charStart + current.length, text: current });
  }
  return chunks;
}
  

async function embedManyBatched(texts) {
  const all = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH) {
    const batch = texts.slice(i, i + EMBED_BATCH);
    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: batch
    });
    for (const d of res.data) {
      const v = d.embedding;
      const n = Math.sqrt(v.reduce((s,x)=>s+x*x,0)) || 1;
      all.push(v.map(x => x / n));
    }
  }
  return all;
}

function sentenceWindows(text, minLen = 120, maxLen = 280) {
    const sentences = text
      .split(/(?:(?<=[.?!])\s+|\n+(?=\S))/) // sentence end or newline block
      .map(s => s.trim())
      .filter(Boolean);
  
    const chunks = [];
    let buf = "", start = 0, pos = 0;
  
    for (const s of sentences) {
      const next = buf ? buf + " " + s : s;
  
      if (next.length > maxLen) {
        if (buf.length >= minLen) {
          chunks.push({ charStart: start, charEnd: start + buf.length, text: buf });
          start = pos;               // new window starts at this sentence
          buf = s;                   // start buffer with current sentence
        } else {
          // too short: force-cut at maxLen
          chunks.push({ charStart: start, charEnd: start + maxLen, text: next.slice(0, maxLen) });
          start = pos + s.length + 1;
          buf = "";
        }
      } else {
        if (!buf) start = pos;       // first sentence in window
        buf = next;
      }
      pos += s.length + 1;           // +1 approximates the split space/newline
    }
    if (buf) chunks.push({ charStart: start, charEnd: start + buf.length, text: buf });
    return chunks;
  }
  

async function upsertChunksBatched(resumeId, chunks) {
  // insert in same batches to avoid big payloads
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const seg = chunks.slice(i, i + EMBED_BATCH);
    const embs = await embedManyBatched(seg.map(c => c.text));
    const rows = seg.map((c, j) => {
      // Estimate page number based on character position (~3000 chars per page)
      const estimatedPage = Math.floor(c.charStart / 3000) + 1;
      
      // Create coordinates JSON with character positions
      const coordinates = {
        char_start: c.charStart,
        char_end: c.charEnd,
        text_length: c.text.length
      };
      
      return {
        resume_id: resumeId,
        page_number: estimatedPage,
        coordinates: coordinates,
        text: c.text,
        embedding: embs[j]
      };
    });
    const { error } = await supabaseAdmin.from("resume_chunks").insert(rows);
    if (error) throw error;
  }
}

async function ingestSinglePDF(filePath){
  const buf = fs.readFileSync(filePath);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const originalFilename = filePath.split("/").pop();

  // storage - use hash as filename to avoid encoding issues
  const storagePath = `${sha}/${sha}.pdf`;
  await supabaseAdmin.storage.from("resumes").upload(storagePath, buf, { 
    upsert: true,
    contentType: 'application/pdf'
  });
  const pdf_url = `${process.env.SUPABASE_URL}/storage/v1/object/public/resumes/${storagePath}`;

  // row - store original filename in database, use hash in storage
  const { data: resume, error } = await supabaseAdmin
    .from("resumes").insert({ name: originalFilename, pdf_url, sha256: sha }).select().single();
  if(error) throw error;

  // parse + chunk
  const parsed = await pdf(buf);
  let text = normalizeCanonicalText((parsed.text || ""), { flatten: 'soft' });
  
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
  }

  const chunks = sentenceWindows(text, 130, 240);

  // const chunks = chunkBySentences(text, 500); // your new sentence-aware chunker

  if (chunks.length === 0) throw new Error("No text extracted from PDF");

  await upsertChunksBatched(resume.id, chunks);
  console.log("Ingested:", resume.id, "chunks:", chunks.length);
  return { resume_id: resume.id, chunks: chunks.length, filename: originalFilename };
}

async function ingestFolder(folderPath, recursive = false) {
  console.log(`📁 Processing folder: ${folderPath}`);
  
  if (!fs.existsSync(folderPath)) {
    throw new Error(`Folder does not exist: ${folderPath}`);
  }

  const stats = fs.statSync(folderPath);
  if (!stats.isDirectory()) {
    throw new Error(`Path is not a directory: ${folderPath}`);
  }

  // Get all PDF files
  const pdfFiles = [];
  
  function scanDirectory(dir) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const itemPath = path.join(dir, item);
      const itemStats = fs.statSync(itemPath);
      
      if (itemStats.isDirectory() && recursive) {
        scanDirectory(itemPath);
      } else if (itemStats.isFile() && /\.pdf$/i.test(item)) {
        pdfFiles.push(itemPath);
      }
    }
  }

  scanDirectory(folderPath);
  
  if (pdfFiles.length === 0) {
    console.log("❌ No PDF files found in the specified folder");
    return { success: [], failed: [], skipped: [] };
  }

  console.log(`📄 Found ${pdfFiles.length} PDF files`);
  
  const results = { success: [], failed: [], skipped: [] };

  for (let i = 0; i < pdfFiles.length; i++) {
    const file = pdfFiles[i];
    const fileName = path.basename(file);
    
    try {
      console.log(`[${i + 1}/${pdfFiles.length}] Processing: ${fileName}`);
      
      const result = await ingestSinglePDF(file);
      results.success.push(result);
      console.log(`✅ ${fileName} - ${result.chunks} chunks`);
      
    } catch (error) {
      if (error.message.includes('already exists')) {
        results.skipped.push({ file: fileName, reason: 'Already exists' });
        console.log(`⏭️  ${fileName} - Already exists (skipped)`);
      } else {
        results.failed.push({ file: fileName, error: error.message });
        console.log(`❌ ${fileName} - Error: ${error.message}`);
      }
    }
  }

  // Summary
  console.log("\n📊 SUMMARY");
  console.log(`✅ Success: ${results.success.length}`);
  console.log(`⏭️  Skipped: ${results.skipped.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  
  const totalChunks = results.success.reduce((sum, r) => sum + r.chunks, 0);
  console.log(`🎉 Total chunks: ${totalChunks}`);
  
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log("Usage:");
    console.log("  node ingest.js <file.pdf>           # Process single PDF");
    console.log("  node ingest.js <folder>             # Process all PDFs in folder");
    console.log("  node ingest.js <folder> --recursive # Include subdirectories");
    return;
  }

  const target = args[0];
  const recursive = args.includes('--recursive') || args.includes('-r');

  if (!fs.existsSync(target)) {
    console.error(`❌ Path does not exist: ${target}`);
    process.exit(1);
  }

  const stats = fs.statSync(target);
  
  if (stats.isFile()) {
    // Single file
    if (!/\.pdf$/i.test(target)) {
      console.error(`❌ File must be a PDF: ${target}`);
      process.exit(1);
    }
    await ingestSinglePDF(target);
  } else if (stats.isDirectory()) {
    // Folder
    await ingestFolder(target, recursive);
  } else {
    console.error(`❌ Invalid path: ${target}`);
    process.exit(1);
  }
}

main().catch(console.error);
