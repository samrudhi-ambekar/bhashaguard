# Demo Script

Use this script for a short, truthful hackathon demonstration. The goal is to show one
user-initiated viewport scan, evidence-backed findings, and a reviewed temporary correction
with Undo.

## Before the demo

1. Start the local API and confirm it is healthy:

   ```bash
   cd server
   npm start
   ```

   ```bash
   curl http://127.0.0.1:8787/health
   ```

   Confirm the response contains `"modelConfigured": true`. Never show the contents of
   `server/.env` on screen.

2. Load `extension/` as an unpacked extension from `chrome://extensions` and pin it to the
   toolbar.

3. Serve the synthetic fixture from the repository root:

   ```bash
   python3 -m http.server 8000 --bind 127.0.0.1 --directory .
   ```

4. Open `http://127.0.0.1:8000/demo/`. Confirm the page is explicitly labelled as a
   synthetic test page.

## Five-minute demonstration

1. **State the problem.** Marathi pages can still contain untranslated or mixed-language
   interface text. Manual review is slow, and automatic translation does not provide
   evidence or human review.

2. **Show the scope.** Explain that BhashaGuard scans the current visible viewport, up to
   40 unique candidates. It is not a full-page or whole-site audit.

3. **Start the scan.** Click the BhashaGuard icon, then **Scan this page**. Point out the
   progress states for viewport capture, text extraction, and Gemma 4 analysis.

4. **Explain the evidence.** The request contains a viewport screenshot and visible text
   candidates. The local backend validates the request and calls Gemma 4. The extension
   never contains the API key.

5. **Review the summary.** Point out:
   - candidates reviewed;
   - findings;
   - safely actionable corrections;
   - findings that need manual review;
   - the partial-scan warning, if shown.

6. **Open one finding.** Show the original text, suggested Marathi, category, severity,
   evidence, explanation, and actionability. Explain that nested or ambiguous text is
   deliberately marked non-actionable rather than guessed.

7. **Apply one safe correction.** Choose **Apply correction** only after checking that the
   finding is actionable. Point out that only the mapped text node changes.

8. **Undo it.** Choose **Undo correction** and show the original text returning. Explain
   that reloading the page also removes temporary corrections.

9. **Skip another finding.** Show that Skip leaves the page text unchanged.

10. **Close with the boundary.** BhashaGuard is a human-reviewed prototype for exploratory
    localization work. It is not an official accessibility audit and has no DVET or
    Government of Maharashtra endorsement.

## Optional live-page segment

A live public page can be used as an exploratory check if it is available and appropriate
to send to the configured model API. Keep the claim narrow:

- “This is one exploratory scan of the current viewport.”
- “These are the findings from this scan, not all issues on the site.”
- “Some findings may need manual review and may be incorrect.”

Do not scan private, logged-in, or sensitive pages during a public demo.

## If the model is unavailable

- Do not pretend a live analysis succeeded.
- Show the recorded runs in [evaluation notes](evaluation.md).
- Explain that the local API, extension loading, and scan flow can still be demonstrated,
  but a live model result cannot be claimed without a successful request.
- Fix configuration errors if possible: check `server/.env`, restart `npm start`, and
  confirm `/health`.

## Claims to avoid

Do not say or imply that BhashaGuard:

- scans the entire page or the entire website;
- found every issue or that every finding is correct;
- applied all corrections successfully;
- provides a complete accessibility or legal compliance audit;
- is endorsed, sponsored, or officially validated by DVET or the Government of
  Maharashtra;
- works automatically without human review.
