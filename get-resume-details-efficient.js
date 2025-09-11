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

/**
 * Get detailed pill results for a specific resume - EFFICIENT VERSION
 * @param {string} resumeId - The resume ID to get details for
 * @param {Array} pills - Array of pill objects with 'pill' property
 * @param {number} resultsPerPill - Number of results to return per pill (default: 3)
 * @returns {Object} Detailed results in the same format as multi-search
 */
export async function getResumeDetailsEfficient(resumeId, pills, resultsPerPill = 3) {
  try {
    // Validate inputs
    if (!resumeId || !pills || !Array.isArray(pills) || pills.length === 0) {
      throw new Error('Invalid inputs: resumeId and pills array are required');
    }

    if (pills.length > 20) {
      throw new Error('Maximum 20 pills allowed');
    }

    // Validate pill structure
    for (const pill of pills) {
      if (!pill.pill || typeof pill.pill !== 'string') {
        throw new Error('Each pill must have a "pill" string property');
      }
    }

    // Extract pill texts and generate embeddings
    const pillTexts = pills.map(p => p.pill.trim().toLowerCase());
    const allEmbeddings = await embedManyBatched(pillTexts);

    // Convert embeddings to string format for Supabase RPC (same as weighted-pill-search.js)
    const embeddingsForRPC = allEmbeddings.map(embedding => 
      `[${embedding.join(',')}]`
    );

    // Call the efficient RPC function
    const { data: searchResults, error } = await supabaseAdmin.rpc("get_resume_pill_details_efficient", {
      resume_id_param: resumeId,
      pills_embeddings: embeddingsForRPC,
      results_per_pill: resultsPerPill
    });

    if (error) {
      throw new Error(`Supabase RPC error: ${error.message}`);
    }

    if (!searchResults || searchResults.length === 0) {
      return {
        pills: pills.map(p => p.pill),
        resumes: [{
          resume_id: resumeId,
          resume_name: "Unknown",
          pdf_url: null,
          scores: {}
        }],
        nrOfResults: resultsPerPill
      };
    }

    // Group results by pill
    const resumeData = {
      resume_id: searchResults[0].resume_id,
      resume_name: searchResults[0].resume_name,
      pdf_url: searchResults[0].pdf_url,
      scores: {}
    };

    // Initialize scores for all pills
    for (const pill of pills) {
      resumeData.scores[pill.pill] = { results: [] };
    }

    // Group results by pill_index
    for (const result of searchResults) {
      const pillIndex = result.pill_index - 1; // Convert to 0-based index
      const pillName = pills[pillIndex].pill;
      
      resumeData.scores[pillName].results.push({
        similarity: result.similarity,
        chunk_text: result.chunk_text,
        page_number: result.page_number,
        coordinates: result.coordinates,
        rank: result.rank
      });
    }

    return {
      pills: pills.map(p => p.pill),
      resumes: [resumeData],
      nrOfResults: resultsPerPill
    };

  } catch (error) {
    console.error('Error in getResumeDetailsEfficient:', error);
    throw error;
  }
}
