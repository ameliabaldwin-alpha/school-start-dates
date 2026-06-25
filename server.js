const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Main school search
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

// Look up a single school's website URL using web search
app.post('/api/lookup-url', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set.' });

  const { schoolName, city } = req.body;

  let messages = [{ role: 'user', content: `Find the official website homepage URL for "${schoolName}" in ${city}. Return ONLY the URL, nothing else. Example: https://www.austinisd.org` }];

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  };

  try {
    for (let i = 0; i < 15; i++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 200,
          tools: [{ type: 'web_search_20250305', name: 'web_search' }],
          messages
        })
      });

      const data = await response.json();
      if (!response.ok) return res.status(response.status).json({ error: data.error?.message });

      if (data.stop_reason === 'end_turn') {
        const textBlock = (data.content || []).find(b => b.type === 'text');
        const url = textBlock ? textBlock.text.trim() : null;
        return res.json({ url });
      }

      if (data.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: data.content });
        messages.push({ role: 'user', content: [{ type: 'text', text: 'Continue.' }] });
        continue;
      }

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

      return res.json({ url: null });
    }

    res.json({ url: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
