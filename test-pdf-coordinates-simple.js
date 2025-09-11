import fs from 'fs';
import { normalizeCanonicalText } from "./canon.js";

// Try a simpler PDF.js approach without canvas dependencies
async function testSimplePDFJS() {
  try {
    // Import PDF.js without canvas
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    
    console.log('🔍 Testing simple PDF.js approach...');
    
    const testFile = './resumes/Resume_SE.pdf';
    if (!fs.existsSync(testFile)) {
      console.error('❌ Test file not found:', testFile);
      return false;
    }
    
    const pdfBuffer = fs.readFileSync(testFile);
    
    // Load PDF without canvas factory
    const loadingTask = pdfjsLib.getDocument({
      data: pdfBuffer,
      useSystemFonts: false,
      disableFontFace: true,
      nativeImageDecoderSupport: 'none'
    });
    
    const pdfDocument = await loadingTask.promise;
    console.log(`📄 PDF loaded: ${pdfDocument.numPages} pages`);
    
    // Test getting text content from first page
    const page = await pdfDocument.getPage(1);
    const textContent = await page.getTextContent();
    
    console.log(`📖 Page 1 text items: ${textContent.items.length}`);
    
    // Extract coordinates from text items
    const textItems = textContent.items.map((item, index) => ({
      text: item.str,
      x: item.transform[4],
      y: item.transform[5], 
      width: item.width,
      height: item.height,
      pageNumber: 1,
      itemIndex: index
    })).filter(item => item.text.trim().length > 0);
    
    console.log(`✅ Successfully extracted ${textItems.length} text items with coordinates`);
    
    // Show sample
    console.log('\n📋 Sample text items:');
    textItems.slice(0, 3).forEach((item, i) => {
      console.log(`${i + 1}. "${item.text}" at (${item.x.toFixed(1)}, ${item.y.toFixed(1)})`);
    });
    
    return true;
    
  } catch (error) {
    console.error('❌ PDF.js test failed:', error.message);
    return false;
  }
}

testSimplePDFJS().catch(console.error);
