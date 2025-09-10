import { supabaseAdmin } from './supabase.js';

async function checkAndCreateBucket() {
  console.log('🔍 Checking if resumes bucket exists...');
  
  try {
    // Try to list files in the bucket
    const { data, error } = await supabaseAdmin.storage.from('resumes').list();
    
    if (error) {
      console.log('❌ Bucket error:', error.message);
      
      if (error.message.includes('Bucket not found') || error.statusCode === '404') {
        console.log('🔧 Bucket does not exist - attempting to create it...');
        
        // Try to create the bucket
        const { data: createData, error: createError } = await supabaseAdmin.storage.createBucket('resumes', {
          public: true,
          allowedMimeTypes: ['application/pdf'],
          fileSizeLimit: 10485760 // 10MB
        });
        
        if (createError) {
          console.log('❌ Failed to create bucket:', createError.message);
          console.log('💡 You need to create the "resumes" bucket manually in Supabase Dashboard');
          console.log('   Go to: Storage > Create new bucket > Name: "resumes" > Public: true');
        } else {
          console.log('✅ Bucket created successfully!');
        }
      }
    } else {
      console.log('✅ Bucket exists! Files found:', data?.length || 0);
      if (data && data.length > 0) {
        console.log('📁 Sample files:', data.slice(0, 3).map(f => f.name));
      }
    }
  } catch (err) {
    console.log('❌ Unexpected error:', err.message);
  }
}

checkAndCreateBucket();
