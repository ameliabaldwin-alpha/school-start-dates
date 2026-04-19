# School Start Dates App

Find school start dates for districts near any address, powered by Claude AI + web search.

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Set your Anthropic API key
```bash
# Mac/Linux
export ANTHROPIC_API_KEY=sk-ant-...

# Windows (Command Prompt)
set ANTHROPIC_API_KEY=sk-ant-...

# Windows (PowerShell)
$env:ANTHROPIC_API_KEY="sk-ant-..."
```

### 3. Run the app
```bash
npm start
```

Then open http://localhost:3000 in your browser.

---

## Deploy to the web (free options)

### Option A — Railway (easiest, ~2 min)
1. Push this folder to a GitHub repo
2. Go to railway.app → New Project → Deploy from GitHub
3. Add environment variable: `ANTHROPIC_API_KEY` = your key
4. Done — Railway gives you a public URL

### Option B — Render
1. Push to GitHub
2. Go to render.com → New Web Service → connect repo
3. Build command: `npm install`
4. Start command: `npm start`
5. Add env var: `ANTHROPIC_API_KEY`

### Option C — Fly.io
```bash
npm install -g flyctl
fly launch
fly secrets set ANTHROPIC_API_KEY=sk-ant-...
fly deploy
```

---

## Project structure
```
school-dates-app/
├── server.js        ← Node/Express proxy server
├── package.json
├── README.md
└── public/
    └── index.html   ← Frontend (served by Express)
```

The server proxies `/api/search` → Anthropic API so your API key stays secret on the server.
