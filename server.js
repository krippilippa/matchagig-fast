import express from 'express';
import { readFileSync } from 'fs';
import cors from 'cors';
import { pillMatrixSearch } from './pill-search-logic.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Toggle for dummy data vs real LLM calls
const USE_DUMMY_PILLS = true;

// Toggle for dummy search vs real pill-many logic
const USE_DUMMY_SEARCH = false;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json());

// Health check endpoint (accepts both GET and POST)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.post('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Pillpack compile endpoint
app.post('/pillpack/compile', (req, res) => {
  // For now, ignore input body (jd, target_pills) and use toggle
  if (USE_DUMMY_PILLS) {
    const dummyPills = {
      "pills": [
        { "pill": "Has experience in sales" },
        { "pill": "Strong communication skills" }
      ]
    };
    res.status(200).json(dummyPills);
  } else {
    // Placeholder for real LLM implementation
    res.status(200).json({ pills: [] });
  }
});

// Search pills endpoint
app.post('/search/pills', async (req, res) => {
  if (USE_DUMMY_SEARCH) {
    try {
      const dummySearchResults = JSON.parse(readFileSync('./pill_many_output.json', 'utf8'));
      res.status(200).json(dummySearchResults);
    } catch (error) {
      console.error('Error reading pill_many_output.json:', error);
      res.status(500).json({ error: 'Failed to load dummy data' });
    }
  } else {
    try {
      const { pills, topk_resumes, include_chunk_ids } = req.body;
      
      if (!pills || !Array.isArray(pills)) {
        return res.status(400).json({ 
          error: 'Invalid input: pills array is required' 
        });
      }

      const options = {
        topkResumes: topk_resumes || 999999,
        includeChunkIds: include_chunk_ids || false
      };

      const result = await pillMatrixSearch(pills, options);
      res.status(200).json(result);
    } catch (error) {
      console.error('Error in pill search:', error);
      res.status(500).json({ 
        error: 'Internal server error during search',
        details: error.message 
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
