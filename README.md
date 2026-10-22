# BhashaGuard

**Detect. Fix. Preview.** A privacy-conscious browser extension for AI-assisted Marathi
localization review.

BhashaGuard is a Chrome Manifest V3 extension that helps a human reviewer find and
temporarily correct untranslated or mixed-language UI text on Marathi webpages. A scan is
always started by the user. Visible text from the current viewport and a viewport
screenshot are sent to a local Node.js service, which asks Gemma 4 for evidence-backed
localization findings. Suggestions are never applied automatically.

> **Status:** working hackathon prototype. The current scanner is **viewport-scoped**, not a
> full-page or whole-site audit. It is a review aid, not an official accessibility
> certification. BhashaGuard has no affiliation with, endorsement from, or validation by
> DVET or the Government of Maharashtra.

## The problem

Public-facing Marathi pages often contain a mixture of Marathi and English interface
labels. An English “Apply Now”, an untranslated heading, or terminology that changes from
one section to another can make an otherwise localized page harder to use. Reviewing those
strings by hand is slow, and machine translation alone is not enough for public-facing
content: context, terminology, and the final wording need human judgment.

## What BhashaGuard does

1. The user opens a page and clicks the BhashaGuard toolbar icon.
2. The popup captures the current viewport and injects the scanner into the active tab.
3. The scanner collects visible text candidates, excluding hidden content, form values,
   scripts, styles, and other unsafe or unreliable elements.
4. The popup sends the screenshot and candidates to the local API at
   `http://127.0.0.1:8787`.
5. The local API validates the request and sends the screenshot and candidate text to
   Gemma 4 through the official `@google/genai` SDK.
6. Findings are validated against the submitted candidate IDs and exact original text
   before the popup displays them.
7. The reviewer sees the original text, suggested Marathi, severity, explanation,
   evidence, and whether a safe one-click correction exists.
8. Apply changes only the validated text node on the current page. Undo restores the exact
   original text. Reloading the page removes temporary corrections.

## Feature status

| Capability | Status | Current behavior |
| --- | --- | --- |
| User-initiated scan | Implemented | Scans the current viewport only; nothing is read until the user clicks Scan. |
| Visible-text extraction | Implemented | Walks visible text nodes, deduplicates text, and excludes hidden or unsafe elements. |
| Screenshot evidence | Implemented | Captures the visible viewport with `chrome.tabs.captureVisibleTab`. |
| Local backend | Implemented | Express service on `127.0.0.1:8787` with `/health` and `/analyze`. |
| Gemma 4 analysis | Implemented | Uses the official `@google/genai` SDK; default model `gemma-4-26b-a4b-it`. A live run is recorded in [evaluation notes](docs/evaluation.md). |
| Evidence-backed findings | Implemented | Shows category, severity, explanation, evidence, original text, and suggested Marathi. |
| Human review gate | Implemented | No finding is applied automatically. |
| Single Apply / Undo | Implemented | Changes one validated text node; rejects stale or changed text; reload restores the source page. |
| Skip | Implemented | Review-only; sends no browser message and changes no page text. |
| Full-page scan | **Not implemented** | Only the current viewport is scanned, with a maximum of 40 unique candidates. |
| Batch Apply / Undo All | **Not implemented** | Corrections are applied one finding at a time. |
| Whole-site audit | **Not implemented** | Each scan covers one page viewport. |
| Side panel | **Not implemented** | The extension uses the toolbar popup. |
| Graphify code graph | Development tooling | Generated locally for code navigation; not required at runtime. |

## Technology stack

- **Extension:** Chrome Manifest V3, plain HTML, CSS, and JavaScript.
- **Backend:** Node.js 20+, Express 5.
- **Model integration:** `@google/genai`, Gemma 4 (`gemma-4-26b-a4b-it` by default).
- **Configuration:** `dotenv`, with the API key stored only in the ignored `server/.env`.
- **Testing:** Node.js test runner, plus a headless Chrome integration harness for the
  content script and popup contracts.
- **Development analysis:** Graphify for a local code knowledge graph.
- **Demo fixture:** static HTML served with Python 3’s `http.server` (no Python runtime
  dependency for the extension or backend).

## Architecture and data flow

```text
Chrome toolbar popup
  ├─ chrome.tabs.captureVisibleTab ───────────────► viewport PNG
  └─ chrome.scripting.executeScript
        └─ extension/content.js
              └─ visible text candidates (max 40)
                         │
                         ▼
POST http://127.0.0.1:8787/analyze
  { sessionId, targetLanguage: "mr", screenshot, candidates, viewport }
                         │
                         ▼
Express validation ──► server/analyzer.js ──► @google/genai ──► Gemma 4
                         │
                         ▼
validated JSON findings ──► popup validation ──► human review
                         │
                         ▼
             Apply / Undo messages ──► correction-core.js
                         └─ one validated text node only
```

### Data sent to the local backend

- A viewport screenshot as a base64 data URL.
- Visible text candidates: candidate ID, text, and tag.
- The target language (`mr` for Marathi), a random session ID, and optional viewport size.
- No API key is included in extension code or extension requests.

### Data sent to the external model

- The local backend sends the screenshot and candidate text to Google’s Gemini API using
  the server-side API key.
- The backend uploads the screenshot to the Gemini Files API for the request and attempts
  to delete it in a `finally` block. BhashaGuard does not intentionally persist scan data.
- Google’s handling of API data is governed by the applicable Google API terms.

### Safety boundaries

- The model response is untrusted. The backend rejects unknown candidate IDs, mismatched
  original text, duplicate findings, unsupported categories or severities, HTML, control
  characters, and oversized fields.
- The popup validates the response again before rendering it.
- The extension never executes model-generated HTML or JavaScript.
- Apply is available only when a finding has both a suggested Marathi string and an
  actionable, safely mapped text node.
- The content script verifies the original text before applying, refuses stale or changed
  targets, and restores text only when the current value still matches the replacement.
- The local API binds to `127.0.0.1`; CORS allows only Chrome-extension and local origins.

## Setup (Ubuntu/Linux)

### 1. Prerequisites

- Ubuntu/Linux (or a comparable environment).
- Node.js **20 or newer** and npm. The backend declares `"node": ">=20"`.
- Google Chrome or Chromium for loading the unpacked extension.
- A Gemini API key with access to the configured Gemma model.
- Python 3 only if you want to serve the synthetic demo over local HTTP.

The documented test environment used Node `v24.12.0`, npm `11.6.2`, Chrome
`143.0.7499.146`, and Python `3.12.3`.

### 2. Clone the repository

```bash
git clone https://github.com/samrudhi-ambekar/bhashaguard.git
cd bhashaguard
```

### 3. Configure and start the local API

```bash
cd server
npm ci
cp .env.example .env
```

Edit `server/.env` locally:

```dotenv
GEMINI_API_KEY=replace_with_your_local_key
GEMMA_MODEL=gemma-4-26b-a4b-it
PORT=8787
```

Start the service in one terminal:

```bash
cd server
npm start
```

Verify it:

```bash
curl http://127.0.0.1:8787/health
```

A configured local service returned:

```json
{"ok":true,"status":"ok","service":"bhashaguard-server","version":"0.1.0","model":"gemma-4-26b-a4b-it","modelConfigured":true}
```

Keep this terminal running while using the extension.

> **Key handling:** put the Gemini key only in `server/.env`. Never put it in extension
> code, commit it, paste it into a screenshot, or include it in an issue. The file is
> ignored by `.gitignore`.

### 4. Load the extension

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Choose **Load unpacked** and select the repository’s `extension/` directory.
4. Pin BhashaGuard to the toolbar if Chrome hides it in the extensions menu.

The extension requests `activeTab` and `scripting` permissions and access only to the local
API at `http://127.0.0.1:8787/*`.

### 5. Serve and open the synthetic demo

From the repository root, in a second terminal:

```bash
python3 -m http.server 8000 --bind 127.0.0.1 --directory .
```

Open:

```text
http://127.0.0.1:8000/demo/
```

The page is explicitly labelled **SYNTHETIC TEST PAGE**. It is a fixture for testing, not
an official DVET page and not a real audit.

If port 8000 is already in use, choose another port and change the URL. The extension
still expects the backend at port 8787.

### 6. Run a scan

1. Click the BhashaGuard toolbar icon.
2. Click **Scan this page**.
3. Wait for the viewport screenshot and visible-text scan to complete.
4. Review the scan summary and the partial-scan warning if it appears.
5. Open a finding and read the original text, suggested Marathi, evidence, explanation,
   severity, and actionability.
6. For a safely actionable finding, choose **Apply correction** only after reviewing it.
7. Choose **Undo correction** to restore the original page text. Reloading also removes
   temporary corrections.
8. Choose **Skip** to leave a finding unchanged; Skip does not send a page message.

## Testing

### Automated tests

Run the backend, analyzer, and correction-core tests:

```bash
cd server
npm test
```

Run the headless-browser integration tests (Chrome/Chromium required):

```bash
node --test tests/browser/integration.test.js
```

Run JavaScript syntax checks:

```bash
node --check extension/popup.js
node --check extension/content.js
node --check extension/correction-core.js
node --check server/server.js
node --check server/analyzer.js
node --check server/scripts/model-smoke-test.js
```

### Last verified results — 2026-10-22

| Check | Result |
| --- | --- |
| `cd server && npm test` | **48 passed, 0 failed** |
| `node --test tests/browser/integration.test.js` | **2 passed, 0 failed** |
| Total automated tests | **50 passed, 0 failed** |
| JavaScript syntax checks | Passed |
| JSON validation for `extension/manifest.json`, `server/package.json`, `server/package-lock.json` | Passed |
| Local API `/health` | HTTP 200; model configured |
| Synthetic demo served from `demo/` | HTTP 200 |
| `npm ci --dry-run` | Up to date; lockfile consistent |

The browser tests run the real extension content script and popup logic in headless Chrome.
They stub Chrome tab APIs and use deterministic finding shapes. They do **not** replace a
manual install of the unpacked extension in a regular Chrome profile.

### Optional live model check

```bash
cd server
npm run smoke:model
```

This sends one minimal text-only request to the configured Gemma model. It requires a valid
key and network access, is not part of `npm test`, and never prints the key. A successful
run is recorded in [evaluation notes](docs/evaluation.md).

### Manual testing

Use the synthetic demo first:

1. Confirm `/health` reports `"modelConfigured": true`.
2. Load `extension/` unpacked and open the demo over `http://127.0.0.1:8000/demo/`.
3. Scan and confirm the summary separates candidates examined, findings, safely
   actionable corrections, and items needing manual review.
4. Confirm a partial scan is labelled partial and does not claim full-page coverage.
5. Apply an actionable finding; confirm only the mapped text changes.
6. Undo and confirm the original text returns. Reload and confirm the temporary
   correction is gone.
7. Confirm nested or ambiguous findings do not expose Apply and explain why.
8. Confirm Skip leaves the page unchanged.

Current manual/exploratory record:

- The local API health response above was verified on 2026-10-22.
- The synthetic demo was served successfully at `http://127.0.0.1:8000/demo/`.
- A genuine multimodal backend run and an exploratory live DVET page run are recorded in
  [evaluation notes](docs/evaluation.md). Those are exploratory observations, not a
  full-site audit and not proof that every finding was correct.
- Manual verification of the installed toolbar popup in a regular Chrome profile is still
  pending. Automated popup tests cover layout states and Apply/Skip/Undo wiring with
  stubbed Chrome APIs.

## Screenshots

No verified product screenshots are committed to the repository yet. The screenshot
milestone will add only real captures, with captions and without keys, private tabs, or
personal data:

- popup before scanning;
- scan summary and extracted-text evidence;
- exploratory DVET Marathi Accessibility Policy findings;
- a finding showing original text, suggested Marathi, evidence, and actionability;
- Apply and Undo states, only if actually captured and verified;
- the synthetic demo page, clearly labelled as synthetic.

No mockups or invented states will be presented as product evidence. Relative links will
be added when the files exist.

## Privacy, safety, and limitations

### Privacy

- Scans are user-initiated. Nothing is read until the user clicks Scan.
- The extension sends page content to the local backend, which forwards it to the external
  Gemini API for analysis.
- Screenshots can contain sensitive or personal information. Only scan pages you are
  authorized to send to the configured model provider.
- The API key stays in `server/.env`; the extension never receives it.
- BhashaGuard does not include analytics or telemetry.
- The local API is bound to loopback and restricts CORS, but it still calls an external API.

### Safety

- Model output is treated as untrusted data and validated before display or use.
- No model-generated HTML or JavaScript is executed.
- Human review is required before any correction. Apply is never automatic.
- Corrections are temporary DOM text-node changes; the website server is not modified.
- Stale, changed, ambiguous, nested, or unsafe targets are rejected.
- Reloading the page naturally restores the source content.

### Limitations

- **Viewport only.** The current scanner does not scan below the fold or the whole page.
  The UI reports partial scans when more than 40 eligible candidates are found.
- **Not a full accessibility audit.** BhashaGuard looks for selected localization
  issues; it does not test keyboard navigation, screen-reader behavior, contrast, or legal
  compliance.
- **Model findings can be wrong.** False positives, missed issues, and imperfect Marathi
  suggestions are possible. Human judgment is mandatory.
- **Single corrections only.** There is no batch Apply, batch Undo, or whole-page review
  workflow yet.
- **No persistent review history.** Undo is available only during the current page session;
  rescanning, reopening the popup, or reloading removes the Undo affordance. Reloading also
  removes temporary corrections.
- **Network and API limits.** Analysis requires the local backend, network access to the
  model API, and a valid key. Rate limits, latency, and API costs apply.
- **Manual toolbar verification pending.** The automated harnesses are not a substitute
  for a real installed-extension click-through.
- **No official endorsement.** DVET and the Government of Maharashtra have not endorsed,
  sponsored, or validated this project.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| `MODEL_NOT_CONFIGURED` | Add `GEMINI_API_KEY` to `server/.env` and restart `npm start`. |
| `MODEL_AUTH_FAILED` | Verify the key and that it has access to the configured model. |
| `MODEL_RATE_LIMITED` | Wait for the quota/rate limit to reset, then retry. |
| “could not reach its local analysis server” | Start `cd server && npm start`; confirm `curl http://127.0.0.1:8787/health`. |
| “Chrome blocked BhashaGuard from reading this page” | Use a regular `http`/`https` page, reload it, or use the local demo. Some browser pages cannot be scanned. |
| Screenshot capture fails | Some pages/windows block capture. Try the local demo or a normal browser window. |
| `TEXT_CHANGED` or `STALE_TARGET` | The page changed after scanning. Rescan before applying. |
| No findings | The model may legitimately return an empty result. Check the backend log and try the synthetic demo. |
| Port 8787 is occupied | Stop the conflicting process. The extension expects the backend on port 8787. |
| Demo port 8000 is occupied | Use another port for `python3 -m http.server` and update the browser URL. |
| Browser tests are skipped | Install Chrome/Chromium or set `CHROME_BIN` to its executable. |
| `npm ci` fails | Confirm Node.js 20+ and a clean `server/package-lock.json`. |

## Documentation

- [Architecture and data flow](docs/architecture.md)
- [Evaluation notes and recorded runs](docs/evaluation.md)
- [Demo script](docs/demo-script.md)
- [Privacy and safety notes](docs/privacy.md)
- [Local API setup and smoke test](server/README.md)
- [Synthetic demo fixture](demo/index.html)
- [Development instructions](AGENTS.md)

## Repository layout

```text
extension/        Chrome Manifest V3 extension
server/           Local Express API and Gemma integration
demo/             Synthetic localization test page
tests/            Analyzer, server, correction-core, and browser tests
docs/             Architecture, evaluation, demo, and privacy notes
```

---

BhashaGuard is a hackathon prototype. Use it for human-reviewed exploratory localization
work, not as an automatic translator or an official compliance tool.
