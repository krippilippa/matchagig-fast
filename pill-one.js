import OpenAI from "openai";
import { supabaseAdmin } from "./supabase.js";
import dotenv from "dotenv";
dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Utility function to normalize vector (same as in ingest.js)
const unit = v => { 
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1; 
  return v.map(x => x / n); 
};

// Embed a single text
async function embedOne(text) {
  const r = await openai.embeddings.create({ 
    model: "text-embedding-3-small", 
    input: text 
  });
  return unit(r.data[0].embedding);
}

// Embed multiple texts in batches
async function embedManyBatched(texts, batchSize = 48) {
  const all = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: batch
    });
    for (const d of res.data) {
      const v = d.embedding;
      all.push(unit(v));
    }
  }
  return all;
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: node pill-one.js <pill> [--syn \"synonym1;synonym2\"] [--topk-resumes <n>] [--include-chunk-ids] [--pretty]");
    process.exit(1);
  }

  const pill = args[0];
  const config = {
    pill,
    synonyms: [],
    topkResumes: 999999,
    includeChunkIds: false,
    pretty: false
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--syn" && i + 1 < args.length) {
      const synStr = args[i + 1];
      config.synonyms = synStr.split(';').map(s => s.trim()).filter(Boolean);
      i++; // skip next arg
    } else if (arg === "--topk-resumes" && i + 1 < args.length) {
      config.topkResumes = parseInt(args[i + 1], 10);
      i++; // skip next arg
    } else if (arg === "--include-chunk-ids") {
      config.includeChunkIds = true;
    } else if (arg === "--pretty") {
      config.pretty = true;
    }
  }

  return config;
}

// Main pill search logic
async function pillSearch(config) {
  // 1. Build variants list (pill + synonyms, normalized)
  const variants = [config.pill, ...config.synonyms]
    .map(v => v.trim().toLowerCase())
    .filter((v, i, arr) => v && arr.indexOf(v) === i); // dedupe

  // 2. Batch embed all variants
  const embeddings = await embedManyBatched(variants);

  // 3. For each variant, call best_per_resume RPC
  const variantResults = new Map(); // variant -> Map(resume_id -> {best_chunk_id, similarity})
  
  for (let i = 0; i < variants.length; i++) {
    const variant = variants[i];
    const embedding = embeddings[i];
    
    const { data: ranked, error } = await supabaseAdmin.rpc("best_per_resume", { q: embedding });
    if (error) throw error;
    
    const resumeMap = new Map();
    if (ranked) {
      for (const row of ranked) {
        resumeMap.set(row.resume_id, {
          best_chunk_id: row.best_chunk_id,
          similarity: row.similarity
        });
      }
    }
    variantResults.set(variant, resumeMap);
  }

  // 4. Reduce across variants per resume to find max similarity
  const resumeWinners = new Map(); // resume_id -> {max_sim, best_chunk_id, winning_variant}
  
  for (const [variant, resumeMap] of variantResults) {
    for (const [resumeId, result] of resumeMap) {
      const current = resumeWinners.get(resumeId);
      if (!current || result.similarity > current.max_sim) {
        resumeWinners.set(resumeId, {
          max_sim: result.similarity,
          best_chunk_id: result.best_chunk_id,
          winning_variant: variant
        });
      }
    }
  }

  if (resumeWinners.size === 0) {
    return {
      pill: config.pill,
      variants,
      resumes: []
    };
  }

  // 5. Bulk fetch resume names and chunk texts
  const resumeIds = Array.from(resumeWinners.keys());
  const chunkIds = Array.from(resumeWinners.values()).map(w => w.best_chunk_id).filter(Boolean);

  // Fetch resume names
  const { data: resumes, error: resumeError } = await supabaseAdmin
    .from("resumes")
    .select("id, name")
    .in("id", resumeIds);
  if (resumeError) throw resumeError;

  const resumeNameMap = new Map();
  if (resumes) {
    for (const resume of resumes) {
      resumeNameMap.set(resume.id, resume.name);
    }
  }

  // Fetch chunk texts
  const chunkTextMap = new Map();
  if (chunkIds.length > 0) {
    const { data: chunks, error: chunkError } = await supabaseAdmin
      .from("resume_chunks")
      .select("id, text")
      .in("id", chunkIds);
    if (chunkError) throw chunkError;

    if (chunks) {
      for (const chunk of chunks) {
        chunkTextMap.set(chunk.id, chunk.text);
      }
    }
  }

  // 6. Assemble results
  const results = [];
  for (const [resumeId, winner] of resumeWinners) {
    const resumeName = resumeNameMap.get(resumeId) || "Unknown";
    const chunkText = chunkTextMap.get(winner.best_chunk_id) || "";
    
    const result = {
      resume_id: resumeId,
      resume_name: resumeName,
      max_sim: winner.max_sim,
      best_chunk_text: chunkText
    };

    if (config.includeChunkIds) {
      result.best_chunk_id = winner.best_chunk_id;
    }

    results.push(result);
  }

  // 7. Sort by similarity desc and apply topk limit
  results.sort((a, b) => b.max_sim - a.max_sim);
  const limitedResults = results.slice(0, config.topkResumes);

  return {
    pill: config.pill,
    variants,
    resumes: limitedResults
  };
}

async function main() {
  try {
    // Check required environment variables
    if (!process.env.OPENAI_API_KEY) {
      console.error("Error: OPENAI_API_KEY environment variable is required");
      process.exit(1);
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables are required");
      process.exit(1);
    }

    const config = parseArgs();
    const result = await pillSearch(config);
    
    console.log(JSON.stringify(result, null, config.pretty ? 2 : 0));
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();



