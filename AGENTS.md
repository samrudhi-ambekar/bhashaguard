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

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
