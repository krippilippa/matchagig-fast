import fs from "fs";
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
    console.error("Usage: node pill-many.js <pills.txt> [--syn <synonyms.json>] [--topk-resumes <n>] [--include-chunk-ids] [--pretty]");
    process.exit(1);
  }

  const pillsFile = args[0];
  const config = {
    pillsFile,
    synonymsFile: null,
    topkResumes: 999999,
    includeChunkIds: false,
    pretty: false
  };

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--syn" && i + 1 < args.length) {
      config.synonymsFile = args[i + 1];
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

// Load pills from file
function loadPills(pillsFile) {
  if (!fs.existsSync(pillsFile)) {
    throw new Error(`Pills file does not exist: ${pillsFile}`);
  }
  
  const content = fs.readFileSync(pillsFile, 'utf8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

// Load synonyms from JSON file
function loadSynonyms(synonymsFile) {
  if (!synonymsFile) return {};
  
  if (!fs.existsSync(synonymsFile)) {
    throw new Error(`Synonyms file does not exist: ${synonymsFile}`);
  }
  
  const content = fs.readFileSync(synonymsFile, 'utf8');
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Invalid JSON in synonyms file: ${error.message}`);
  }
}

// Main pill matrix search logic
async function pillMatrixSearch(config) {
  // 1. Load pills and synonyms
  const pills = loadPills(config.pillsFile);
  const synonymsMap = loadSynonyms(config.synonymsFile);

  if (pills.length === 0) {
    return {
      pills: [],
      resumes: []
    };
  }

  // 2. Build variants for each pill
  const pillConfigs = pills.map(pill => {
    const synonyms = synonymsMap[pill] || [];
    const variants = [pill, ...synonyms]
      .map(v => v.trim().toLowerCase())
      .filter((v, i, arr) => v && arr.indexOf(v) === i); // dedupe
    
    return {
      pill,
      variants
    };
  });

  // 3. Collect all unique variants for batch embedding
  const allVariants = [];
  const variantToPillMap = new Map(); // variant -> pill
  
  for (const pillConfig of pillConfigs) {
    for (const variant of pillConfig.variants) {
      if (!allVariants.includes(variant)) {
        allVariants.push(variant);
      }
      variantToPillMap.set(variant, pillConfig.pill);
    }
  }

  // 4. Batch embed all variants
  const allEmbeddings = await embedManyBatched(allVariants);
  const variantEmbeddingMap = new Map();
  
  for (let i = 0; i < allVariants.length; i++) {
    variantEmbeddingMap.set(allVariants[i], allEmbeddings[i]);
  }

  // 5. For each variant, call best_per_resume RPC
  const variantResults = new Map(); // variant -> Map(resume_id -> {best_chunk_id, similarity})
  
  for (const variant of allVariants) {
    const embedding = variantEmbeddingMap.get(variant);
    
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

  // 6. For each pill, reduce across its variants per resume
  const pillResumeWinners = new Map(); // pill -> Map(resume_id -> {max_sim, best_chunk_id})
  
  for (const pillConfig of pillConfigs) {
    const pill = pillConfig.pill;
    const resumeWinners = new Map();
    
    for (const variant of pillConfig.variants) {
      const resumeMap = variantResults.get(variant) || new Map();
      
      for (const [resumeId, result] of resumeMap) {
        const current = resumeWinners.get(resumeId);
        if (!current || result.similarity > current.max_sim) {
          resumeWinners.set(resumeId, {
            max_sim: result.similarity,
            best_chunk_id: result.best_chunk_id
          });
        }
      }
    }
    
    pillResumeWinners.set(pill, resumeWinners);
  }

  // 7. Collect all unique resume IDs and chunk IDs
  const allResumeIds = new Set();
  const allChunkIds = new Set();
  
  for (const [pill, resumeWinners] of pillResumeWinners) {
    for (const [resumeId, winner] of resumeWinners) {
      allResumeIds.add(resumeId);
      if (winner.best_chunk_id) {
        allChunkIds.add(winner.best_chunk_id);
      }
    }
  }

  // 8. Bulk fetch resume names and chunk texts
  const resumeNameMap = new Map();
  if (allResumeIds.size > 0) {
    const { data: resumes, error: resumeError } = await supabaseAdmin
      .from("resumes")
      .select("id, name")
      .in("id", Array.from(allResumeIds));
    if (resumeError) throw resumeError;

    if (resumes) {
      for (const resume of resumes) {
        resumeNameMap.set(resume.id, resume.name);
      }
    }
  }

  const chunkTextMap = new Map();
  if (allChunkIds.size > 0) {
    const { data: chunks, error: chunkError } = await supabaseAdmin
      .from("resume_chunks")
      .select("id, text")
      .in("id", Array.from(allChunkIds));
    if (chunkError) throw chunkError;

    if (chunks) {
      for (const chunk of chunks) {
        chunkTextMap.set(chunk.id, chunk.text);
      }
    }
  }

  // 9. Build the matrix structure
  const resumeResults = [];
  
  for (const resumeId of allResumeIds) {
    const resumeName = resumeNameMap.get(resumeId) || "Unknown";
    const scores = {};
    
    // For each pill, get the score for this resume
    for (const pill of pills) {
      const resumeWinners = pillResumeWinners.get(pill) || new Map();
      const winner = resumeWinners.get(resumeId);
      
      if (winner) {
        const chunkText = chunkTextMap.get(winner.best_chunk_id) || "";
        scores[pill] = {
          max_sim: winner.max_sim,
          best_chunk_text: chunkText
        };
        
        if (config.includeChunkIds) {
          scores[pill].best_chunk_id = winner.best_chunk_id;
        }
      } else {
        // No match for this pill-resume combination
        scores[pill] = {
          max_sim: 0,
          best_chunk_text: ""
        };
        
        if (config.includeChunkIds) {
          scores[pill].best_chunk_id = undefined;
        }
      }
    }
    
    resumeResults.push({
      resume_id: resumeId,
      resume_name: resumeName,
      scores
    });
  }

  // 10. Sort resumes by overall performance (sum of max similarities)
  resumeResults.sort((a, b) => {
    const aSum = Object.values(a.scores).reduce((sum, score) => sum + score.max_sim, 0);
    const bSum = Object.values(b.scores).reduce((sum, score) => sum + score.max_sim, 0);
    return bSum - aSum;
  });

  // 11. Apply topk limit
  const limitedResults = resumeResults.slice(0, config.topkResumes);

  return {
    pills: pillConfigs.map(pc => ({
      pill: pc.pill,
      variants: pc.variants
    })),
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
    const result = await pillMatrixSearch(config);
    
    console.log(JSON.stringify(result, null, config.pretty ? 2 : 0));
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();

