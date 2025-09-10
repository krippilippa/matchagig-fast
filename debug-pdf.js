import { supabaseAdmin } from './supabase.js';

async function debugPdfAccess() {
  console.log('🔍 Debugging PDF access issues...');
  
  try {
    // Get a working resume from database
    const { data: resumes } = await supabaseAdmin
      .from('resumes')
      .select('name, pdf_url')
      .limit(1);
    
    if (!resumes || resumes.length === 0) {
      console.log('❌ No resumes found in database');
      return;
    }
    
    const resume = resumes[0];
    console.log('📄 Testing PDF:', resume.name);
    console.log('🔗 URL:', resume.pdf_url);
    
    // Test the URL
    const response = await fetch(resume.pdf_url);
    
    console.log('\n📊 Response details:');
    console.log('Status:', response.status);
    console.log('Status Text:', response.statusText);
    console.log('Content-Type:', response.headers.get('content-type'));
    console.log('Content-Length:', response.headers.get('content-length'));
    console.log('Cache-Control:', response.headers.get('cache-control'));
    
    // Check if it's actually PDF content
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    
    // PDF files start with %PDF
    const pdfSignature = bytes.slice(0, 4);
    const isPdf = String.fromCharCode(...pdfSignature) === '%PDF';
    
    console.log('\n🔍 Content analysis:');
    console.log('File size:', buffer.byteLength, 'bytes');
    console.log('First 4 bytes:', String.fromCharCode(...pdfSignature));
    console.log('Is valid PDF:', isPdf ? '✅' : '❌');
    
    if (!isPdf) {
      console.log('First 100 bytes as text:');
      console.log(String.fromCharCode(...bytes.slice(0, 100)));
    }
    
    // Test a direct download
    console.log('\n💡 Try opening this URL in a new tab:');
    console.log(resume.pdf_url);
    
  } catch (err) {
    console.log('❌ Error:', err.message);
  }
}

debugPdfAccess().catch(console.error);
