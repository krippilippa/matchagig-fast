import { supabaseAdmin } from './supabase.js';

// Simplified version of the search logic with debug logging
async function debugDetailedSearch() {
  console.log('🔍 Detailed search debug...');
  
  const pillsInput = [{ pill: "software development" }];
  const pills = pillsInput.map(pillInput => pillInput.pill.trim().toLowerCase());
  
  console.log('📝 Pills to search:', pills);
  
  // Step 1: Get embeddings (we'll skip this and just get all chunks for debugging)
  console.log('\n1. Testing chunk finding logic...');
  
  // Simulate finding some chunks (get real chunks from database)
  const { data: sampleChunks, error } = await supabaseAdmin
    .from('resume_chunks')
    .select('id, resume_id, text')
    .limit(5);
    
  if (error) {
    console.error('Error getting sample chunks:', error);
    return;
  }
  
  console.log(`Found ${sampleChunks.length} sample chunks`);
  
  // Step 2: Simulate the pillResumeWinners structure
  const pillResumeWinners = new Map();
  const resumeWinners = new Map();
  
  // Add first chunk as a "winner" for testing
  const testChunk = sampleChunks[0];
  resumeWinners.set(testChunk.resume_id, {
    max_sim: 0.85,
    best_chunk_id: testChunk.id
  });
  
  pillResumeWinners.set('software development', resumeWinners);
  
  console.log('\n2. Simulated winners:');
  console.log(`  Resume: ${testChunk.resume_id}`);
  console.log(`  Chunk ID: ${testChunk.id}`);
  
  // Step 3: Collect chunk IDs (like in real search)
  const allChunkIds = new Set();
  for (const [pill, resumeWinners] of pillResumeWinners) {
    for (const [resumeId, winner] of resumeWinners) {
      if (winner.best_chunk_id) {
        allChunkIds.add(winner.best_chunk_id);
      }
    }
  }
  
  console.log('\n3. Collected chunk IDs:', Array.from(allChunkIds));
  
  // Step 4: Fetch chunk data (like in real search)
  const chunkDataMap = new Map();
  if (allChunkIds.size > 0) {
    console.log('\n4. Fetching chunk data...');
    
    const { data: chunks, error: chunkError } = await supabaseAdmin
      .from("resume_chunks")
      .select("id, text, page_number, coordinates")
      .in("id", Array.from(allChunkIds));
    
    if (chunkError) {
      console.error('❌ Error fetching chunks:', chunkError);
      return;
    }
    
    console.log(`   Fetched ${chunks.length} chunks`);
    
    if (chunks) {
      for (const chunk of chunks) {
        console.log(`   Chunk ${chunk.id}:`);
        console.log(`     Text: "${chunk.text.substring(0, 40)}..."`);
        console.log(`     Page: ${chunk.page_number}`);
        console.log(`     Coordinates: ${chunk.coordinates ? 'YES' : 'NO'}`);
        
        chunkDataMap.set(chunk.id, {
          text: chunk.text,
          page_number: chunk.page_number,
          coordinates: chunk.coordinates
        });
      }
    }
  }
  
  console.log(`\n5. ChunkDataMap size: ${chunkDataMap.size}`);
  
  // Step 5: Build response (like in real search)
  const testResumeId = testChunk.resume_id;
  const resumeWinnersForTest = pillResumeWinners.get('software development');
  const winner = resumeWinnersForTest.get(testResumeId);
  
  console.log('\n6. Building response...');
  console.log(`   Winner: ${JSON.stringify(winner)}`);
  
  if (winner) {
    const chunkData = chunkDataMap.get(winner.best_chunk_id);
    console.log(`   ChunkData: ${chunkData ? 'FOUND' : 'NOT FOUND'}`);
    
    if (chunkData) {
      console.log(`   ChunkData details:`, {
        hasText: !!chunkData.text,
        hasPage: chunkData.page_number !== null,
        hasCoords: !!chunkData.coordinates
      });
      
      const score = {
        max_sim: winner.max_sim,
        best_chunk_text: chunkData.text || "",
        page_number: chunkData.page_number || null,
        coordinates: chunkData.coordinates || null
      };
      
      console.log('\n7. Final score object:');
      console.log(JSON.stringify(score, null, 2));
      
      if (score.coordinates) {
        console.log('✅ SUCCESS: Coordinates would be returned!');
      } else {
        console.log('❌ PROBLEM: No coordinates in final response');
      }
    }
  }
}

debugDetailedSearch().catch(console.error);
