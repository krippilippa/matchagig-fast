import { pillMatrixSearch } from './pill-search-logic.js';

// Temporarily add debug logging to see what chunks are actually found
async function debugRealSearch() {
  console.log('🔍 Debug: Real search with embeddings...');
  
  const searchPayload = [{ pill: "software development" }];
  const options = { topkResumes: 1, includeChunkIds: true };
  
  console.log('📤 Search request:', searchPayload);
  
  try {
    const result = await pillMatrixSearch(searchPayload, options);
    
    console.log('\n📊 Search Results:');
    console.log(`Resumes found: ${result.resumes.length}`);
    
    if (result.resumes.length > 0) {
      const resume = result.resumes[0];
      console.log(`\n📄 Resume: ${resume.resume_name}`);
      
      Object.entries(resume.scores).forEach(([pill, score]) => {
        console.log(`\n🎯 Pill: ${pill}`);
        console.log(`  Similarity: ${score.max_sim}`);
        console.log(`  Chunk ID: ${score.best_chunk_id || 'NOT PROVIDED'}`);
        console.log(`  Text: "${score.best_chunk_text.substring(0, 50)}..."`);
        console.log(`  Page: ${score.page_number}`);
        console.log(`  Coordinates: ${score.coordinates ? JSON.stringify(score.coordinates) : 'NULL'}`);
        
        // If we have chunk ID, let's verify it exists with coordinates
        if (score.best_chunk_id) {
          console.log(`\n🔍 Verifying chunk ${score.best_chunk_id}...`);
        }
      });
    }
    
    console.log('\n📋 Full response (truncated):');
    const truncatedResult = {
      ...result,
      resumes: result.resumes.map(r => ({
        ...r,
        scores: Object.fromEntries(
          Object.entries(r.scores).map(([pill, score]) => [
            pill, 
            {
              max_sim: score.max_sim,
              has_text: !!score.best_chunk_text,
              has_page: score.page_number !== null,
              has_coordinates: !!score.coordinates,
              chunk_id: score.best_chunk_id
            }
          ])
        )
      }))
    };
    
    console.log(JSON.stringify(truncatedResult, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  }
}

debugRealSearch().catch(console.error);
