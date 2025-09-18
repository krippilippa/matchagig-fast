import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Function to extract skills/pills from job description using LLM
export async function extractPillsFromJobDescription(jobDescription) {
  try {
    const systemPrompt = `You are an expert recruiter and HR professional. Your task is to analyze a job description and extract the most important skills, qualifications, and requirements that would be relevant for candidate matching.

Return your response as a JSON array of objects, where each object has a "pill" property containing a concise, specific skill or qualification statement.

Guidelines:
- Focus on concrete, measurable skills and qualifications
- Avoid vague or generic statements
- Each pill should be a complete, standalone requirement
- Prioritize the most important and specific requirements
- Limit to at most 8-12 pills but only if needed, can also be less depending on the job description.
- Use clear, professional language

Example format:
[
  {"pill": "Has 3+ years of experience in React development"},
  {"pill": "Strong proficiency in Python and data analysis"},
  {"pill": "Experience with AWS cloud services"}
]`;

    const userPrompt = `Job Description:
${jobDescription}

Please extract the most important skills and qualifications from this job description.`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ]
    });

    const content = response.choices[0].message.content;
    
    // Try to parse the JSON response
    try {
      const pills = JSON.parse(content);
      if (Array.isArray(pills)) {
        return pills;
      } else {
        throw new Error('Response is not an array');
      }
    } catch (parseError) {
      console.error('Failed to parse LLM response as JSON:', content);
      // Fallback: try to extract pills from text response
      const lines = content.split('\n').filter(line => line.trim());
      const extractedPills = [];
      
      for (const line of lines) {
        const match = line.match(/"pill":\s*"([^"]+)"/);
        if (match) {
          extractedPills.push({ pill: match[1] });
        }
      }
      
      if (extractedPills.length > 0) {
        return extractedPills;
      }
      
      throw new Error('Could not extract pills from LLM response');
    }
  } catch (error) {
    console.error('Error in extractPillsFromJobDescription:', error);
    throw error;
  }
}

