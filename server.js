import express from 'express';
import cors from 'cors';
import fs from 'fs';
import { weightedPillSearch } from './weighted-pill-search.js';
import { getResumeDetailsEfficient } from './get-resume-details-efficient.js';
import { extractPillsFromJobDescription } from './pill-compile.js';

// Import dummy data
const dummyPills = JSON.parse(fs.readFileSync('./dummy-data/dummy-pills.json', 'utf8'));
const dummyWeightedSearchResults = JSON.parse(fs.readFileSync('./dummy-data/dummy-weighted-search.json', 'utf8'));
const dummyResumeDetailsResults = JSON.parse(fs.readFileSync('./dummy-data/dummy-resume-details.json', 'utf8'));


const app = express();
const PORT = process.env.PORT || 3000;

// Toggle for dummy data vs real LLM calls
const USE_DUMMY_PILLS = true;

// Toggle for dummy search vs real weighted search
const USE_DUMMY_SEARCH = false;

// Toggle for dummy resume details vs real resume details
const USE_DUMMY_RESUME_DETAILS = false;


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
app.post('/pillpack/compile', async (req, res) => {
  try {
    // Return dummy data if toggle is enabled
    if (USE_DUMMY_PILLS) {
      res.status(200).json(dummyPills);
      return;
    }

    const { jd } = req.body;
    
    // Input validation
    if (!jd || typeof jd !== 'string') {
      return res.status(400).json({ 
        error: 'Invalid input: jd (job description) is required and must be a string' 
      });
    }

    if (jd.length < 50) {
      return res.status(400).json({ 
        error: 'Job description must be at least 50 characters long' 
      });
    }

    if (jd.length > 10000) {
      return res.status(400).json({ 
        error: 'Job description must be less than 10,000 characters' 
      });
    }

    // Extract pills using LLM
    const extractedPills = await extractPillsFromJobDescription(jd);
    
    res.status(200).json({ pills: extractedPills });
    
  } catch (error) {
    console.error('Error in pillpack compile:', error);
    res.status(500).json({ 
      error: 'Internal server error during pill extraction',
      details: error.message 
    });
  }
});


// Weighted pill search endpoint
app.post('/search/pills/weighted', async (req, res) => {
  try {
    // Return dummy data if toggle is enabled
    if (USE_DUMMY_SEARCH) {
      res.status(200).json(dummyWeightedSearchResults);
      return;
    }

    const { pills, top_k, offset } = req.body;
    
    if (!pills || !Array.isArray(pills)) {
      return res.status(400).json({ 
        error: 'Invalid input: pills array is required' 
      });
    }

    // Validate pills structure
    for (const pill of pills) {
      if (!pill.pill || typeof pill.pill !== 'string') {
        return res.status(400).json({ 
          error: 'Each pill must have a "pill" string property' 
        });
      }
      if (pill.weight && (pill.weight < 0.1 || pill.weight > 2.0)) {
        return res.status(400).json({ 
          error: 'Weights must be between 0.1 and 2.0' 
        });
      }
    }

    if (pills.length > 20) {
      return res.status(400).json({ 
        error: 'Maximum 20 pills allowed' 
      });
    }

    const options = {
      top_k: top_k || 15,
      offset: offset || 0,
      includeResumeData: true
    };

    const result = await weightedPillSearch(pills, options);
    res.status(200).json(result);
    
  } catch (error) {
    console.error('Error in weighted pill search:', error);
    res.status(500).json({ 
      error: 'Internal server error during weighted search',
      details: error.message 
    });
  }
});

// Get detailed pill results for a specific resume
app.post('/search/resume/details', async (req, res) => {
  try {
    // Return dummy data if toggle is enabled
    if (USE_DUMMY_RESUME_DETAILS) {
      res.status(200).json(dummyResumeDetailsResults);
      return;
    }

    const { resume_id, pills, results_per_pill } = req.body;

    if (!resume_id) {
      return res.status(400).json({ 
        error: 'resume_id is required' 
      });
    }
    
    if (!pills || !Array.isArray(pills)) {
      return res.status(400).json({ 
        error: 'Invalid input: pills array is required' 
      });
    }

    // Validate pills structure
    for (const pill of pills) {
      if (!pill.pill || typeof pill.pill !== 'string') {
        return res.status(400).json({ 
          error: 'Each pill must have a "pill" string property' 
        });
      }
      if (pill.weight && (pill.weight < 0.1 || pill.weight > 2.0)) {
        return res.status(400).json({ 
          error: 'Weights must be between 0.1 and 2.0' 
        });
      }
    }

    if (pills.length > 20) {
      return res.status(400).json({ 
        error: 'Maximum 20 pills allowed' 
      });
    }

    const resultsPerPill = results_per_pill || 3;
    if (resultsPerPill < 1 || resultsPerPill > 10) {
      return res.status(400).json({ 
        error: 'results_per_pill must be between 1 and 10' 
      });
    }

    const result = await getResumeDetailsEfficient(resume_id, pills, resultsPerPill);
    res.status(200).json(result);
    
  } catch (error) {
    console.error('Error in get resume pill details:', error);
    res.status(500).json({ 
      error: 'Internal server error during resume details search',
      details: error.message 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
