# 🚀 Multi-Result Search - Frontend Integration Guide

## Overview
The search API now supports returning multiple matching chunks per pill-resume combination. This allows users to see the best, second-best, and third-best matches for each search criteria.

## API Changes

### New Parameter: `nr_of_results`
- **Type**: Integer
- **Range**: 1-3
- **Default**: 1 (maintains backward compatibility)
- **Description**: Number of matching chunks to return per pill-resume combination

### API Endpoint
```
POST /search/pills
```

### Request Body
```json
{
  "pills": [
    {"pill": "sales experience"},
    {"pill": "communication skills"}
  ],
  "nr_of_results": 3,  // NEW: 1, 2, or 3
  "topk_resumes": 10,   // Optional: limit number of resumes
  "include_chunk_ids": false  // Optional: include chunk IDs in response
}
```

## Response Format Changes

### All Results (Consistent Array Format)
**Always returns arrays for consistency - no more dual format!**
```json
{
  "pills": ["sales experience", "communication skills"],
  "nrOfResults": 3,
  "resumes": [
    {
      "resume_id": "uuid",
      "resume_name": "John Doe Resume.pdf", 
      "pdf_url": "https://...",
      "scores": {
        "sales experience": {
          "results": [
            {
              "similarity": 0.524,
              "chunk_text": "Improved customers' experiences by suggesting suitable offers...",
              "page_number": 2,
              "coordinates": {
                "char_start": 5298,
                "char_end": 5538,
                "text_length": 240
              },
              "rank": 1
            },
            {
              "similarity": 0.489,
              "chunk_text": "Process all correspondence and paperwork related to accounts...",
              "page_number": 1,
              "coordinates": {
                "char_start": 2716,
                "char_end": 2846,
                "text_length": 130
              },
              "rank": 2
            },
            {
              "similarity": 0.475,
              "chunk_text": "Digital Sales Specialist Drive digital revenue growth...",
              "page_number": 1,
              "coordinates": {
                "char_start": 2285,
                "char_end": 2506,
                "text_length": 221
              },
              "rank": 3
            }
          ]
        }
      }
    }
  ]
}
```

**For `nr_of_results = 1`, you get the same structure but with only 1 item in the array:**
```json
{
  "pills": ["sales experience"],
  "nrOfResults": 1,
  "resumes": [
    {
      "resume_id": "uuid",
      "resume_name": "John Doe Resume.pdf",
      "pdf_url": "https://...",
      "scores": {
        "sales experience": {
          "results": [
            {
              "similarity": 0.524,
              "chunk_text": "Improved customers' experiences by suggesting suitable offers...",
              "page_number": 2,
              "coordinates": {
                "char_start": 5298,
                "char_end": 5538,
                "text_length": 240
              },
              "rank": 1
            }
          ]
        }
      }
    }
  ]
}
```

## Frontend Implementation Examples

### 1. JavaScript/TypeScript API Call
```typescript
interface SearchRequest {
  pills: Array<{pill: string}>;
  nr_of_results?: 1 | 2 | 3;
  topk_resumes?: number;
  include_chunk_ids?: boolean;
}

interface SearchResult {
  pills: string[];
  nrOfResults?: number;
  resumes: Array<{
    resume_id: string;
    resume_name: string;
    pdf_url: string;
    scores: Record<string, {
      results: Array<{
        similarity: number;
        chunk_text: string;
        page_number: number;
        coordinates: {
          char_start: number;
          char_end: number;
          text_length: number;
        };
        rank: number;
      }>;
    }>;
  }>;
}

async function searchPills(pills: string[], nrOfResults: 1 | 2 | 3 = 1): Promise<SearchResult> {
  const response = await fetch('/search/pills', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pills: pills.map(pill => ({ pill })),
      nr_of_results: nrOfResults
    })
  });
  
  if (!response.ok) {
    throw new Error(`Search failed: ${response.statusText}`);
  }
  
  return response.json();
}
```

### 2. React Component Example
```tsx
import React, { useState } from 'react';

interface SearchResultsProps {
  results: SearchResult;
}

const SearchResults: React.FC<SearchResultsProps> = ({ results }) => {
  const isMultiResult = results.nrOfResults && results.nrOfResults > 1;
  
  return (
    <div className="search-results">
      {results.resumes.map((resume) => (
        <div key={resume.resume_id} className="resume-card">
          <h3>{resume.resume_name}</h3>
          
          {Object.entries(resume.scores).map(([pill, score]) => (
            <div key={pill} className="pill-results">
              <h4>{pill}</h4>
              
              {isMultiResult && score.results ? (
                // Multiple results display
                <div className="multiple-results">
                  {score.results.map((result, index) => (
                    <div key={index} className="result-item">
                      <div className="result-header">
                        <span className="rank">#{result.rank}</span>
                        <span className="similarity">
                          {(result.similarity * 100).toFixed(1)}% match
                        </span>
                      </div>
                      <p className="chunk-text">{result.chunk_text}</p>
                      <div className="metadata">
                        Page {result.page_number} • 
                        Characters {result.coordinates.char_start}-{result.coordinates.char_end}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                // Single result display (backward compatible)
                <div className="single-result">
                  <div className="similarity">
                    {(score.max_sim! * 100).toFixed(1)}% match
                  </div>
                  <p className="chunk-text">{score.best_chunk_text}</p>
                  <div className="metadata">
                    Page {score.page_number} • 
                    Characters {score.coordinates?.char_start}-{score.coordinates?.char_end}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
```

### 3. Vue.js Component Example
```vue
<template>
  <div class="search-results">
    <div v-for="resume in results.resumes" :key="resume.resume_id" class="resume-card">
      <h3>{{ resume.resume_name }}</h3>
      
      <div v-for="(score, pill) in resume.scores" :key="pill" class="pill-results">
        <h4>{{ pill }}</h4>
        
        <!-- Multiple results -->
        <div v-if="isMultiResult && score.results" class="multiple-results">
          <div v-for="(result, index) in score.results" :key="index" class="result-item">
            <div class="result-header">
              <span class="rank">#{{ result.rank }}</span>
              <span class="similarity">{{ (result.similarity * 100).toFixed(1) }}% match</span>
            </div>
            <p class="chunk-text">{{ result.chunk_text }}</p>
            <div class="metadata">
              Page {{ result.page_number }} • 
              Characters {{ result.coordinates.char_start }}-{{ result.coordinates.char_end }}
            </div>
          </div>
        </div>
        
        <!-- Single result (backward compatible) -->
        <div v-else class="single-result">
          <div class="similarity">{{ (score.max_sim * 100).toFixed(1) }}% match</div>
          <p class="chunk-text">{{ score.best_chunk_text }}</p>
          <div class="metadata">
            Page {{ score.page_number }} • 
            Characters {{ score.coordinates.char_start }}-{{ score.coordinates.char_end }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface Props {
  results: SearchResult;
}

const props = defineProps<Props>();

const isMultiResult = computed(() => 
  props.results.nrOfResults && props.results.nrOfResults > 1
);
</script>
```

## CSS Styling Examples

```css
.search-results {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.resume-card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  margin-bottom: 24px;
  padding: 20px;
}

.pill-results {
  margin-bottom: 20px;
  padding-bottom: 20px;
  border-bottom: 1px solid #eee;
}

.pill-results:last-child {
  border-bottom: none;
}

.pill-results h4 {
  color: #2563eb;
  margin-bottom: 12px;
  font-size: 16px;
  font-weight: 600;
}

/* Single result styling */
.single-result {
  background: #f8fafc;
  padding: 16px;
  border-radius: 6px;
  border-left: 4px solid #10b981;
}

/* Multiple results styling */
.multiple-results {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.result-item {
  background: #f8fafc;
  padding: 16px;
  border-radius: 6px;
  border-left: 4px solid #3b82f6;
}

.result-item:nth-child(2) {
  border-left-color: #8b5cf6;
}

.result-item:nth-child(3) {
  border-left-color: #f59e0b;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.rank {
  background: #e5e7eb;
  color: #374151;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
}

.similarity {
  color: #059669;
  font-weight: 600;
  font-size: 14px;
}

.chunk-text {
  color: #374151;
  line-height: 1.6;
  margin: 8px 0;
}

.metadata {
  color: #6b7280;
  font-size: 12px;
  margin-top: 8px;
}
```

## Migration Strategy

### Phase 1: Backward Compatibility (No Changes Needed)
- Current frontend code will continue to work unchanged
- API defaults to `nr_of_results = 1`
- Response format remains the same

### Phase 2: Add Multi-Result Support
1. **Add UI controls** for selecting number of results (1, 2, or 3)
2. **Update API calls** to include `nr_of_results` parameter
3. **Handle both response formats** in your components
4. **Add styling** for multiple results display

### Phase 3: Enhanced UX
1. **Add result ranking indicators** (1st, 2nd, 3rd place)
2. **Implement expandable results** (show/hide additional matches)
3. **Add result comparison features**
4. **Implement result filtering/sorting**

## Performance Considerations

- **Database calls**: Same performance as single-result search (3 calls for 3 pills)
- **Response size**: Larger responses with multiple results
- **Frontend rendering**: Consider pagination for large result sets
- **Caching**: Results can be cached on frontend for better UX

## Error Handling

```typescript
try {
  const results = await searchPills(pills, nrOfResults);
  // Handle results
} catch (error) {
  if (error.message.includes('nr_of_results must be between 1 and 3')) {
    // Handle invalid parameter
    showError('Number of results must be between 1 and 3');
  } else {
    // Handle other errors
    showError('Search failed. Please try again.');
  }
}
```

## Testing

### Test Cases
1. **Backward compatibility**: `nr_of_results = 1` or not specified
2. **Multiple results**: `nr_of_results = 2` and `3`
3. **Edge cases**: Invalid `nr_of_results` values
4. **Empty results**: Pills with no matches
5. **Partial results**: Some pills have fewer matches than requested

### Example Test Data
```javascript
// Test with your existing data
const testPills = ["sales experience", "communication skills"];
const results = await searchPills(testPills, 3);
console.log('Results:', results);
```

## Support

For questions or issues:
1. Check the API response format matches examples above
2. Verify `nr_of_results` parameter is being sent correctly
3. Test with `nr_of_results = 1` first to ensure backward compatibility
4. Check browser network tab for actual API requests/responses

---

**Ready to implement!** 🚀 The API is fully functional and backward compatible. Start with Phase 1 (no changes) and gradually add multi-result support as needed.
