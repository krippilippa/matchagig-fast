import fs from "fs";
import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Usage: node push-sheets.js <pill_many_output.json>");
    process.exit(1);
  }

  const inputPath = args[0];
  
  // Check required environment variables
  if (!process.env.SHEETS_ID) {
    console.error("Error: SHEETS_ID environment variable is required");
    process.exit(1);
  }

  // Initialize Google Sheets API
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });
  const spreadsheetId = process.env.SHEETS_ID;

  // Read and parse input JSON
  const json = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

  // Extract pills and prepare header
  const pills = json.pills.map(p => p.pill);
  const header = ['resume_name', ...pills];
  
  // Build rows with scores
  const rows = json.resumes.map(r => [
    r.resume_name || r.resume_id, 
    ...pills.map(pill => Number(r.scores?.[pill]?.max_sim || 0))
  ]);

  // 1) Find first sheet ID and title
  const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
  const firstSheet = spreadsheetInfo.data.sheets[0];
  const sheetId = firstSheet.properties.sheetId;
  const sheetTitle = firstSheet.properties.title;

  console.log(`Using sheet: "${sheetTitle}" (ID: ${sheetId})`);

  // 2) Clear the sheet
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [{
        updateCells: {
          range: {
            sheetId: sheetId
          },
          fields: '*'
        }
      }]
    }
  });

  // 3) Write values (header + data rows)
  const allRows = [header, ...rows];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetTitle}!A1`,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: allRows
    }
  });

  // 4) Add notes for score cells (skip header row and resume_name column)
  const noteRequests = [];
  
  for (let rowIndex = 0; rowIndex < json.resumes.length; rowIndex++) {
    const resume = json.resumes[rowIndex];
    const noteRow = [];
    
    // Skip resume_name column (first column)
    noteRow.push({ userEnteredValue: { stringValue: resume.resume_name || resume.resume_id } });
    
    // Add notes for each pill score
    for (const pill of pills) {
      const scoreData = resume.scores?.[pill];
      const note = scoreData?.best_chunk_text || "";
      // Truncate long notes to ~1000 chars
      const truncatedNote = note.length > 1000 ? note.substring(0, 1000) + "..." : note;
      
      noteRow.push({
        userEnteredValue: { numberValue: Number(scoreData?.max_sim || 0) },
        note: truncatedNote
      });
    }
    
    noteRequests.push({
      updateCells: {
        range: {
          sheetId: sheetId,
          startRowIndex: rowIndex + 1, // +1 to skip header
          endRowIndex: rowIndex + 2,
          startColumnIndex: 0,
          endColumnIndex: pills.length + 1 // +1 for resume_name column
        },
        rows: [{ values: noteRow }],
        fields: 'userEnteredValue,note'
      }
    });
  }

  // Execute note updates in batches to avoid API limits
  if (noteRequests.length > 0) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: noteRequests
      }
    });
  }

  console.log(`Successfully pushed ${json.resumes.length} resumes with ${pills.length} pills to Google Sheets`);
  console.log(`Sheet URL: https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`);
}

main().catch((err) => {
  console.error("Error pushing to Sheets:", err);
  process.exit(1);
});

