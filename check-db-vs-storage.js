import { supabaseAdmin } from './supabase.js';

async function compareDbAndStorage() {
  console.log('🔍 Comparing database records vs storage files...');
  
  try {
    // Get all resumes from database
    const { data: dbResumes, error: dbError } = await supabaseAdmin
      .from('resumes')
      .select('id, name, pdf_url, sha256');
    
    if (dbError) {
      console.log('❌ Database error:', dbError);
      return;
    }
    
    console.log(`📊 Database has ${dbResumes.length} resume records`);
    
    // Get all directories from storage
    const { data: storageFiles, error: storageError } = await supabaseAdmin
      .storage.from('resumes').list();
    
    if (storageError) {
      console.log('❌ Storage error:', storageError);
      return;
    }
    
    console.log(`📁 Storage has ${storageFiles.length} directories`);
    
    // Look for TJ resume specifically
    const tjResume = dbResumes.find(r => r.name.includes('TJ') || r.name.includes('Resumé'));
    if (tjResume) {
      console.log('\n📄 Found TJ resume in database:');
      console.log('  ID:', tjResume.id);
      console.log('  Name:', tjResume.name);
      console.log('  SHA256:', tjResume.sha256);
      console.log('  URL:', tjResume.pdf_url);
      
      // Check if this SHA exists in storage
      const storageExists = storageFiles.some(f => f.name === tjResume.sha256);
      console.log('  Storage exists:', storageExists ? '✅' : '❌');
      
      if (storageExists) {
        // Try to generate correct URL
        const { data: urlData } = supabaseAdmin.storage
          .from('resumes').getPublicUrl(`${tjResume.sha256}/${tjResume.name}`);
        console.log('  Correct URL:', urlData.publicUrl);
        
        // Test it
        const response = await fetch(urlData.publicUrl);
        console.log('  URL works:', response.status === 200 ? '✅' : `❌ (${response.status})`);
      }
    } else {
      console.log('\n❌ No TJ resume found in database');
    }
    
    // Show first few database entries
    console.log('\n📋 Sample database entries:');
    dbResumes.slice(0, 3).forEach((resume, i) => {
      console.log(`${i + 1}. ${resume.name} (SHA: ${resume.sha256?.substring(0, 12)}...)`);
    });
    
  } catch (err) {
    console.log('❌ Error:', err.message);
  }
}

compareDbAndStorage().catch(console.error);
