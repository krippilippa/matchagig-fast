import { supabaseAdmin } from "./supabase.js";
import dotenv from "dotenv"; 
dotenv.config();

async function clearDatabase() {
  console.log("🗑️  Clearing database...");
  
  try {
    // Clear resume chunks first (due to foreign key constraint)
    console.log("Deleting resume chunks...");
    const { error: chunksError } = await supabaseAdmin
      .from("resume_chunks")
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows
    
    if (chunksError) throw chunksError;
    console.log("✅ Resume chunks deleted");

    // Then clear resumes
    console.log("Deleting resumes...");
    const { error: resumesError } = await supabaseAdmin
      .from("resumes")
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows
    
    if (resumesError) throw resumesError;
    console.log("✅ Resumes deleted");

    // Optional: Clear storage bucket (PDF files)
    if (process.argv.includes('--clear-storage')) {
      console.log("Clearing storage bucket...");
      const { data: files, error: listError } = await supabaseAdmin
        .storage
        .from('resumes')
        .list();
      
      if (listError) {
        console.log("⚠️  Could not list storage files:", listError.message);
      } else if (files && files.length > 0) {
        const filePaths = files.map(f => f.name);
        const { error: deleteError } = await supabaseAdmin
          .storage
          .from('resumes')
          .remove(filePaths);
        
        if (deleteError) {
          console.log("⚠️  Could not delete storage files:", deleteError.message);
        } else {
          console.log(`✅ Deleted ${filePaths.length} files from storage`);
        }
      }
    }

    console.log("\n🎉 Database cleared successfully!");
    console.log("\nYou can now run:");
    console.log("node ingest.js ./sample/Resume_*.pdf");
    
  } catch (error) {
    console.error("❌ Error clearing database:", error);
    process.exit(1);
  }
}

// Show usage info
function showUsage() {
  console.log("Usage:");
  console.log("  node clear-db.js                 # Clear database tables only");
  console.log("  node clear-db.js --clear-storage # Clear database + storage files");
  console.log("  node clear-db.js --help          # Show this help");
}

// Main execution
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  showUsage();
} else {
  clearDatabase().catch(console.error);
}
