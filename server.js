const express = require('express');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function extractJSON(text) {
  try { return JSON.parse(text.trim()); } catch {}
  const stripped = text.replace(/```json|```/g, '').trim();
  try { return JSON.parse(stripped); } catch {}
  let depth = 0, start = -1, best = null;
  for (let i = 0; i < stripped.length; i++) {
    if (stripped[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (stripped[i] === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          const candidate = JSON.parse(stripped.slice(start, i + 1));
          if (candidate.districts) return candidate;
          best = candidate;
        } catch {}
        start = -1;
      }
    }
  }
  if (best) return best;
  throw new Error('No valid JSON found in response');
}

async function callClaudeWithWebSearch(apiKey, body) {
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  };

  let messages = [...body.messages];

  for (let i = 0; i < 30; i++) {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...body, messages })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `API error ${response.status}`);

    // Final answer
    if (data.stop_reason === 'end_turn') return data;

    // Server-side web search tool (pause_turn) — just continue, no tool_result needed
    if (data.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: data.content });
      messages.push({ role: 'user', content: [{ type: 'text', text: 'Continue.' }] });
      continue;
    }

    // Client-side tool_use — send back tool results
    if (data.stop_reason === 'tool_use') {
      const toolUseBlocks = data.content.filter(b => b.type === 'tool_use');
      messages.push({ role: 'assistant', content: data.content });
      const toolResults = toolUseBlocks.map(block => ({
        type: 'tool_result',
        tool_use_id: block.id,
        content: block.output || ''
      }));
      messages.push({ role: 'user', content: toolResults });
      continue;
    }

    return data;
  }
  throw new Error('Search took too long. Please try again.');
}

// Simple endpoint (no web search)
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

// Web search endpoint — server handles the loop and JSON extraction
app.post('/api/search-web', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set.' });

  const { address, radius, types, showLastDay } = req.body;

  const system = `You are a school calendar research assistant. Use web search to find accurate school start and end dates from official district websites.

Search for ${types} schools near the given location. For each school found, search for their official 2026-2027 academic calendar. If 2026-2027 is not published, use 2025-2026.

After all searches are complete, return ONLY this JSON with no other text before or after:
{"location":"City, State","note":null,"districts":[{"name":"District Name","city":"City, ST","startDate":"August 18, 2026","lastDay":${showLastDay ? '"June 4, 2027"' : 'null'},"schoolYear":"2026-2027","type":"public","sourceUrl":"https://...","confidence":"confirmed"}]}

Rules:
- Up to 6 results sorted by start date
- startDate must be a real date from the official calendar
- confidence: "confirmed" if from official site, "estimated" if from news, "unknown" if not found
- type: "public", "charter", or "private"
- Return ONLY the JSON object, nothing else whatsoever`;

  try {
    const data = await callClaudeWithWebSearch(apiKey, {
      model: 'claude-sonnet-4-5',
      max_tokens: 3000,
      system,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
      messages: [{ role: 'user', content: `Find ${types} schools within ${radius} miles of ${address}. Search each school's official website for their 2026-2027 start date.` }]
    });

    const textBlock = (data.content || []).find(b => b.type === 'text');
    if (!textBlock) return res.status(500).json({ error: 'No text response received.' });

    const parsed = extractJSON(textBlock.text);
    res.json(parsed);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
