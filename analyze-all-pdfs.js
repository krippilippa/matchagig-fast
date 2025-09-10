import { supabaseAdmin } from './supabase.js';

async function analyzeAllPdfs() {
  console.log('🔍 Analyzing all PDF files...');
  
  try {
    // Get all resumes from database
    const { data: resumes, error } = await supabaseAdmin
      .from('resumes')
      .select('name, pdf_url')
      .limit(5); // Test first 5
    
    if (error) {
      console.log('❌ Database error:', error);
      return;
    }
    
    console.log(`📊 Testing ${resumes.length} PDF files:\n`);
    
    for (let i = 0; i < resumes.length; i++) {
      const resume = resumes[i];
      console.log(`${i + 1}. ${resume.name}`);
      
      try {
        const response = await fetch(resume.pdf_url);
        const contentType = response.headers.get('content-type');
        console.log(`   Status: ${response.status}`);
        console.log(`   Content-Type: ${contentType}`);
        
        if (response.status === 200) {
          const buffer = await response.arrayBuffer();
          const bytes = new Uint8Array(buffer);
          
          // Check PDF signature
          const firstBytes = bytes.slice(0, 10);
          const signature = String.fromCharCode(...firstBytes);
          const isPdf = signature.startsWith('%PDF');
          
          console.log(`   Size: ${buffer.byteLength} bytes`);
          console.log(`   PDF signature: ${isPdf ? '✅' : '❌'} (${signature.substring(0, 4)})`);
          
          if (!isPdf) {
            console.log(`   First 50 chars: "${String.fromCharCode(...bytes.slice(0, 50))}"`);
          }
        }
        
        console.log(`   Browser will: ${
          contentType === 'application/pdf' && response.status === 200 ? '✅ Display properly' : 
          contentType === 'text/plain' ? '⚠️  Show as text' : 
          '❌ Fail to load'
        }`);
        
      } catch (fetchError) {
        console.log(`   ❌ Fetch error: ${fetchError.message}`);
      }
      
      console.log(''); // Empty line
    }
    
    console.log('\n🔧 SOLUTION: Clear storage and re-ingest all files:');
    console.log('   node clear-db.js --clear-storage');
    console.log('   node ingest.js ./resumes/');
    
  } catch (err) {
    console.log('❌ Error:', err.message);
  }
}

analyzeAllPdfs().catch(console.error);
