# Graph Report - bhashaguard  (2026-10-22)

## Corpus Check
- 20 files · ~17,725 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 3 file(s) not represented in the graph (top: (none) 1, .css 1, .example 1)

## Summary
- 199 nodes · 322 edges · 15 communities (12 shown, 3 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.86)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `686886d0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- handleScanClick
- manifest.json
- integration.test.js
- package.json
- BhashaGuard Development Instructions
- content.js
- BhashaGuard
- Verified runs
- server.js
- analyzer.js
- BhashaGuard Local API
- correction-core.test.js

## God Nodes (most connected - your core abstractions)
1. `handleScanClick()` - 19 edges
2. `ScanError` - 13 edges
3. `validateModelFindings()` - 10 edges
4. `createApp()` - 9 edges
5. `createCorrectionManager()` - 8 edges
6. `buildFindingItem()` - 8 edges
7. `AnalysisError` - 8 edges
8. `initializePopup()` - 7 edges
9. `validateAnalyzeRequest()` - 7 edges
10. `BhashaGuard Local API` - 7 edges

## Surprising Connections (you probably didn't know these)
- `2026-10-22 — Temporary correction workflow` --references--> `validateAnalysisResponse()`  [INFERRED]
  docs/evaluation.md → extension/popup.js
- `createHarness()` --calls--> `createCorrectionManager()`  [EXTRACTED]
  tests/correction-core.test.js → extension/correction-core.js
- `assertInvalid()` --calls--> `validateModelFindings()`  [EXTRACTED]
  tests/analyzer.test.js → server/analyzer.js

## Import Cycles
- None detected.

## Communities (15 total, 3 thin omitted)

### Community 0 - "handleScanClick"
Cohesion: 0.12
Nodes (39): ANALYSIS_ERROR_MESSAGES, buildFindingItem(), captureViewport(), CATEGORY_GROUP_BY_CATEGORY, CATEGORY_LABELS, CORRECTION_ERROR_MESSAGES, countSafeFindings(), createFindingField() (+31 more)

### Community 1 - "manifest.json"
Cohesion: 0.20
Nodes (9): action, default_popup, default_title, description, host_permissions, manifest_version, name, permissions (+1 more)

### Community 2 - "integration.test.js"
Cohesion: 0.13
Nodes (10): classifyError(), envPath, main(), normalizeResponse(), sanitizeMessage(), scriptDirectory, chromePath, contentType() (+2 more)

### Community 3 - "package.json"
Cohesion: 0.10
Nodes (19): dotenv, express, @google/genai, dependencies, dotenv, express, @google/genai, description (+11 more)

### Community 4 - "BhashaGuard Development Instructions"
Cohesion: 0.29
Nodes (6): Accuracy, Architecture, BhashaGuard Development Instructions, graphify, Security, Workflow

### Community 5 - "content.js"
Cohesion: 0.46
Nodes (6): getNodeId(), getVisibleRect(), isActionableTextNode(), isEligibleText(), normalizeText(), scanViewport()

### Community 6 - "BhashaGuard"
Cohesion: 0.50
Nodes (3): BhashaGuard, Planned Features, Status

### Community 9 - "Verified runs"
Cohesion: 0.25
Nodes (7): 2026-10-22 — Gemma 4 text-only API connectivity, 2026-10-22 — Genuine multimodal analysis through the local API, 2026-10-22 — Live DVET Accessibility Policy scan, Gemma findings, Apply, and Undo, 2026-10-22 — Popup analysis flow, 2026-10-22 — Temporary correction workflow, Evaluation, Verified runs

### Community 11 - "server.js"
Cohesion: 0.18
Nodes (19): corsMiddleware(), createApp(), errorHandler(), isBoundedString(), isJpeg(), isPlainObject(), isPng(), model (+11 more)

### Community 12 - "analyzer.js"
Cohesion: 0.11
Nodes (20): AnalysisError, analyzeLocalization(), buildPrompt(), CATEGORIES, classifyUpstreamError(), containsHtml(), generateAnalysis(), invalidResponse() (+12 more)

### Community 13 - "BhashaGuard Local API"
Cohesion: 0.25
Nodes (7): BhashaGuard Local API, Gemma connectivity smoke test, Requirements, Run, Setup, Tests, Verified connectivity

### Community 14 - "correction-core.test.js"
Cohesion: 0.19
Nodes (11): createCorrectionManager(), apply(), hasApplicationForNode(), undo(), failure(), validateReplacementText(), createCandidate(), {
  createCorrectionManager,
  validateReplacementText,
} (+3 more)

## Knowledge Gaps
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `@google/genai` connect `package.json` to `integration.test.js`, `analyzer.js`?**
  _High betweenness centrality (0.044) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `createApp()` (e.g. with `corsMiddleware()` and `errorHandler()`) actually correct?**
  _`createApp()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **Should `handleScanClick` be split into smaller, more focused modules?**
  _Cohesion score 0.11707317073170732 - nodes in this community are weakly interconnected._
- **Why does `dotenv` connect `package.json` to `integration.test.js`, `server.js`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Are the 5 inferred relationships involving `createCorrectionManager()` (e.g. with `correction-core.js` and `appliedCount()`) actually correct?**
  _`createCorrectionManager()` has 5 INFERRED edges - model-reasoned connections that need verification._
- **Should `integration.test.js` be split into smaller, more focused modules?**
  _Cohesion score 0.12631578947368421 - nodes in this community are weakly interconnected._
- **Should `package.json` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._