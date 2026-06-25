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
    let messages = [...req.body.messages];
    const requestBody = { ...req.body };

    // Agentic loop — handle web search tool calls until end_turn
    for (let i = 0; i < 15; i++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers,
        body: JSON.stringify({ ...requestBody, messages })
      });

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json(data);
      }

      // Final answer — return it
      if (data.stop_reason === 'end_turn') {
        return res.json(data);
      }

      // Tool use — collect results and continue
      if (data.stop_reason === 'tool_use') {
        const toolUseBlocks = data.content.filter(b => b.type === 'tool_use');

        // Add assistant message with tool calls
        messages.push({ role: 'assistant', content: data.content });

        // Build tool results — for server-side web_search the results come back in the response
        // We just need to acknowledge each tool_use block
        const toolResults = toolUseBlocks.map(block => ({
          type: 'tool_result',
          tool_use_id: block.id,
          content: block.output || 'Search completed.'
        }));

        messages.push({ role: 'user', content: toolResults });
        continue;
      }

      // pause_turn — web search is running server-side, just continue
      if (data.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: data.content });
        messages.push({ role: 'user', content: [{ type: 'text', text: 'Continue and return the final JSON.' }] });
        continue;
      }

      // Any other stop reason — return what we have
      return res.json(data);
    }

    res.status(500).json({ error: 'Search took too long. Please try again.' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
