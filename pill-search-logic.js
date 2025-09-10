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

// Main pill matrix search logic that takes pills as input
export async function pillMatrixSearch(pillsInput, options = {}) {
  const {
    topkResumes = 999999,
    includeChunkIds = false
  } = options;

  if (!pillsInput || pillsInput.length === 0) {
    return {
      pills: [],
      resumes: []
    };
  }

  // Extract and normalize pills
  const pills = pillsInput.map(pillInput => pillInput.pill.trim().toLowerCase());
  
  // Batch embed all pills
  const allEmbeddings = await embedManyBatched(pills);
  const pillEmbeddingMap = new Map();
  
  for (let i = 0; i < pills.length; i++) {
    pillEmbeddingMap.set(pillsInput[i].pill, allEmbeddings[i]);
  }

  // For each pill, call best_per_resume RPC
  const pillResumeWinners = new Map(); // pill -> Map(resume_id -> {max_sim, best_chunk_id})
  
  for (const pillInput of pillsInput) {
    const pill = pillInput.pill;
    const embedding = pillEmbeddingMap.get(pill);
    
    const { data: ranked, error } = await supabaseAdmin.rpc("best_per_resume", { q: embedding });
    if (error) throw error;
    
    const resumeWinners = new Map();
    if (ranked) {
      for (const row of ranked) {
        resumeWinners.set(row.resume_id, {
          max_sim: row.similarity,
          best_chunk_id: row.best_chunk_id
        });
      }
    }
    
    pillResumeWinners.set(pill, resumeWinners);
  }

  // Collect all unique resume IDs and chunk IDs
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

  // Bulk fetch resume names, PDF URLs and chunk texts
  const resumeNameMap = new Map();
  const resumePdfUrlMap = new Map();
  if (allResumeIds.size > 0) {
    const { data: resumes, error: resumeError } = await supabaseAdmin
      .from("resumes")
      .select("id, name, pdf_url")
      .in("id", Array.from(allResumeIds));
    if (resumeError) throw resumeError;

    if (resumes) {
      for (const resume of resumes) {
        resumeNameMap.set(resume.id, resume.name);
        resumePdfUrlMap.set(resume.id, resume.pdf_url);
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

  // Build the matrix structure
  const pillNames = pillsInput.map(pi => pi.pill);
  const resumeResults = [];
  
  for (const resumeId of allResumeIds) {
    const resumeName = resumeNameMap.get(resumeId) || "Unknown";
    const resumePdfUrl = resumePdfUrlMap.get(resumeId) || null;
    const scores = {};
    
    // For each pill, get the score for this resume
    for (const pill of pillNames) {
      const resumeWinners = pillResumeWinners.get(pill) || new Map();
      const winner = resumeWinners.get(resumeId);
      
      if (winner) {
        const chunkText = chunkTextMap.get(winner.best_chunk_id) || "";
        scores[pill] = {
          max_sim: winner.max_sim,
          best_chunk_text: chunkText
        };
        
        if (includeChunkIds) {
          scores[pill].best_chunk_id = winner.best_chunk_id;
        }
      } else {
        // No match for this pill-resume combination
        scores[pill] = {
          max_sim: 0,
          best_chunk_text: ""
        };
        
        if (includeChunkIds) {
          scores[pill].best_chunk_id = undefined;
        }
      }
    }
    
    resumeResults.push({
      resume_id: resumeId,
      resume_name: resumeName,
      pdf_url: resumePdfUrl,
      scores
    });
  }

  // Sort resumes by overall performance (sum of max similarities)
  resumeResults.sort((a, b) => {
    const aSum = Object.values(a.scores).reduce((sum, score) => sum + score.max_sim, 0);
    const bSum = Object.values(b.scores).reduce((sum, score) => sum + score.max_sim, 0);
    return bSum - aSum;
  });

  // Apply topk limit
  const limitedResults = resumeResults.slice(0, topkResumes);

  return {
    pills: pillsInput.map(pi => pi.pill),
    resumes: limitedResults
  };
}
