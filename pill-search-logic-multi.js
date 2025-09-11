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

// Main pill matrix search logic that returns multiple results per pill-resume combination
export async function pillMatrixSearchMulti(pillsInput, options = {}) {
  const {
    topkResumes = 999999,
    nrOfResults = 1,  // 1, 2, or 3
    includeChunkIds = false
  } = options;

  if (!pillsInput || pillsInput.length === 0) {
    return {
      pills: [],
      resumes: []
    };
  }

  // Validate nrOfResults
  if (nrOfResults < 1 || nrOfResults > 3) {
    throw new Error('nrOfResults must be between 1 and 3');
  }

  // Extract and normalize pills
  const pills = pillsInput.map(pillInput => pillInput.pill.trim().toLowerCase());
  
  // Batch embed all pills
  const allEmbeddings = await embedManyBatched(pills);
  const pillEmbeddingMap = new Map();
  
  for (let i = 0; i < pills.length; i++) {
    pillEmbeddingMap.set(pillsInput[i].pill, allEmbeddings[i]);
  }

  // For each pill, call topk_per_resume RPC to get multiple chunks per resume
  const pillResumeResults = new Map(); // pill -> Map(resume_id -> [results])
  
  for (const pillInput of pillsInput) {
    const pill = pillInput.pill;
    const embedding = pillEmbeddingMap.get(pill);
    
    const { data: ranked, error } = await supabaseAdmin.rpc("topk_per_resume", { 
      q: embedding, 
      k: nrOfResults 
    });
    if (error) throw error;
    
    // Group results by resume_id and sort by rank
    const resumeResults = new Map();
    if (ranked) {
      for (const row of ranked) {
        if (!resumeResults.has(row.resume_id)) {
          resumeResults.set(row.resume_id, []);
        }
        resumeResults.get(row.resume_id).push({
          chunk_id: row.chunk_id,
          similarity: row.similarity,
          rank: row.rank,
          text: row.text,
          page_number: row.page_number,
          coordinates: row.coordinates
        });
      }
    }
    
    pillResumeResults.set(pill, resumeResults);
  }

  // Collect all unique resume IDs
  const allResumeIds = new Set();
  for (const [pill, resumeResults] of pillResumeResults) {
    for (const resumeId of resumeResults.keys()) {
      allResumeIds.add(resumeId);
    }
  }

  // Bulk fetch resume names and PDF URLs
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

  // Build the matrix structure
  const pillNames = pillsInput.map(pi => pi.pill);
  const resumeResults = [];
  
  for (const resumeId of allResumeIds) {
    const resumeName = resumeNameMap.get(resumeId) || "Unknown";
    const resumePdfUrl = resumePdfUrlMap.get(resumeId) || null;
    const scores = {};
    
    // For each pill, get the results for this resume
    for (const pill of pillNames) {
      const resumeResults = pillResumeResults.get(pill) || new Map();
      const results = resumeResults.get(resumeId) || [];
      
      if (results.length > 0) {
        // Sort by rank to ensure proper order
        results.sort((a, b) => a.rank - b.rank);
        
        // Always return array of results for consistency
        scores[pill] = {
          results: results.map(result => ({
            similarity: result.similarity,
            chunk_text: result.text,
            page_number: result.page_number,
            coordinates: result.coordinates,
            rank: result.rank,
            ...(includeChunkIds && { chunk_id: result.chunk_id })
          }))
        };
      } else {
        // No match for this pill-resume combination
        scores[pill] = {
          results: []
        };
      }
    }
    
    resumeResults.push({
      resume_id: resumeId,
      resume_name: resumeName,
      pdf_url: resumePdfUrl,
      scores
    });
  }

  // Sort resumes by overall performance (sum of best similarities)
  resumeResults.sort((a, b) => {
    const aSum = Object.values(a.scores).reduce((sum, score) => {
      return sum + (score.results.length > 0 ? score.results[0].similarity : 0);
    }, 0);
    
    const bSum = Object.values(b.scores).reduce((sum, score) => {
      return sum + (score.results.length > 0 ? score.results[0].similarity : 0);
    }, 0);
    
    return bSum - aSum;
  });

  // Apply topk limit
  const limitedResults = resumeResults.slice(0, topkResumes);

  return {
    pills: pillsInput.map(pi => pi.pill),
    resumes: limitedResults,
    nrOfResults: nrOfResults
  };
}
