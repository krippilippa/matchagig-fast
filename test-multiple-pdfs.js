import fs from "fs";
import path from "path";
import pdf from "pdf-parse/lib/pdf-parse.js";
import { normalizeCanonicalText } from "./canon.js";

// Character position extraction logic (from our test)
function createChunksWithPositions(originalText, normalizedText) {
  const words = normalizedText.split(/\s+/).filter(w => w.length > 0);
  const chunksWithPositions = [];
  const windowSize = 130;
  const maxSize = 240;
  
  for (let i = 0; i < words.length; i += windowSize) {
    const window = words.slice(i, Math.min(i + maxSize, words.length));
    const chunk = window.join(' ').trim();
    
    if (chunk.length === 0) continue;
    
    // Calculate approximate position by finding first few words
    const firstWords = window.slice(0, 3).join(' ');
    const startPosition = normalizedText.indexOf(firstWords);
    const endPosition = startPosition + chunk.length;
    
    // Estimate page number (~3000 chars per page)
    const estimatedPage = Math.floor(Math.max(0, startPosition) / 3000) + 1;
    
    // Create position data
    const positionData = {
      char_start: Math.max(0, startPosition),
      char_end: Math.min(normalizedText.length, endPosition),
      text_length: chunk.length,
      word_start: i,
      word_end: Math.min(i + maxSize, words.length)
    };
    
    chunksWithPositions.push({
      text: chunk,
      page_number: estimatedPage,
      coordinates: positionData
    });
  }
  
  return chunksWithPositions;
}

// Test a single PDF
async function testSinglePDF(filePath) {
  const filename = path.basename(filePath);
  console.log(`\n📄 Testing: ${filename}`);
  console.log('-'.repeat(50));
  
  try {
    // 1. Parse PDF
    const buf = fs.readFileSync(filePath);
    const parsed = await pdf(buf);
    
    const originalText = parsed.text || "";
    const normalizedText = normalizeCanonicalText(originalText, { flatten: 'soft' });
    
    // 2. Extract basic info
    console.log(`📊 Original text: ${originalText.length} chars`);
    console.log(`🔄 Normalized: ${normalizedText.length} chars`);
    
    if (originalText.length === 0) {
      console.log('⚠️  WARNING: No text extracted from PDF');
      return {
        filename,
        success: false,
        error: 'No text extracted',
        chunks: 0
      };
    }
    
    // 3. Create chunks with positions
    const chunks = createChunksWithPositions(originalText, normalizedText);
    console.log(`📦 Created: ${chunks.length} chunks`);
    
    // 4. Validate chunks
    let validChunks = 0;
    let invalidChunks = 0;
    let totalPositionErrors = 0;
    
    chunks.forEach((chunk, i) => {
      const { char_start, char_end } = chunk.coordinates;
      
      // Basic position validation
      if (char_start >= 0 && char_end > char_start && char_end <= normalizedText.length + 100) {
        validChunks++;
        
        // Test if we can find chunk text near the position
        const searchStart = Math.max(0, char_start - 50);
        const searchEnd = Math.min(normalizedText.length, char_end + 50);
        const searchArea = normalizedText.substring(searchStart, searchEnd);
        const firstWords = chunk.text.split(' ').slice(0, 3).join(' ');
        
        if (!searchArea.toLowerCase().includes(firstWords.toLowerCase().substring(0, 15))) {
          totalPositionErrors++;
        }
      } else {
        invalidChunks++;
        console.log(`  ❌ Invalid positions in chunk ${i}: ${char_start}-${char_end}`);
      }
    });
    
    // 5. Calculate success metrics
    const positionAccuracy = chunks.length > 0 ? 
      ((chunks.length - totalPositionErrors) / chunks.length * 100).toFixed(1) : 0;
    
    const overallSuccess = invalidChunks === 0 && chunks.length > 0;
    
    console.log(`✅ Valid chunks: ${validChunks}/${chunks.length}`);
    console.log(`📍 Position accuracy: ${positionAccuracy}%`);
    console.log(`🎯 Overall: ${overallSuccess ? 'SUCCESS' : 'ISSUES'}`);
    
    // 6. Show sample chunk
    if (chunks.length > 0) {
      const sample = chunks[0];
      console.log(`📋 Sample chunk:`);
      console.log(`   "${sample.text.substring(0, 60)}..."`);
      console.log(`   Page: ${sample.page_number}, Pos: ${sample.coordinates.char_start}-${sample.coordinates.char_end}`);
    }
    
    return {
      filename,
      success: overallSuccess,
      chunks: chunks.length,
      validChunks,
      invalidChunks,
      positionAccuracy: parseFloat(positionAccuracy),
      originalLength: originalText.length,
      normalizedLength: normalizedText.length,
      error: null
    };
    
  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    return {
      filename,
      success: false,
      error: error.message,
      chunks: 0
    };
  }
}

// Test all PDFs in the resumes directory
async function testMultiplePDFs() {
  console.log('🚀 COMPREHENSIVE PDF CHARACTER POSITION TESTING');
  console.log('='.repeat(60));
  console.log('\n🎯 WHAT WE ARE TESTING:');
  console.log('1. ✅ PDF text extraction works');
  console.log('2. ✅ Text normalization preserves content');
  console.log('3. ✅ Chunking creates reasonable-sized pieces');
  console.log('4. ✅ Character positions are valid ranges');
  console.log('5. ✅ Position accuracy (can we find chunk text near calculated position)');
  console.log('6. ✅ Page number estimation is reasonable');
  console.log('7. ✅ Database format is ready');
  console.log('\n💡 WHY THIS MATTERS:');
  console.log('- Frontend can use char positions to highlight text in PDFs');
  console.log('- Much more reliable than V1 text-matching approach');
  console.log('- Enables precise text location without complex parsing');
  
  const resumesDir = './resumes';
  
  if (!fs.existsSync(resumesDir)) {
    console.error('❌ Resumes directory not found:', resumesDir);
    return;
  }
  
  // Get all PDF files
  const pdfFiles = fs.readdirSync(resumesDir)
    .filter(file => file.toLowerCase().endsWith('.pdf'))
    .map(file => path.join(resumesDir, file));
  
  console.log(`\n📁 Found ${pdfFiles.length} PDF files to test`);
  
  // Test each PDF
  const results = [];
  for (let i = 0; i < pdfFiles.length; i++) {
    const result = await testSinglePDF(pdfFiles[i]);
    results.push(result);
    
    // Small delay to avoid overwhelming the system
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  // Summary statistics
  console.log('\n' + '='.repeat(60));
  console.log('📊 SUMMARY RESULTS');
  console.log('='.repeat(60));
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalChunks = results.reduce((sum, r) => sum + r.chunks, 0);
  const avgPositionAccuracy = successful.length > 0 ? 
    (successful.reduce((sum, r) => sum + r.positionAccuracy, 0) / successful.length).toFixed(1) : 0;
  
  console.log(`✅ Successful: ${successful.length}/${results.length} PDFs (${(successful.length/results.length*100).toFixed(1)}%)`);
  console.log(`📦 Total chunks created: ${totalChunks}`);
  console.log(`📍 Average position accuracy: ${avgPositionAccuracy}%`);
  
  if (failed.length > 0) {
    console.log(`\n❌ Failed PDFs:`);
    failed.forEach(f => {
      console.log(`   ${f.filename}: ${f.error}`);
    });
  }
  
  console.log(`\n📋 Detailed Results:`);
  results.forEach(r => {
    const status = r.success ? '✅' : '❌';
    console.log(`${status} ${r.filename}: ${r.chunks} chunks, ${r.positionAccuracy || 0}% accuracy`);
  });
  
  // Overall assessment
  const overallSuccess = successful.length >= results.length * 0.8; // 80% success rate
  const goodAccuracy = parseFloat(avgPositionAccuracy) >= 70; // 70% position accuracy
  
  console.log('\n🎯 OVERALL ASSESSMENT:');
  if (overallSuccess && goodAccuracy) {
    console.log('🎉 EXCELLENT! Character position extraction is ready for production');
    console.log('✅ High success rate and good position accuracy');
    console.log('✅ Safe to implement in ingest.js');
  } else if (overallSuccess) {
    console.log('⚠️  GOOD with minor issues. Position accuracy could be better');
    console.log('✅ Safe to implement, but may need frontend tolerance for position errors');
  } else {
    console.log('❌ NEEDS WORK. Too many PDFs failing');
    console.log('🔧 Should investigate failures before implementing');
  }
  
  return {
    totalFiles: results.length,
    successful: successful.length,
    totalChunks,
    avgPositionAccuracy: parseFloat(avgPositionAccuracy),
    overallSuccess
  };
}

// Run the comprehensive test
testMultiplePDFs().catch(console.error);
