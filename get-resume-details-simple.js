import { pillMatrixSearchMulti } from './pill-search-logic-multi.js';

/**
 * Get detailed pill results for a specific resume - SIMPLE VERSION
 * Just uses existing multi-search and filters for the specific resume
 */
export async function getResumeDetailsSimple(resumeId, pills, resultsPerPill = 3) {
  // Use the existing multi-search function
  const result = await pillMatrixSearchMulti(pills, {
    topkResumes: 999999, // Get all resumes
    nrOfResults: resultsPerPill,
    includeChunkIds: false
  });

  // Filter to only return the specific resume
  const filteredResumes = result.resumes.filter(resume => resume.resume_id === resumeId);

  return {
    pills: result.pills,
    resumes: filteredResumes,
    nrOfResults: resultsPerPill
  };
}
