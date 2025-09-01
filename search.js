import OpenAI from "openai";
import { supabaseAdmin } from "./supabase.js";
import dotenv from "dotenv"; dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const unit = v => { const n=Math.sqrt(v.reduce((s,x)=>s+x*x,0))||1; return v.map(x=>x/n); };

async function embedOne(text){
  const r = await openai.embeddings.create({ model:"text-embedding-3-small", input:text });
  return unit(r.data[0].embedding);
}

async function main(query, k=3){
  const q = await embedOne(query);

  // rank all resumes by best chunk
  const { data: ranked, error } = await supabaseAdmin.rpc("best_per_resume", { q });
  if(error) throw error;

  if (!ranked || ranked.length === 0) {
    console.log("No resumes indexed yet.");
    process.exit(0);
  }

  // pick top resume and fetch evidence snippets
  const top = ranked.sort((a,b)=>b.similarity-a.similarity)[0];
  console.log("Top resume:", top.resume_id, "sim:", top.similarity.toFixed(3));

  const { data: ev, error: err2 } = await supabaseAdmin.rpc("topk_chunks", { q, r: top.resume_id, k });
  if(err2) throw err2;

  console.log("Evidence query result:", ev);
  if (!ev || ev.length === 0) {
    console.log("No evidence chunks found for this resume.");
  } else {
    console.log("Evidence:");
    ev.forEach((e,i)=> console.log(`#${i+1}`, `[${e.similarity.toFixed(3)}]`, e.text.slice(0,200).trim()));
  }
}

main(process.argv[2] || "Must: client-facing English", Number(process.argv[3]) || 3).catch(console.error);
