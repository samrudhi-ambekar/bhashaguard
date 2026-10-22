# BhashaGuard Local API

Node.js and Express service for local Gemma 4 analysis. The extension's API key never
belongs in the extension; model credentials live only in the ignored `server/.env` file.

## Requirements

- Node.js 20 or newer
- A Gemini API key with access to the configured Gemma model

## Setup

```bash
cd server
npm install
cp .env.example .env
```

Edit `server/.env` locally:

```dotenv
GEMINI_API_KEY=your_real_key
GEMMA_MODEL=gemma-4-26b-a4b-it
PORT=8787
```

Never commit `server/.env`.

## Run

```bash
cd server
npm start
```

The service binds only to `127.0.0.1`. Verify it:

```bash
curl http://127.0.0.1:8787/health
```

Health reports the configured model name and whether a key is present. It never returns
the key itself.

## Tests

```bash
cd server
npm test
```

## Gemma connectivity smoke test

```bash
cd server
npm run smoke:model
```

This sends one minimal text-only request to the configured Gemma model. It prints the
model name and success/failure category, never the API key. The command exits nonzero on
failure. API errors are reported with sanitized messages and HTTP status where available.
