import { supabaseAdmin } from './supabase.js';

async function debugSearch() {
  console.log('🔍 Debug: Checking search logic...');
  
  // Test a simple search to see what chunks are found
  const pills = [{ pill: "software development" }];
  
  // Step 1: Get embeddings (simplified)
  console.log('\n1. Testing pill search...');
  
  // For debugging, let's just check what chunks exist and if they have coordinates
  const { data: allChunks, error: chunkError } = await supabaseAdmin
    .from("resume_chunks")
    .select("id, resume_id, text, page_number, coordinates")
    .limit(10);
  
  if (chunkError) {
    console.error('❌ Error fetching chunks:', chunkError);
    return;
  }
  
  console.log(`\n📦 Found ${allChunks.length} chunks in database:`);
  allChunks.forEach((chunk, i) => {
    console.log(`\nChunk ${i + 1}:`);
    console.log(`  ID: ${chunk.id}`);
    console.log(`  Resume ID: ${chunk.resume_id}`);
    console.log(`  Text: "${chunk.text.substring(0, 40)}..."`);
    console.log(`  Page: ${chunk.page_number}`);
    console.log(`  Has coordinates: ${chunk.coordinates ? 'YES' : 'NO'}`);
    if (chunk.coordinates) {
      console.log(`  Coordinates: ${JSON.stringify(chunk.coordinates)}`);
    }
  });
  
  // Step 2: Test if we can find these chunks by ID
  console.log('\n2. Testing chunk lookup by ID...');
  const testChunkIds = allChunks.map(c => c.id);
  
  const { data: fetchedChunks, error: fetchError } = await supabaseAdmin
    .from("resume_chunks")
    .select("id, text, page_number, coordinates")
    .in("id", testChunkIds);
  
  if (fetchError) {
    console.error('❌ Error fetching chunks by ID:', fetchError);
    return;
  }
  
  console.log(`\n📋 Fetched ${fetchedChunks.length} chunks by ID:`);
  fetchedChunks.forEach((chunk, i) => {
    console.log(`  ${i + 1}. ID: ${chunk.id.substring(0, 8)}... Has coords: ${chunk.coordinates ? 'YES' : 'NO'}`);
  });
  
  // Step 3: Create a chunkDataMap like in the search logic
  console.log('\n3. Testing chunkDataMap creation...');
  const chunkDataMap = new Map();
  
  fetchedChunks.forEach(chunk => {
    chunkDataMap.set(chunk.id, {
      text: chunk.text,
      page_number: chunk.page_number,
      coordinates: chunk.coordinates
    });
  });
  
  console.log(`📊 ChunkDataMap size: ${chunkDataMap.size}`);
  
  // Test getting data from the map
  const testChunkId = fetchedChunks[0]?.id;
  if (testChunkId) {
    const testData = chunkDataMap.get(testChunkId);
    console.log(`\n🧪 Test chunk data retrieval:`);
    console.log(`  Chunk ID: ${testChunkId}`);
    console.log(`  Retrieved data:`, testData);
    console.log(`  Has coordinates: ${testData?.coordinates ? 'YES' : 'NO'}`);
  }
}

debugSearch().catch(console.error);
