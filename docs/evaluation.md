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

### 2026-10-22 — Genuine multimodal analysis through the local API

- Model: `gemma-4-26b-a4b-it`
- Input: a real 1200×900 PNG viewport capture of `demo/index.html` (377,428 bytes)
  and 38 visible text candidates extracted by `extension/content.js`.
- Request: `POST http://127.0.0.1:8787/analyze` with the screenshot and candidates.
- Result: HTTP 200 after 27.4 seconds, with 8 validated findings and all
  `requiresHumanReview` values set to `true`.
- Findings included navigation labels (`Home`, `Schemes`, `Admissions`,
  `Help & Support`, `About Us`), the `Notice` label, and the headings
  `Eligibility & admission process` and `Important dates`.
- Every finding matched a submitted candidate ID and its exact original text.
- One initial run received an intermittent upstream `500` from the model API.
  The analyzer now retries transient `5xx` responses up to three times; the
  subsequent genuine run succeeded.
- Limitation: this verifies the backend HTTP path and model integration. It does
  not prove behavior when the popup is loaded as a packed Chrome extension.
- No credentials, request headers, or API keys are recorded in this document.

### 2026-10-22 — Popup analysis flow

- Harness: headless Chrome served the popup over local HTTP with Chrome tab APIs
  stubbed. The analysis endpoint and network request were real.
- Deterministic states verified: loading, successful findings, no findings,
  API error, malformed finding, network failure, empty scan, capture error, and
  restricted page.
- The successful state rendered 2 finding cards with severity, category,
  suggested Marathi text, evidence, explanation, and a human-review notice.
  Markup-like candidate and evidence text stayed literal; no HTML or JavaScript
  executed.
- Genuine popup → `http://127.0.0.1:8787/analyze` → Gemma 4 run rendered
  8 finding cards from the real screenshot and 38 candidates, with no page
  errors.
- Limitation: branded headless Chrome cannot load an unpacked extension in this
  environment. A manual install in a regular Chrome profile is still required
  for final extension packaging verification.
