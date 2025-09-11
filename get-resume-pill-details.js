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
 * Get detailed pill results for a specific resume
 * @param {string} resumeId - The resume ID to get details for
 * @param {Array} pills - Array of pill objects with 'pill' and 'weight' properties
 * @param {number} resultsPerPill - Number of results to return per pill (default: 3)
 * @returns {Object} Detailed results for the resume and pills
 */
async function getResumePillDetails(resumeId, pills, resultsPerPill = 3) {
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
      if (pill.weight !== undefined && (typeof pill.weight !== 'number' || pill.weight < 0.1 || pill.weight > 2.0)) {
        throw new Error('Pill weight must be a number between 0.1 and 2.0');
      }
    }

    // Set default weights
    const pillsWithWeights = pills.map(pill => ({
      pill: pill.pill,
      weight: pill.weight || 1.0
    }));

    // Generate embeddings for all pills
    const pillTexts = pillsWithWeights.map(p => p.pill.trim().toLowerCase());
    const allEmbeddings = await embedManyBatched(pillTexts);
    const weights = pillsWithWeights.map(p => p.weight);

    // Convert embeddings to string format for Supabase RPC
    const embeddingsForRPC = allEmbeddings.map(embedding => 
      `[${embedding.join(',')}]`
    );

    // Call the RPC function
    const { data: searchResults, error } = await supabaseAdmin.rpc("get_resume_pill_details", {
      resume_id_param: resumeId,
      pills_embeddings: embeddingsForRPC,
      pills_weights: weights,
      results_per_pill: resultsPerPill
    });

    if (error) {
      throw new Error(`Supabase RPC error: ${error.message}`);
    }

    if (!searchResults || searchResults.length === 0) {
      return {
        resume_id: resumeId,
        resume_name: "Unknown",
        pdf_url: null,
        pill_scores: {},
        pill_chunks: {},
        num_results_per_pill: resultsPerPill,
        message: "No results found for this resume"
      };
    }

    const result = searchResults[0];

    return {
      resume_id: result.resume_id,
      resume_name: result.resume_name,
      pdf_url: result.pdf_url,
      pill_scores: result.pill_scores,
      pill_chunks: result.pill_chunks,
      num_results_per_pill: result.num_results_per_pill
    };

  } catch (error) {
    console.error('Error in getResumePillDetails:', error);
    throw error;
  }
}

export { getResumePillDetails };
