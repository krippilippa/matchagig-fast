import { supabaseAdmin } from './supabase.js';

async function testBucketAccess() {
  console.log('🔍 Testing bucket access...');
  console.log('Supabase URL:', process.env.SUPABASE_URL);
  
  // List bucket contents
  const { data: files, error } = await supabaseAdmin.storage.from('resumes').list();
  if (error) {
    console.log('❌ List error:', error);
    return;
  }
  
  console.log('📁 Files in bucket:', files.length);
  if (files.length > 0) {
    const firstFile = files[0];
    console.log('First directory/file:', firstFile.name);
    
    // Try to get a public URL for the directory
    const { data: urlData } = supabaseAdmin.storage.from('resumes').getPublicUrl(firstFile.name);
    console.log('Generated URL for directory:', urlData.publicUrl);
    
    // Try to list contents of first directory (which should be a SHA hash)
    const { data: subFiles, error: subError } = await supabaseAdmin.storage
      .from('resumes')
      .list(firstFile.name);
    
    if (subError) {
      console.log('❌ Sub-directory error:', subError);
    } else {
      console.log('📄 Files in', firstFile.name + ':', subFiles?.length || 0);
      if (subFiles && subFiles.length > 0) {
        const firstPdf = subFiles[0];
        console.log('First PDF:', firstPdf.name);
        
        // Generate URL for the actual PDF
        const pdfPath = `${firstFile.name}/${firstPdf.name}`;
        const { data: pdfUrlData } = supabaseAdmin.storage.from('resumes').getPublicUrl(pdfPath);
        console.log('📎 PDF URL:', pdfUrlData.publicUrl);
        
        // Test if we can access it
        console.log('\n🌐 Testing URL access...');
        try {
          const response = await fetch(pdfUrlData.publicUrl);
          console.log('Response status:', response.status);
          console.log('Response headers:', Object.fromEntries(response.headers.entries()));
        } catch (fetchError) {
          console.log('❌ Fetch error:', fetchError.message);
        }
      }
    }
  }
}

testBucketAccess().catch(console.error);
