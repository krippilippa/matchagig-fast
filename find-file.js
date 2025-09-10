import { supabaseAdmin } from './supabase.js';

async function findSpecificFile() {
  console.log('🔍 Looking for "Resumé TJ 2025.pdf"...');
  
  const targetHash = '5df4a67fbc0826eda2b5c3210f17f00a9c595de67edc31529efc78e32a7afd93';
  
  try {
    // Check if the hash directory exists
    const { data: files, error } = await supabaseAdmin.storage.from('resumes').list();
    if (error) {
      console.log('❌ Error listing root:', error);
      return;
    }
    
    const targetDir = files.find(f => f.name === targetHash);
    if (!targetDir) {
      console.log('❌ Hash directory not found:', targetHash);
      console.log('Available directories:', files.map(f => f.name));
      return;
    }
    
    console.log('✅ Found hash directory');
    
    // List files in that directory
    const { data: subFiles, error: subError } = await supabaseAdmin.storage
      .from('resumes')
      .list(targetHash);
    
    if (subError) {
      console.log('❌ Error listing subdirectory:', subError);
      return;
    }
    
    console.log('📄 Files in directory:', subFiles.map(f => f.name));
    
    // Look for the specific file
    const targetFile = subFiles.find(f => f.name.includes('TJ') || f.name.includes('Resumé'));
    if (targetFile) {
      console.log('✅ Found file:', targetFile.name);
      
      // Generate properly encoded URL
      const filePath = `${targetHash}/${targetFile.name}`;
      const { data: urlData } = supabaseAdmin.storage.from('resumes').getPublicUrl(filePath);
      console.log('📎 Correct URL:', urlData.publicUrl);
      
      // Test the URL
      const response = await fetch(urlData.publicUrl);
      console.log('🌐 Test response:', response.status);
      
      if (response.status === 200) {
        console.log('✅ PDF accessible!');
      } else {
        const errorText = await response.text();
        console.log('❌ Error:', errorText);
      }
    } else {
      console.log('❌ Target file not found in directory');
    }
    
  } catch (err) {
    console.log('❌ Error:', err.message);
  }
}

findSpecificFile().catch(console.error);
