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

### 2026-10-22 — Temporary correction workflow

- Commands:
  - `node --test tests/correction-core.test.js` — 22 passed, 0 failed.
  - `cd server && npm test` — 48 passed, 0 failed.
  - `node --test tests/browser/integration.test.js` — 2 passed, 0 failed in
    headless Chrome 143.0.7499.146.
- The browser harness served the real `extension/correction-core.js`,
  `extension/content.js`, and `extension/popup.js` files from local HTTP. Chrome tab
  APIs were stubbed, but the page DOM and script execution were real.
- Content-script results:
  - The scan mapped a visible `Apply Now` text node to an actionable candidate.
  - Applying the selected finding changed only that text node; an unrelated
    candidate stayed unchanged.
  - Undo restored the exact original node value.
  - Two corrections applied independently; undoing the first left the second in
    place, and the second undo then restored the remaining text.
  - Unknown candidate IDs, mismatched original text, changed page text, removed
    targets, and non-actionable nested content were rejected with distinct codes.
    None of those rejected attempts modified the page.
  - A replacement containing `<img ... onerror=...>` was rejected as invalid plain
    text. No image element was inserted and the handler did not run.
  - A correction applied before `location.reload()` was absent after the reload;
    the source page text returned. The harness used a same-tab reload.
- Popup results:
  - The popup validated a deterministic analysis response through the real
    `validateAnalysisResponse` path. Candidate actionability was carried into the
    finding, and Apply appeared only for findings that had both a Marathi
    suggestion and `actionable === true`.
  - Non-actionable findings and findings without a suggestion showed an explicit
    reason instead of an Apply button.
  - Rendering findings triggered no correction messages; Apply required a click.
  - Apply sent the expected candidate ID, original text, and replacement text.
    Success showed Undo; Undo sent the expected candidate ID and restored the
    Apply button.
  - A simulated `TEXT_CHANGED` rejection kept Apply available and displayed the
    safe failure message.
  - Markup-like model text stayed literal in the popup and did not execute.
- Limitations:
  - These browser checks used deterministic, validated finding shapes rather than
    a new live Gemma request. The earlier genuine multimodal run remains the
    record of live model output; this run verifies the Apply/Undo workflow around
    validated findings.
  - Candidates are intentionally non-actionable when the immediate parent has
    element children or more than one non-empty text node. The model can see such
    text, but BhashaGuard will not apply a partial nested replacement.
  - Undo state lives only in the current content-script memory. Closing and
    reopening the popup, rescanning, or reloading the page removes the Undo
    affordance. Reloading also removes the temporary correction itself.
  - Branded headless Chrome cannot load the unpacked extension as a real toolbar
    popup in this environment.
- Manual Chrome steps still required:
  1. Start the local server with `cd server && npm start`.
  2. Open `chrome://extensions`, enable Developer mode, and load
     `/home/samrudhi/Projects/bhashaguard/extension` unpacked.
  3. Open `demo/index.html` over local HTTP and click the BhashaGuard toolbar icon.
  4. Click Scan, confirm findings that are safe to apply show Apply, and apply one.
  5. Confirm the exact page text changes, click Undo, and confirm the original
     returns.
  6. Apply another finding and reload the page; confirm the temporary correction
     disappears.
  7. Confirm a nested or ambiguous finding shows the not-safely-actionable message
     and no Apply button.
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

### 2026-10-22 — Live DVET Accessibility Policy scan, Gemma findings, Apply, and Undo

- Target: `https://www.dvet.gov.in/mr/accessibility-policy/` (page title:
  `Accessibility Policy | DVET MAHARASHTRA`).
- Harness: branded headless Chrome 143.0.7499.146 loaded the live page at a
  1280×900 viewport and executed the real `extension/correction-core.js` and
  `extension/content.js` in the page. The local server was already running at
  `http://127.0.0.1:8787`.
- Input: a real 186,360-byte PNG viewport screenshot and 40 visible-text
  candidates extracted by `extension/content.js` (`totalEligible` was 43 and the
  scan was marked `truncated`).
- Request: `POST http://127.0.0.1:8787/analyze` with `targetLanguage: "mr"`, the
  screenshot, and the candidate text and tags.
- Result: HTTP 200 after 27.9 seconds from `gemma-4-26b-a4b-it`, with 5
  validated findings. All findings had `requiresHumanReview: true` and matched
  submitted candidate IDs with exact original text.
- Findings returned:
  - `Accessibility Policy` → `प्रवेशयोग्यता धोरण` (untranslated, medium).
  - `Screen Readers` → `स्क्रीन रीडर्स` (untranslated, low; this candidate was
    not actionable because its immediate parent contains nested markup).
  - `S.No` → `अनु. क्र.` (untranslated, low).
  - `Website` → `वेबसाइट` (untranslated, low).
  - `Free/Commercial` → `मोफत/व्यावसायिक` (untranslated, medium).
- Selected correction: the actionable `<h1>` finding `Accessibility Policy` →
  `प्रवेशयोग्यता धोरण`.
  - The content script returned `APPLIED`.
  - Before and after contained 797 text nodes and 745 elements. Exactly one text
    node changed, at index 563, with parent tag `h1`; the new value was the
    proposed Marathi text. The candidate's exact original text was required.
  - A second Apply for the same candidate returned `ALREADY_APPLIED`.
  - Undo returned `UNDONE`; all 797 text-node values and the element count
    matched the pre-Apply snapshot exactly. A second Undo returned `NOT_APPLIED`.
- Negative and safety checks on the live page:
  - An unknown candidate ID returned `UNKNOWN_CANDIDATE`.
  - Mismatched original text returned `MISMATCHED_ORIGINAL`.
  - A non-actionable nested candidate returned `NOT_ACTIONABLE`.
  - A replacement containing `<img ... onerror=...>` returned
    `INVALID_REPLACEMENT`; no image or event handler was inserted.
  - None of the rejected attempts changed any text node.
  - Reloading returned the original `Accessibility Policy` heading and did not
    contain the temporary Marathi replacement.
- Scope and limitations:
  - This run exercised the real live page, real scanner, real local API, real
    multimodal Gemma request, real candidate-ID/text validation, and the actual
    correction/undo implementation. It did not use the installed toolbar popup's
    Chrome tab APIs or its Apply/Undo button clicks.
  - The popup's Apply/Undo gating and button wiring are covered by the separate
    browser harness run above with deterministic findings; the live Gemma
    findings were not clicked through a real toolbar popup.
  - Automated toolbar-popup testing was unavailable: branded headless Chrome did
    not load the temporary unpacked extension, its extension page resolved to
    `chrome-error://chromewebdata/`, and no `popup.html` target was created.
    `Xvfb`, `Xvnc`, and `xvfb-run` are not installed, so a headful automation
    fallback was not available.
- Manual Chrome steps still required for final toolbar verification:
  1. Start the local server with `cd server && npm start` and confirm
     `curl http://127.0.0.1:8787/health` reports the configured model.
  2. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**,
     and select `/home/samrudhi/Projects/bhashaguard/extension`.
  3. Open `https://www.dvet.gov.in/mr/accessibility-policy/` and click the
     BhashaGuard toolbar icon. Click **Scan this page**.
  4. Confirm a viewport screenshot preview, the scanned candidate count, and
     validated findings showing **Requires human review**.
  5. Apply the `Accessibility Policy` finding and confirm only that heading
     changes to Marathi while the surrounding navigation remains unchanged.
  6. Click **Undo correction**, confirm the English heading returns, then reload
     the page and confirm the temporary translation is absent.
  7. Confirm `Screen Readers` (or another nested candidate) shows the
     not-safely-actionable message and has no Apply button.
- Candidate counts can vary with viewport size, fonts, and page layout. If the
  model returns no finding for this heading on a later run, select any actionable
  finding that includes a Marathi suggestion; do not apply a non-actionable one.
- No credentials, request headers, API keys, or local `.env` contents are
  recorded in this document.
