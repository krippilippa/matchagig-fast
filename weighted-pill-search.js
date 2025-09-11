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

// Main weighted pill search function
export async function weightedPillSearch(pillsWithWeights, options = {}) {
  const {
    top_k = 100,
    offset = 0,
    includeResumeData = true
  } = options;

  if (!pillsWithWeights || pillsWithWeights.length === 0) {
    return {
      results: [],
      total_results: 0,
      page: Math.floor(offset / top_k) + 1,
      has_more: false
    };
  }

  // Validate input
  if (pillsWithWeights.length > 20) {
    throw new Error('Maximum 20 pills allowed');
  }

  // Extract pills and weights
  const pills = pillsWithWeights.map(p => p.pill.trim().toLowerCase());
  const weights = pillsWithWeights.map(p => p.weight || 1.0);
  
  // Validate weights
  for (const weight of weights) {
    if (weight < 0.1 || weight > 2.0) {
      throw new Error('Weights must be between 0.1 and 2.0');
    }
  }

  // Batch embed all pills
  const allEmbeddings = await embedManyBatched(pills);
  
  // Call the weighted search RPC function
  // Convert embeddings to the format Supabase expects
  const embeddingsForRPC = allEmbeddings.map(embedding => 
    `[${embedding.join(',')}]`
  );
  
  const { data: searchResults, error } = await supabaseAdmin.rpc("weighted_pill_search_with_chunks", {
    pills_embeddings: embeddingsForRPC,
    pills_weights: weights,
    top_k: top_k,
    offset_k: offset
  });

  if (error) throw error;

  if (!searchResults || searchResults.length === 0) {
    return {
      results: [],
      total_results: 0,
      page: Math.floor(offset / top_k) + 1,
      has_more: false
    };
  }

  // If we need resume data, fetch it
  let resumeDataMap = new Map();
  if (includeResumeData) {
    const resumeIds = searchResults.map(r => r.resume_id);
    const { data: resumes, error: resumeError } = await supabaseAdmin
      .from("resumes")
      .select("id, name, pdf_url")
      .in("id", resumeIds);
    
    if (resumeError) throw resumeError;
    
    if (resumes) {
      for (const resume of resumes) {
        resumeDataMap.set(resume.id, {
          name: resume.name,
          pdf_url: resume.pdf_url
        });
      }
    }
  }

  // Format results
  const formattedResults = searchResults.map(result => {
    const resumeData = resumeDataMap.get(result.resume_id);
    
    return {
      resume_id: result.resume_id,
      resume_name: resumeData?.name || "Unknown",
      pdf_url: resumeData?.pdf_url || null,
      weighted_score: result.weighted_score,
      pill_scores: result.pill_scores,
      pill_chunks: result.pill_chunks,
      rank: result.rank
    };
  });

  // Determine if there are more results
  const hasMore = searchResults.length === top_k;

  return {
    results: formattedResults,
    total_results: searchResults.length + offset, // Approximate total
    page: Math.floor(offset / top_k) + 1,
    has_more: hasMore,
    pills: pillsWithWeights.map(p => p.pill),
    weights: weights
  };
}
