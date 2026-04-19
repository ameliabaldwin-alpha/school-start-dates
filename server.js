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

  try {
    let messages = req.body.messages;
    const body = { ...req.body };

    // Agentic loop — keep going until we get a final end_turn response
    for (let i = 0; i < 10; i++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...body, messages })
      });

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json(data);
      }

      // If we have a final answer, return it
      if (data.stop_reason === 'end_turn') {
        return res.json(data);
      }

      // If paused for tool use, add assistant response and continue
      if (data.stop_reason === 'pause_turn' || data.stop_reason === 'tool_use') {
        messages = [
          ...messages,
          { role: 'assistant', content: data.content },
          { role: 'user', content: [{ type: 'text', text: 'Continue.' }] }
        ];
        continue;
      }

      // Any other stop reason — just return what we have
      return res.json(data);
    }

    res.status(500).json({ error: 'Search took too long. Please try again.' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
