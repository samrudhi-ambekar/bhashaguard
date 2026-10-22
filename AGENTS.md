# BhashaGuard Development Instructions

Build BhashaGuard: Detect. Fix. Preview.

## Architecture
- Chrome Manifest V3
- Plain HTML, CSS and JavaScript for the extension
- Node.js and Express backend
- Official @google/genai SDK for Gemma 4
- Graphify-generated relationships from actual source code

## Workflow
- Inspect existing files and Git status before editing.
- Make small, verifiable changes.
- Preserve existing working code and Graphify-managed instructions.
- Report files changed, tests actually run, results, and blockers.
- Never claim a feature works without verification.

## Security
- Never commit API keys or local .env files.
- Never put the model key in extension code.
- Treat model responses as untrusted data.
- Never execute model-generated HTML or JavaScript.
- Require user approval before applying corrections.
- Verify the original page text before changing or restoring it.
- Modify only the current browser page, not the website server.

## Accuracy
- Never fabricate AI findings or Graphify relationships.
- Validate candidate IDs and original text before allowing corrections.
- Require human review of suggested translations.
