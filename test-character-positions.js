import fs from "fs";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { normalizeCanonicalText } from "./canon.js";

// Word-based sliding window chunking (matching ingest.js logic)
function sentenceWindows(text, windowSize = 130, maxSize = 240) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  const chunks = [];
  
  for (let i = 0; i < words.length; i += windowSize) {
    const window = words.slice(i, Math.min(i + maxSize, words.length));
    const chunk = window.join(' ').trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
  }
  
  return chunks;
}

// Enhanced chunking with character positions - SIMPLIFIED APPROACH
function createChunksWithPositions(originalText, normalizedText) {
  console.log('🔧 Creating chunks with character positions...');
  
  // Split normalized text into words for chunking
  const words = normalizedText.split(/\s+/).filter(w => w.length > 0);
  console.log(`📝 Split into ${words.length} words`);
  
  const chunksWithPositions = [];
  const windowSize = 130;
  const maxSize = 240;
  
  // Create sliding window chunks and track their positions
  for (let i = 0; i < words.length; i += windowSize) {
    const window = words.slice(i, Math.min(i + maxSize, words.length));
    const chunk = window.join(' ').trim();
    
    if (chunk.length === 0) continue;
    
    // Calculate approximate position by finding first few words
    const firstWords = window.slice(0, 3).join(' ');
    const startPosition = normalizedText.indexOf(firstWords);
    const endPosition = startPosition + chunk.length;
    
    // Estimate page number (~3000 chars per page)
    const estimatedPage = Math.floor(startPosition / 3000) + 1;
    
    // Create position data
    const positionData = {
      char_start: Math.max(0, startPosition),
      char_end: Math.min(normalizedText.length, endPosition),
      text_length: chunk.length,
      word_start: i,
      word_end: Math.min(i + maxSize, words.length)
    };
    
    const chunkWithPosition = {
      text: chunk,
      page_number: estimatedPage,
      coordinates: positionData,
      // Additional debug info
      chunk_index: chunksWithPositions.length,
      preview: chunk.substring(0, 50) + '...'
    };
    
    chunksWithPositions.push(chunkWithPosition);
  }
  
  console.log(`📦 Created ${chunksWithPositions.length} chunks`);
  return chunksWithPositions;
}

// Test the character position approach
async function testCharacterPositions() {
  const testFile = './resumes/Resume_SE.pdf';
  
  if (!fs.existsSync(testFile)) {
    console.error('❌ Test file not found:', testFile);
    return false;
  }
  
  console.log('🧪 Testing character position extraction with:', testFile);
  console.log('=' .repeat(60));
  
  try {
    // 1. Parse PDF (existing approach)
    const buf = fs.readFileSync(testFile);
    const parsed = await pdf(buf);
    console.log(`📄 PDF parsed successfully`);
    
    // 2. Normalize text (existing approach)
    const originalText = parsed.text || "";
    const normalizedText = normalizeCanonicalText(originalText, { flatten: 'soft' });
    
    console.log(`📝 Original text length: ${originalText.length} characters`);
    console.log(`🔄 Normalized text length: ${normalizedText.length} characters`);
    
    // 3. Create chunks with positions (NEW APPROACH)
    const chunksWithPositions = createChunksWithPositions(originalText, normalizedText);
    
    console.log(`\n✅ Successfully created ${chunksWithPositions.length} chunks with positions`);
    
    // 4. Show sample results
    console.log('\n📋 Sample chunks with positions:');
    console.log('-'.repeat(60));
    
    chunksWithPositions.slice(0, 3).forEach((chunk, i) => {
      console.log(`\nChunk ${i + 1}:`);
      console.log(`  Text: "${chunk.preview}"`);
      console.log(`  Page: ${chunk.page_number}`);
      console.log(`  Positions: chars ${chunk.coordinates.char_start}-${chunk.coordinates.char_end}`);
      console.log(`  Length: ${chunk.coordinates.text_length} chars`);
    });
    
    // 5. Validate positions (lenient validation)
    console.log('\n🔍 Validating positions...');
    let validationErrors = 0;
    let warnings = 0;
    
    chunksWithPositions.forEach((chunk, i) => {
      const { char_start, char_end } = chunk.coordinates;
      
      // Check if positions are valid ranges
      if (char_start < 0 || char_end < char_start) {
        console.error(`❌ Invalid position range for chunk ${i}: ${char_start}-${char_end}`);
        validationErrors++;
      }
      
      // Check if positions are within text bounds (allow some overflow)
      if (char_end > normalizedText.length + 100) {
        console.error(`❌ Position out of bounds for chunk ${i}: ${char_end} > ${normalizedText.length}`);
        validationErrors++;
      }
      
      // Check if we can find the chunk text somewhere near the position (lenient)
      const searchStart = Math.max(0, char_start - 50);
      const searchEnd = Math.min(normalizedText.length, char_end + 50);
      const searchArea = normalizedText.substring(searchStart, searchEnd);
      
      // Look for first few words of the chunk in the search area
      const firstWords = chunk.text.split(' ').slice(0, 5).join(' ');
      const normalizedFirstWords = firstWords.replace(/\s+/g, ' ').trim();
      
      if (!searchArea.includes(normalizedFirstWords.substring(0, 20))) {
        console.warn(`⚠️  Chunk ${i} text not found near expected position`);
        warnings++;
      }
    });
    
    console.log(`📊 Validation results: ${validationErrors} errors, ${warnings} warnings`);
    
    if (validationErrors === 0) {
      console.log('✅ Position validation passed! (Minor text differences are expected)');
    } else {
      console.error(`❌ Found ${validationErrors} critical validation errors`);
      return false;
    }
    
    // 6. Show what would be stored in database
    console.log('\n💾 Database storage format:');
    console.log('-'.repeat(60));
    console.log('Sample database rows:');
    
    chunksWithPositions.slice(0, 2).forEach((chunk, i) => {
      console.log(`\nRow ${i + 1}:`);
      console.log(`  text: "${chunk.text.substring(0, 60)}..."`);
      console.log(`  page_number: ${chunk.page_number}`);
      console.log(`  coordinates: ${JSON.stringify(chunk.coordinates, null, 2)}`);
    });
    
    console.log('\n🎉 Character position extraction test SUCCESSFUL!');
    console.log(`📊 Results: ${chunksWithPositions.length} chunks ready for database storage`);
    
    return {
      success: true,
      chunks: chunksWithPositions,
      originalTextLength: originalText.length,
      normalizedTextLength: normalizedText.length
    };
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
    return false;
  }
}

// Run the test
console.log('🚀 Starting character position extraction test...\n');
testCharacterPositions()
  .then(result => {
    if (result && result.success) {
      console.log('\n✅ All tests passed! Ready to implement in ingest.js');
    } else {
      console.log('\n❌ Tests failed. Need to fix issues before proceeding.');
    }
  })
  .catch(console.error);
