import { supabaseAdmin } from './supabase.js';
import fs from 'fs';
import crypto from 'crypto';

async function testSingleUpload() {
  console.log('🧪 Testing single PDF upload with correct MIME type...');
  
  // Use a simple file
  const filePath = './resumes/Resume_SE.pdf';
  
  if (!fs.existsSync(filePath)) {
    console.log('❌ File not found:', filePath);
    return;
  }
  
  try {
    const buf = fs.readFileSync(filePath);
    const sha = crypto.createHash("sha256").update(buf).digest("hex");
    const filename = 'TEST_' + filePath.split("/").pop();
    
    console.log('📄 File:', filename);
    console.log('🔒 SHA:', sha.substring(0, 12) + '...');
    console.log('📏 Size:', buf.length, 'bytes');
    
    // Upload with explicit MIME type
    const storagePath = `test-${Date.now()}/${filename}`;
    console.log('📁 Storage path:', storagePath);
    
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from("resumes")
      .upload(storagePath, buf, { 
        upsert: true,
        contentType: 'application/pdf'
      });
    
    if (uploadError) {
      console.log('❌ Upload error:', uploadError);
      return;
    }
    
    console.log('✅ Upload successful');
    
    // Generate URL and test
    const { data: urlData } = supabaseAdmin.storage
      .from('resumes')
      .getPublicUrl(storagePath);
    
    console.log('🔗 URL:', urlData.publicUrl);
    
    // Test the URL
    const response = await fetch(urlData.publicUrl);
    console.log('📊 Status:', response.status);
    console.log('📊 Content-Type:', response.headers.get('content-type'));
    
    // Clean up
    await supabaseAdmin.storage.from('resumes').remove([storagePath]);
    console.log('🧹 Cleaned up test file');
    
  } catch (err) {
    console.log('❌ Error:', err.message);
  }
}

testSingleUpload().catch(console.error);
