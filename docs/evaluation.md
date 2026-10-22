# Evaluation

## Verified runs

### 2026-10-22 — Gemma 4 text-only API connectivity

- Model: `gemma-4-26b-a4b-it`
- Command: `cd server && npm run smoke:model`
- Result: OK
- Sanitized response: `BhashaGuard Gemma 4 connectivity OK`
- Scope: one minimal text-only request using the official `@google/genai` SDK and the
  API key loaded from the ignored `server/.env` file.
- Limitation: this verifies text API access only. It does not verify screenshot input,
  localization findings, or the extension-to-backend analysis flow.
- No API key, request headers, or credential values are recorded in this document.
