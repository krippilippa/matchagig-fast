import { pillMatrixSearch } from './pill-search-logic.js';

async function testSearchAPI() {
  console.log('🔍 Testing search API with coordinates...');
  console.log('='.repeat(50));
  
  // Test search payload
  const searchPayload = [
    { pill: "software development" },
    { pill: "sales experience" }
  ];
  
  const options = {
    topkResumes: 3,
    includeChunkIds: false
  };
  
  try {
    console.log('📤 Search request:');
    console.log('Pills:', searchPayload.map(p => p.pill));
    console.log('Options:', options);
    
    // Call the search function directly
    const result = await pillMatrixSearch(searchPayload, options);
    
    console.log('\n📊 Search Results:');
    console.log(`Found ${result.resumes.length} resumes`);
    console.log(`Pills searched: ${result.pills.length}`);
    
    if (result.resumes.length > 0) {
      const firstResume = result.resumes[0];
      console.log('\n📄 Sample Resume:');
      console.log(`Name: ${firstResume.resume_name}`);
      console.log(`ID: ${firstResume.resume_id}`);
      console.log(`PDF URL: ${firstResume.pdf_url}`);
      
      console.log('\n🎯 Pill Scores:');
      Object.entries(firstResume.scores).forEach(([pill, score]) => {
        console.log(`\n📌 ${pill}:`);
        console.log(`  Similarity: ${score.max_sim.toFixed(3)}`);
        console.log(`  Text: "${score.best_chunk_text.substring(0, 80)}..."`);
        console.log(`  Page: ${score.page_number}`);
        console.log(`  Coordinates: ${JSON.stringify(score.coordinates, null, 2)}`);
        
        // Check if coordinates are present
        const hasCoords = score.coordinates && score.coordinates.char_start !== undefined;
        console.log(`  Has coordinates: ${hasCoords ? '✅' : '❌'}`);
      });
      
      // Overall coordinate check
      const allScores = Object.values(firstResume.scores);
      const scoresWithCoords = allScores.filter(s => s.coordinates && s.max_sim > 0);
      console.log(`\n📊 Coordinate Summary:`);
      console.log(`  Scores with matches: ${allScores.filter(s => s.max_sim > 0).length}`);
      console.log(`  Scores with coordinates: ${scoresWithCoords.length}`);
      console.log(`  Coordinate success: ${scoresWithCoords.length > 0 ? '✅' : '❌'}`);
      
    } else {
      console.log('\n⚠️  No resumes found in search results');
    }
    
    // Show the exact response format
    console.log('\n📋 Full API Response Format:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error('❌ Error testing search API:', error.message);
    console.error('Stack:', error.stack);
  }
}

console.log('🚀 Starting search API test...\n');
testSearchAPI().catch(console.error);
