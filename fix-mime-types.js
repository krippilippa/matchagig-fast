import { supabaseAdmin } from './supabase.js';
import fs from 'fs';

async function fixMimeTypes() {
  console.log('🔧 Checking bucket MIME type configuration...');
  
  try {
    // Check current bucket configuration
    const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
    if (error) {
      console.log('❌ Error listing buckets:', error);
      return;
    }
    
    const resumesBucket = buckets.find(b => b.name === 'resumes');
    if (resumesBucket) {
      console.log('📁 Current bucket config:');
      console.log('  Public:', resumesBucket.public);
      console.log('  Allowed MIME types:', resumesBucket.allowed_mime_types);
      console.log('  File size limit:', resumesBucket.file_size_limit);
      
      if (!resumesBucket.allowed_mime_types || 
          !resumesBucket.allowed_mime_types.includes('application/pdf')) {
        console.log('\n⚠️  Bucket does not have application/pdf in allowed MIME types!');
        console.log('\n🔧 TO FIX IN SUPABASE DASHBOARD:');
        console.log('1. Go to Storage → Buckets');
        console.log('2. Click gear icon on "resumes" bucket');
        console.log('3. Add "application/pdf" to Allowed MIME types');
        console.log('4. Save changes');
        console.log('5. Then re-upload files or update existing ones');
      } else {
        console.log('✅ Bucket has correct MIME type configuration');
      }
    }
    
    // Test uploading a small PDF with correct MIME type
    console.log('\n🧪 Testing upload with correct MIME type...');
    
    // Create a minimal test PDF content
    const testContent = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000053 00000 n \n0000000125 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n223\n%%EOF';
    
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('resumes')
      .upload('test/mime-test.pdf', Buffer.from(testContent), {
        contentType: 'application/pdf',
        upsert: true
      });
    
    if (uploadError) {
      console.log('❌ Upload test failed:', uploadError.message);
    } else {
      console.log('✅ Test upload successful');
      
      // Test the URL
      const { data: urlData } = supabaseAdmin.storage
        .from('resumes')
        .getPublicUrl('test/mime-test.pdf');
      
      console.log('🔗 Test URL:', urlData.publicUrl);
      
      const response = await fetch(urlData.publicUrl);
      console.log('📊 Response Content-Type:', response.headers.get('content-type'));
      
      // Clean up test file
      await supabaseAdmin.storage.from('resumes').remove(['test/mime-test.pdf']);
    }
    
  } catch (err) {
    console.log('❌ Error:', err.message);
  }
}

fixMimeTypes().catch(console.error);
