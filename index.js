import { supabase } from "./supabase.js";

async function main() {
  const { data, error } = await supabase.from("resumes").select("*").limit(1);
  if (error) console.error(error);
  else console.log("Connected! Example row:", data);
}

main();
