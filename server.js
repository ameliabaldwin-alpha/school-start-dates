const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/search', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set on server.' });
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01'
  };

  const hasWebSearch = (req.body.tools || []).some(t => t.name === 'web_search');

  try {
    // Simple single call for non-web-search requests (main school search)
    if (!hasWebSearch) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify(req.body)
      });
      const data = await response.json();
      if (!response.ok) return res.status(response.status).json(data);
      return res.json(data);
    }

    // Agentic loop for web search requests (calendar lookup)
    let messages = [...req.body.messages];
    const requestBody = { ...req.body };

    for (let i = 0; i < 20; i++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...requestBody, messages })
      });

      const data = await response.json();
      if (!response.ok) return res.status(response.status).json(data);

      // Done — return final answer
      if (data.stop_reason === 'end_turn') {
        return res.json(data);
      }

      // Tool use — pass back results and continue
      if (data.stop_reason === 'tool_use') {
        const toolUseBlocks = data.content.filter(b => b.type === 'tool_use');
        messages.push({ role: 'assistant', content: data.content });
        const toolResults = toolUseBlocks.map(block => ({
          type: 'tool_result',
          tool_use_id: block.id,
          content: block.output || 'Search completed.'
        }));
        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      // pause_turn — web search running server-side, continue
      if (data.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: data.content });
        messages.push({ role: 'user', content: [{ type: 'text', text: 'Continue and return the final JSON.' }] });
        continue;
      }

      return res.json(data);
    }

    res.status(500).json({ error: 'Calendar search took too long. Please try again.' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
