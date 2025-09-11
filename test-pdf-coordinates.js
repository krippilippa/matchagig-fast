import fs from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { normalizeCanonicalText } from "./canon.js";

// Configure PDF.js for Node.js environment
import { createCanvas, createImageData } from 'canvas';

// Set up PDF.js worker and canvas factory
const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

// Canvas factory for PDF.js
const CanvasFactory = class {
  create(width, height) {
    const canvas = createCanvas(width, height);
    const context = canvas.getContext('2d');
    return {
      canvas,
      context
    };
  }
  
  reset(canvasAndContext, width, height) {
    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
  }
  
  destroy(canvasAndContext) {
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
};

async function extractPDFWithCoordinates(pdfBuffer) {
  console.log('🔍 Extracting PDF with coordinates...');
  
  try {
    // Load PDF document
    const loadingTask = getDocument({
      data: pdfBuffer,
      useSystemFonts: true,
      canvasFactory: new CanvasFactory()
    });
    
    const pdfDocument = await loadingTask.promise;
    console.log(`📄 PDF loaded: ${pdfDocument.numPages} pages`);
    
    const allTextItems = [];
    
    // Process each page
    for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
      console.log(`📖 Processing page ${pageNum}...`);
      
      const page = await pdfDocument.getPage(pageNum);
      const textContent = await page.getTextContent();
      
      // Extract text items with coordinates
      const pageTextItems = textContent.items.map((item, index) => ({
        text: item.str,
        x: item.transform[4], // X coordinate
        y: item.transform[5], // Y coordinate  
        width: item.width,
        height: item.height,
        pageNumber: pageNum,
        itemIndex: index
      })).filter(item => item.text.trim().length > 0);
      
      allTextItems.push(...pageTextItems);
      console.log(`   Found ${pageTextItems.length} text items`);
    }
    
    console.log(`📊 Total text items: ${allTextItems.length}`);
    
    // Show sample items
    console.log('\n📋 Sample text items:');
    allTextItems.slice(0, 5).forEach((item, i) => {
      console.log(`${i + 1}. "${item.text}" at (${item.x.toFixed(1)}, ${item.y.toFixed(1)}) on page ${item.pageNumber}`);
    });
    
    return {
      textItems: allTextItems,
      numPages: pdfDocument.numPages
    };
    
  } catch (error) {
    console.error('❌ PDF parsing error:', error);
    throw error;
  }
}

// Function to create chunks with coordinates
function createChunksWithCoordinates(textItems, windowSize = 130, maxSize = 240) {
  console.log('\n🔧 Creating chunks with coordinates...');
  
  // First, combine all text and normalize it
  const fullText = textItems.map(item => item.text).join(' ');
  const normalizedText = normalizeCanonicalText(fullText, { flatten: 'soft' });
  
  console.log(`📝 Full text length: ${fullText.length} chars`);
  console.log(`🔄 Normalized length: ${normalizedText.length} chars`);
  
  // Create sliding window chunks from normalized text
  const chunks = [];
  const words = normalizedText.split(/\\s+/).filter(w => w.length > 0);
  
  for (let i = 0; i < words.length; i += windowSize) {
    const chunkWords = words.slice(i, Math.min(i + maxSize, words.length));
    const chunkText = chunkWords.join(' ');
    
    if (chunkText.length > 0) {
      // For demo purposes, create approximate coordinates
      // In practice, you'd want to map back to the original text items
      const chunk = {
        text: chunkText,
        pageNumber: 1, // Simplified for now
        coordinates: [{
          x: 100,
          y: 100 + (chunks.length * 20),
          width: 400,
          height: 15
        }]
      };
      
      chunks.push(chunk);
    }
  }
  
  console.log(`📦 Created ${chunks.length} chunks`);
  return chunks;
}

// Test with a sample PDF
async function testCoordinateExtraction() {
  const testFile = './resumes/Resume_SE.pdf';
  
  if (!fs.existsSync(testFile)) {
    console.error('❌ Test file not found:', testFile);
    return;
  }
  
  console.log('🧪 Testing coordinate extraction with:', testFile);
  
  try {
    const pdfBuffer = fs.readFileSync(testFile);
    const result = await extractPDFWithCoordinates(pdfBuffer);
    
    // Create sample chunks
    const chunks = createChunksWithCoordinates(result.textItems);
    
    console.log('\n✅ Coordinate extraction test successful!');
    console.log(`📊 Results: ${result.numPages} pages, ${result.textItems.length} text items, ${chunks.length} chunks`);
    
    // Show sample chunk
    if (chunks.length > 0) {
      console.log('\n📋 Sample chunk:');
      console.log('Text:', chunks[0].text.substring(0, 100) + '...');
      console.log('Page:', chunks[0].pageNumber);
      console.log('Coordinates:', chunks[0].coordinates);
    }
    
    return true;
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return false;
  }
}

// Run the test
testCoordinateExtraction().catch(console.error);
