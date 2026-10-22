# Architecture and Data Flow

BhashaGuard is split into a Chrome Manifest V3 extension and a local Node.js analysis
service. The current implementation analyzes **one viewport at a time**. It is not a
full-page crawler, a whole-site auditor, or an accessibility compliance engine.

## Components

| Component | Path | Responsibility |
| --- | --- | --- |
| Popup | `extension/popup.js`, `extension/popup.html` | Starts scans, validates scan and analysis responses, renders findings, and sends Apply/Undo messages. |
| Content script | `extension/content.js` | Collects eligible visible text from the current viewport and maps candidate IDs to text nodes. |
| Correction core | `extension/correction-core.js` | Validates and performs a single temporary text-node correction and its undo. |
| Local API | `server/server.js` | Validates HTTP requests, applies CORS and request limits, and exposes `/health` and `/analyze`. |
| Analyzer | `server/analyzer.js` | Uploads the viewport screenshot, calls Gemma 4 through `@google/genai`, and validates the model's findings. |
| Synthetic fixture | `demo/index.html` | Labelled test page for local demonstrations and analysis runs. |
| Tests | `tests/` | Analyzer, server, correction-core, and headless-browser contract tests. |

## Scan and analysis flow

1. The user opens a regular webpage and clicks the BhashaGuard toolbar icon.
2. `popup.js` asks Chrome for the active tab. Pages with unsupported protocols are
   rejected before scanning.
3. The popup calls `chrome.tabs.captureVisibleTab` to capture the current viewport as a
   PNG data URL.
4. The popup injects `correction-core.js` and `content.js` with
   `chrome.scripting.executeScript`.
5. `content.js` walks visible text nodes in `document.body` and builds candidates:
   - text is normalized and must contain a letter or number;
   - text length must be between 2 and 320 characters;
   - the element must have a non-zero rectangle intersecting the current viewport;
   - hidden, inert, `aria-hidden`, script, style, form-control, canvas, iframe, and
     contenteditable content is excluded;
   - repeated text (case-insensitive) is included once;
   - the response contains at most **40** candidates;
   - `totalEligible` and `truncated` report when more eligible text exists than was
     returned.
6. The popup validates the scan response. If no candidates were found, the workflow stops
   and nothing is sent to the model.
7. The popup sends a JSON request to `POST http://127.0.0.1:8787/analyze`:
   - `sessionId`;
   - `targetLanguage: "mr"`;
   - `screenshot` (`image/png` or `image/jpeg`, as a base64 data URL, at most 8 MB);
   - candidate objects containing `id`, `text`, and `tag`;
   - optional viewport dimensions.
8. `server/server.js` requires JSON content, validates the payload, and calls the
   analyzer. The service binds to `127.0.0.1` and allows only Chrome-extension and
   loopback origins.
9. `server/analyzer.js` uploads the screenshot to the Gemini Files API, sends a prompt
   containing the candidate IDs and text to Gemma 4, and retries transient upstream
   failures up to three times. The default model is `gemma-4-26b-a4b-it`.
10. Before returning findings, the analyzer verifies that every finding:
    - uses a submitted candidate ID;
    - repeats that candidate's exact original text;
    - has a supported category and severity;
    - contains plain-text evidence and explanation;
    - contains plain-text suggested Marathi or `null`;
    - is not a duplicate and does not exceed the candidate count.
11. The popup validates the response again, adds the local `actionable` flag from the
    scan, and renders the findings. The model's `requiresHumanReview` value is always
    forced to `true`.
12. The reviewer may Apply a suitable finding or Skip it. Apply is not automatic.

## Apply and Undo boundary

The content script keeps the current scan's candidates in an in-memory registry. A
candidate is actionable only when its parent has no element children and exactly one
non-empty text node, and the node is not inside an excluded element.

Apply succeeds only when all of these checks pass:

- the candidate ID belongs to the current scan;
- the candidate is marked actionable;
- the submitted original text exactly matches the scanned text;
- the replacement is plain text, at most 500 characters, with no HTML or control
  characters;
- the mapped node still exists and is safe;
- the node's current value still equals the value captured during the scan;
- the candidate has not already been applied.

Undo succeeds only when the mapped node is still connected, still safe, and its current
value still matches the replacement that BhashaGuard applied. Undo restores the exact
original node value.

Corrections modify only the current page's DOM text node. They do not call the website's
server and do not survive a page reload.

## Data boundary

| Data | Destination | Notes |
| --- | --- | --- |
| Viewport screenshot | Local API, then Gemini Files API | Used as visual evidence for the analysis. The backend attempts to delete the uploaded file in a `finally` block. |
| Candidate ID, text, and tag | Local API, then the model prompt | Used to identify and evaluate visible strings. |
| Viewport dimensions | Local API | Validated by the backend; not required in the model prompt. |
| Current page URL | Not sent in the analysis payload | The popup uses it only to reject unsupported pages and display a hostname. |
| API key | `server/.env` only | Never included in extension code, requests, responses, or documentation. Backend errors are sanitized before logging. |
| Applied corrections | Current page DOM only | Temporary and reversible until the page is reloaded. |

## Trust and failure boundaries

- Page text and screenshots are untrusted input. The model is instructed not to follow
  instructions embedded in page content.
- Model output is untrusted data. It is parsed as JSON and validated twice before use.
- Model-generated HTML or JavaScript is never executed or inserted into the page.
- Request bodies, candidate counts, text lengths, screenshot type, and screenshot size are
  bounded by the local API.
- Unknown targets, stale text, nested content, ambiguous mappings, and duplicate applies
  are rejected rather than guessed.
- The `/health` endpoint reports the configured model name and whether a key is present;
  it never returns the key.

## Known limitations

- Only the current viewport is scanned. Content below the fold or outside the visible
  window is not included.
- At most 40 unique candidates are analyzed per scan. The UI labels a scan as partial when
  more eligible text was detected.
- There is no batch correction, persistent review history, or whole-site crawl.
- Model findings can be false positives or incomplete, and suggested Marathi may be
  imperfect. Human review is mandatory.
- The automated browser harness stubs Chrome tab APIs. It verifies extension logic but does
  not replace a manual unpacked-extension click-through in a regular Chrome profile.
- No official endorsement by DVET, the Government of Maharashtra, or any other
  organization is claimed.
