import fs from "fs";
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

async function upsertChunksBatched(resumeId, chunks) {
  // insert in same batches to avoid big payloads
  for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
    const seg = chunks.slice(i, i + EMBED_BATCH);
    const embs = await embedManyBatched(seg.map(c => c.text));
    const rows = seg.map((c, j) => ({
      resume_id: resumeId,
      page: null,
      char_start: c.charStart,
      char_end: c.charEnd,
      text: c.text,
      embedding: embs[j]
    }));
    const { error } = await supabaseAdmin.from("resume_chunks").insert(rows);
    if (error) throw error;
  }
}

async function main(path){
  const buf = fs.readFileSync(path);
  const sha = crypto.createHash("sha256").update(buf).digest("hex");
  const filename = path.split("/").pop();

  // storage
  const storagePath = `${sha}/${filename}`;
  await supabaseAdmin.storage.from("resumes").upload(storagePath, buf, { upsert:true });
  const pdf_url = `${process.env.SUPABASE_URL}/storage/v1/object/public/resumes/${storagePath}`;

  // row
  const { data: resume, error } = await supabaseAdmin
    .from("resumes").insert({ name: filename, pdf_url, sha256: sha }).select().single();
  if(error) throw error;

  // parse + chunk
  const parsed = await pdf(buf);
  let text = normalizeCanonicalText((parsed.text || ""), { flatten: 'soft' });
  
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
  }

  const chunks = chunkBySentences(text, 500); // your new sentence-aware chunker

  if (chunks.length === 0) throw new Error("No text extracted from PDF");

  await upsertChunksBatched(resume.id, chunks);
  console.log("Ingested:", resume.id, "chunks:", chunks.length);
}

main(process.argv[2]).catch(console.error);
