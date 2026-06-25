const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Main school search — uses Claude directly
app.post('/api/search', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set.' });

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json(data);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Calendar search — uses Google Custom Search + Claude to parse results
app.post('/api/calendar', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const googleKey = process.env.GOOGLE_API_KEY;
  const searchEngineId = process.env.GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set.' });
  if (!googleKey || !searchEngineId) return res.status(500).json({ error: 'Google search keys not set.' });

  const { schoolName, schoolYear } = req.body;

  try {
    // Step 1: Google search for the school calendar
    const query = encodeURIComponent(`${schoolName} ${schoolYear} academic calendar holidays breaks`);
    const googleUrl = `https://www.googleapis.com/customsearch/v1?key=${googleKey}&cx=${searchEngineId}&q=${query}&num=5`;

    const googleRes = await fetch(googleUrl);
    const googleData = await googleRes.json();

    if (!googleRes.ok) {
      return res.status(500).json({ error: googleData.error?.message || 'Google search failed.' });
    }

    // Extract search result snippets and links
    const results = (googleData.items || []).map(item => ({
      title: item.title,
      url: item.link,
      snippet: item.snippet
    }));

    if (!results.length) {
      return res.status(200).json({ events: [], sourceUrl: null, note: 'No calendar pages found.' });
    }

    // Step 2: Ask Claude to extract calendar events from the search results
    const searchContext = results.map((r, i) =>
      `Result ${i+1}: ${r.title}\nURL: ${r.url}\nSnippet: ${r.snippet}`
    ).join('\n\n');

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2000,
        system: `You extract school calendar events from Google search results. 
Return ONLY a raw JSON object with no markdown or explanation:
{
  "sourceUrl": "best URL found for the official calendar",
  "schoolYear": "${schoolYear}",
  "events": [
    { "name": "Event name", "date": "exact dates", "type": "break or holiday" }
  ]
}
- type is "break" for multi-day breaks, "holiday" for single days off
- Sort events chronologically
- Only include real events you can see in the snippets
- If insufficient data found, return events as empty array`,
        messages: [{
          role: 'user',
          content: `Extract all holidays and breaks for ${schoolName} ${schoolYear} from these search results:\n\n${searchContext}`
        }]
      })
    });

    const claudeData = await claudeRes.json();
    const textBlock = (claudeData.content || []).find(b => b.type === 'text');
    if (!textBlock) return res.status(500).json({ error: 'No response from Claude.' });

    let raw = textBlock.text.trim().replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
      else return res.status(500).json({ error: 'Could not parse calendar data.' });
    }

    res.json(parsed);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
