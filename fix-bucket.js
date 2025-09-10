import { supabaseAdmin } from './supabase.js';

async function fixBucket() {
  console.log('🔧 Attempting to fix bucket configuration...');
  
  // First check current bucket settings
  try {
    const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
    if (error) {
      console.log('❌ Error listing buckets:', error);
      return;
    }
    
    const resumesBucket = buckets.find(b => b.name === 'resumes');
    if (resumesBucket) {
      console.log('📁 Current bucket config:', {
        name: resumesBucket.name,
        public: resumesBucket.public,
        allowedMimeTypes: resumesBucket.allowed_mime_types,
        fileSizeLimit: resumesBucket.file_size_limit
      });
      
      if (!resumesBucket.public) {
        console.log('⚠️  Bucket is PRIVATE - this is why URLs return 404');
        console.log('');
        console.log('🔧 TO FIX THIS:');
        console.log('1. Go to Supabase Dashboard → Storage → Buckets');
        console.log('2. Find the "resumes" bucket');
        console.log('3. Click the gear icon (Settings)');
        console.log('4. Toggle "Public bucket" to ON');
        console.log('5. Click "Save"');
        console.log('');
        console.log('OR delete the current bucket and let us create a new public one.');
      } else {
        console.log('✅ Bucket is already public - checking policies...');
      }
    } else {
      console.log('❌ No resumes bucket found');
    }
    
  } catch (err) {
    console.log('❌ Error:', err.message);
  }
}

fixBucket().catch(console.error);
