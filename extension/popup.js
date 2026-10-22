"use strict";

const SCAN_MESSAGE_TYPE = "BHASHAGUARD_SCAN";
const ANALYSIS_ENDPOINT = "http://127.0.0.1:8787/analyze";
const ANALYSIS_TIMEOUT_MS = 120_000;
const PREVIEW_LIMIT = 8;
const MAX_ERROR_LENGTH = 180;
const MAX_FINDING_TEXT_LENGTH = 1_200;

const CATEGORY_LABELS = {
  untranslated: "Untranslated",
  mixed_language: "Mixed language",
  incomplete_translation: "Incomplete translation",
  inconsistent_terminology: "Inconsistent terminology",
  unnatural_wording: "Unnatural wording",
  other: "Other",
};

const SEVERITY_LABELS = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const ANALYSIS_ERROR_MESSAGES = {
  MODEL_NOT_CONFIGURED:
    "Gemma 4 is not configured on the local server. Add GEMINI_API_KEY to server/.env and restart the server.",
  MODEL_AUTH_FAILED:
    "The local server could not authenticate with the Gemma API. Check the key in server/.env.",
  MODEL_RATE_LIMITED:
    "Gemma 4 is temporarily rate-limited by the API. Wait a moment and try again.",
  MODEL_UNAVAILABLE:
    "The configured Gemma model is not available to this API key. Check GEMMA_MODEL in server/.env.",
  MODEL_REQUEST_REJECTED:
    "Gemma 4 rejected the analysis request. Check the server log and try again.",
  MODEL_NETWORK_ERROR:
    "The local server could not reach the Gemma API. Check the network connection and try again.",
  INVALID_MODEL_RESPONSE:
    "Gemma 4 returned a response that failed BhashaGuard's validation. No findings were shown.",
  INVALID_REQUEST:
    "The local server rejected the scan data. Reload the page and try again.",
  PAYLOAD_TOO_LARGE:
    "The viewport screenshot was too large for the local server. Resize the window and try again.",
};

const els = {
  hostname: document.getElementById("hostname"),
  scanButton: document.getElementById("scan-button"),
  scanButtonLabel: document.getElementById("scan-button-label"),
  status: document.getElementById("status"),
  statusSpinner: document.getElementById("status-spinner"),
  results: document.getElementById("results"),
  candidateCount: document.getElementById("candidate-count"),
  resultSummary: document.getElementById("result-summary"),
  candidateList: document.getElementById("candidate-list"),
  resultMore: document.getElementById("result-more"),
  screenshotPreview: document.getElementById("screenshot-preview"),
  screenshotCaption: document.getElementById("screenshot-caption"),
  findings: document.getElementById("findings"),
  findingCount: document.getElementById("finding-count"),
  findingsSummary: document.getElementById("findings-summary"),
  findingsList: document.getElementById("findings-list"),
  findingsEmpty: document.getElementById("findings-empty"),
};

const state = {
  scanning: false,
  pageBlocked: false,
  screenshotDataUrl: null,
};

class ScanError extends Error {
  constructor(message) {
    super(message);
    this.name = "ScanError";
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePopup, { once: true });
} else {
  initializePopup();
}

async function initializePopup() {
  els.scanButton.addEventListener("click", handleScanClick);

  try {
    const tab = await getActiveTab();
    if (!tab) {
      els.hostname.textContent = "No active tab";
      setStatus("No active tab was found. Open a website and reopen BhashaGuard.", "error");
      return;
    }

    els.hostname.textContent = describePage(tab);

    if (typeof tab.url === "string" && !isScannableUrl(tab.url)) {
      state.pageBlocked = true;
      els.scanButton.disabled = true;
      els.scanButton.title = "Scanning is unavailable on this page.";
      setStatus(
        "Chrome blocks extensions on this page. Open a regular website or the local demo page.",
        "error"
      );
    }
  } catch (error) {
    setStatus(friendlyError(error), "error");
  }
}

async function handleScanClick() {
  if (state.scanning) {
    return;
  }

  resetResults();
  state.screenshotDataUrl = null;
  setScanning(true);

  try {
    const tab = await getActiveTab();
    if (!tab || typeof tab.id !== "number") {
      throw new ScanError("No scanable active tab was found. Open a website and try again.");
    }

    els.hostname.textContent = describePage(tab);

    if (typeof tab.url !== "string") {
      throw new ScanError(
        "Chrome did not share this tab's address. Open a regular website and try again."
      );
    }

    if (!isScannableUrl(tab.url)) {
      throw new ScanError(
        "Chrome blocks extensions on this page. Open a regular website or the local demo page."
      );
    }

    setStatus("Capturing the visible viewport…", "progress");
    const screenshot = await captureViewport(tab);
    state.screenshotDataUrl = screenshot;

    setStatus("Reading visible text in this viewport…", "progress");
    await ensureScannerInjected(tab.id);
    const response = await requestScan(tab.id);
    const result = validateScanResponse(response);

    renderResults(result, screenshot);

    if (result.candidates.length === 0) {
      setStatus(
        "Scan complete, but no eligible visible text was found in this viewport.",
        "warning"
      );
      return;
    }

    const count = result.candidates.length;
    const candidateLabel = count === 1 ? "candidate" : "candidates";
    setStatus(`Sending the screenshot and ${count} ${candidateLabel} to Gemma 4…`, "progress");
    els.scanButtonLabel.textContent = "Analyzing with Gemma 4…";

    try {
      const analysis = await requestAnalysis(result, screenshot);
      renderFindings(analysis);

      if (analysis.findings.length === 0) {
        setStatus(
          `Analysis complete. Gemma 4 found no localization issues in these ${count} ${candidateLabel}.`,
          "success"
        );
      } else {
        const findingLabel = analysis.findings.length === 1 ? "finding" : "findings";
        setStatus(
          `Analysis complete. ${analysis.findings.length} localization ${findingLabel} returned; all require human review.`,
          "success"
        );
      }
    } catch (error) {
      setStatus(friendlyError(error), "error");
    }
  } catch (error) {
    resetResults();
    state.screenshotDataUrl = null;
    setStatus(friendlyError(error), "error");
  } finally {
    setScanning(false);
  }
}

async function getActiveTab() {
  if (!globalThis.chrome?.tabs?.query) {
    throw new ScanError("BhashaGuard could not reach Chrome's tab API. Reopen the popup.");
  }

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return Array.isArray(tabs) ? tabs[0] : undefined;
  } catch (error) {
    throw new ScanError("BhashaGuard could not read the active tab. Reopen the popup and try again.");
  }
}

function describePage(tab) {
  if (!tab || typeof tab.url !== "string") {
    return "Current tab";
  }

  try {
    const url = new URL(tab.url);
    if (url.protocol === "file:") {
      return "Local file";
    }
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.hostname || "Web page";
    }
    return "Restricted page";
  } catch {
    return "Current tab";
  }
}

function isScannableUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" || url.protocol === "file:";
  } catch {
    return false;
  }
}

async function captureViewport(tab) {
  if (typeof tab.windowId !== "number") {
    throw new ScanError("BhashaGuard could not identify the browser window for this tab.");
  }

  let dataUrl;
  try {
    dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" });
  } catch (error) {
    console.warn("[BhashaGuard] captureVisibleTab was rejected.", error);
    throw new ScanError(
      "Chrome could not capture this page's viewport. Some pages and browser windows block screenshots. Try the local demo page."
    );
  }

  if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/png;base64,")) {
    throw new ScanError("Chrome returned an unreadable viewport capture. Please try again.");
  }

  return dataUrl;
}

async function ensureScannerInjected(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch (error) {
    console.warn("[BhashaGuard] Could not inject the scanner.", error);
    throw new ScanError(
      "Chrome blocked BhashaGuard from reading this page. Try a regular website or the local demo page."
    );
  }
}

async function requestScan(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: SCAN_MESSAGE_TYPE });
  } catch (error) {
    console.warn("[BhashaGuard] The scanner did not respond.", error);
    throw new ScanError("The page scanner did not respond. Reload the page and try again.");
  }
}

function validateScanResponse(response) {
  if (!response || response.ok !== true) {
    const detail =
      response && typeof response.error === "string"
        ? response.error.slice(0, MAX_ERROR_LENGTH)
        : "The page scanner returned an unexpected response.";
    throw new ScanError(`Scan failed: ${detail}`);
  }

  if (!Array.isArray(response.candidates)) {
    throw new ScanError("The page scanner returned an unexpected result. Try scanning again.");
  }

  const candidates = response.candidates
    .filter(
      (candidate) =>
        candidate &&
        typeof candidate.id === "string" &&
        candidate.id.length > 0 &&
        typeof candidate.text === "string" &&
        candidate.text.trim().length > 0
    )
    .map((candidate) => ({
      id: candidate.id,
      text: candidate.text,
      tag: typeof candidate.tag === "string" ? candidate.tag : "",
    }));

  const reportedTotal = Number.isInteger(response.totalEligible)
    ? response.totalEligible
    : candidates.length;

  const sessionId =
    typeof response.sessionId === "string" &&
    response.sessionId.length > 0 &&
    response.sessionId.length <= 128
      ? response.sessionId
      : `bg-${Date.now().toString(36)}`;

  return {
    sessionId,
    candidates,
    totalEligible: Math.max(reportedTotal, candidates.length),
    truncated: response.truncated === true,
    viewport: readViewport(response.viewport),
  };
}

function readViewport(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const width = Number(value.width);
  const height = Number(value.height);
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 20000 ||
    height > 20000
  ) {
    return null;
  }

  return { width: Math.round(width), height: Math.round(height) };
}

async function requestAnalysis(scan, screenshot) {
  const payload = {
    sessionId: scan.sessionId,
    targetLanguage: "mr",
    screenshot: {
      mimeType: "image/png",
      dataUrl: screenshot,
    },
    candidates: scan.candidates.map(({ id, text, tag }) => ({ id, text, tag })),
  };

  if (scan.viewport) {
    payload.viewport = scan.viewport;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(ANALYSIS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new ScanError(
        "Gemma 4 analysis timed out. Check the local server and try again."
      );
    }
    throw new ScanError(
      "BhashaGuard could not reach its local analysis server. Start it with `cd server && npm start` and try again."
    );
  } finally {
    clearTimeout(timeout);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new ScanError(
      "The local analysis server returned an unreadable response. No findings were shown."
    );
  }

  if (!response.ok || body?.ok !== true) {
    const code = typeof body?.error?.code === "string" ? body.error.code : "";
    throw new ScanError(
      ANALYSIS_ERROR_MESSAGES[code] ||
        "The local analysis server could not complete the review. No findings were shown."
    );
  }

  return validateAnalysisResponse(body, scan.candidates);
}

function validateAnalysisResponse(body, candidates) {
  if (!Array.isArray(body.findings)) {
    throw new ScanError(
      "The local analysis server returned an unexpected result. No findings were shown."
    );
  }

  if (body.findings.length > candidates.length) {
    throw new ScanError(
      "The local analysis server returned more findings than scanned candidates. No findings were shown."
    );
  }

  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const seenIds = new Set();
  const findings = [];

  for (let index = 0; index < body.findings.length; index += 1) {
    const finding = body.findings[index];
    if (!finding || typeof finding !== "object" || Array.isArray(finding)) {
      throw invalidFinding();
    }

    const candidate =
      typeof finding.candidateId === "string" ? candidateById.get(finding.candidateId) : undefined;
    if (!candidate || seenIds.has(candidate.id)) {
      throw invalidFinding();
    }
    seenIds.add(candidate.id);

    if (finding.originalText !== candidate.text) {
      throw invalidFinding();
    }

    const category =
      typeof finding.category === "string" ? finding.category.toLowerCase() : "";
    const severity =
      typeof finding.severity === "string" ? finding.severity.toLowerCase() : "";
    if (!Object.hasOwn(CATEGORY_LABELS, category) || !Object.hasOwn(SEVERITY_LABELS, severity)) {
      throw invalidFinding();
    }

    const evidence = plainFindingText(finding.evidence);
    const explanation = plainFindingText(finding.explanation);
    if (!evidence || !explanation) {
      throw invalidFinding();
    }

    let suggestedText = null;
    if (finding.suggestedText !== null && finding.suggestedText !== undefined) {
      suggestedText = plainFindingText(finding.suggestedText);
      if (!suggestedText) {
        throw invalidFinding();
      }
    }

    findings.push({
      candidateId: candidate.id,
      originalText: candidate.text,
      suggestedText,
      category,
      severity,
      evidence,
      explanation,
      requiresHumanReview: true,
    });
  }

  const model = typeof body.model === "string" ? body.model.slice(0, 80) : "";
  return { model, findings };
}

function invalidFinding() {
  return new ScanError(
    "Gemma 4 returned a finding that failed BhashaGuard's validation. No findings were shown."
  );
}

function plainFindingText(value) {
  if (typeof value !== "string") {
    return "";
  }

  const text = value.trim();
  if (text.length === 0 || text.length > MAX_FINDING_TEXT_LENGTH) {
    return "";
  }

  return text;
}

function renderResults(result, screenshot) {
  const count = result.candidates.length;

  els.results.hidden = false;
  els.candidateCount.textContent = `${count} ${count === 1 ? "candidate" : "candidates"}`;
  els.screenshotPreview.src = screenshot;
  els.screenshotPreview.hidden = false;
  els.screenshotCaption.textContent =
    "Viewport screenshot (not full page). Sent to your configured Gemma 4 endpoint for analysis.";

  if (count === 0) {
    els.resultSummary.textContent =
      "No eligible visible text blocks were found in this viewport. Scroll to some page text and scan again.";
    els.candidateList.replaceChildren();
    els.resultMore.hidden = true;
    els.resultMore.textContent = "";
    return;
  }

  const totalText =
    result.totalEligible > count
      ? ` Showing the first ${count} of ${result.totalEligible} eligible text blocks.`
      : "";
  els.resultSummary.textContent = `Text extracted from the current viewport.${totalText}`;

  const preview = result.candidates.slice(0, PREVIEW_LIMIT);
  const fragment = document.createDocumentFragment();

  preview.forEach((candidate, index) => {
    const item = document.createElement("li");
    item.className = "candidate";

    const number = document.createElement("span");
    number.className = "candidate-number";
    number.setAttribute("aria-hidden", "true");
    number.textContent = String(index + 1).padStart(2, "0");

    const text = document.createElement("span");
    text.className = "candidate-text";
    text.dir = "auto";
    text.textContent = candidate.text;
    if (/[\u0900-\u097F]/.test(candidate.text)) {
      text.lang = "mr";
    }

    item.append(number, text);
    fragment.append(item);
  });

  els.candidateList.replaceChildren(fragment);

  const hiddenCount = count - preview.length;
  if (hiddenCount > 0) {
    els.resultMore.hidden = false;
    els.resultMore.textContent = `+ ${hiddenCount} more extracted ${
      hiddenCount === 1 ? "candidate" : "candidates"
    } not shown in this preview.`;
  } else {
    els.resultMore.hidden = true;
    els.resultMore.textContent = "";
  }
}

function renderFindings(analysis) {
  const count = analysis.findings.length;

  els.findings.hidden = false;
  els.findingCount.textContent = `${count} ${count === 1 ? "finding" : "findings"}`;

  const reviewedBy = analysis.model ? ` Reviewed by ${analysis.model}.` : "";
  els.findingsSummary.textContent =
    count === 0
      ? `${reviewedBy} No issues were justified by the screenshot and candidate text.`.trim()
      : `${reviewedBy} Suggestions only. Review each finding before changing the page.`.trim();

  els.findingsList.replaceChildren();

  if (count === 0) {
    els.findingsEmpty.hidden = false;
    return;
  }

  els.findingsEmpty.hidden = true;
  const fragment = document.createDocumentFragment();

  analysis.findings.forEach((finding) => {
    fragment.append(buildFindingItem(finding));
  });

  els.findingsList.append(fragment);
}

function buildFindingItem(finding) {
  const item = document.createElement("li");
  item.className = "finding";
  item.dataset.severity = finding.severity;

  const head = document.createElement("div");
  head.className = "finding-head";

  const severity = document.createElement("span");
  severity.className = `severity severity-${finding.severity}`;
  severity.textContent = SEVERITY_LABELS[finding.severity];

  const category = document.createElement("span");
  category.className = "finding-category";
  category.textContent = CATEGORY_LABELS[finding.category];

  head.append(severity, category);

  const original = document.createElement("p");
  original.className = "finding-original";
  original.dir = "auto";
  original.textContent = finding.originalText;

  const suggested = document.createElement("p");
  suggested.className = "finding-suggested";
  suggested.dir = "auto";
  if (finding.suggestedText) {
    suggested.lang = "mr";
    suggested.textContent = finding.suggestedText;
  } else {
    suggested.textContent = "No automatic Marathi suggestion.";
    suggested.dataset.empty = "true";
  }

  const explanation = document.createElement("p");
  explanation.className = "finding-explanation";
  explanation.textContent = finding.explanation;

  const evidence = document.createElement("p");
  evidence.className = "finding-evidence";
  evidence.textContent = `Evidence: ${finding.evidence}`;

  const review = document.createElement("p");
  review.className = "finding-review";
  review.textContent = "Requires human review";

  item.append(head, original, suggested, explanation, evidence, review);
  return item;
}

function resetResults() {
  els.results.hidden = true;
  els.candidateCount.textContent = "0 candidates";
  els.resultSummary.textContent = "";
  els.candidateList.replaceChildren();
  els.resultMore.hidden = true;
  els.resultMore.textContent = "";
  els.screenshotPreview.hidden = true;
  els.screenshotPreview.removeAttribute("src");
  els.screenshotCaption.textContent =
    "Viewport screenshot sent with the visible text to your configured Gemma 4 endpoint.";

  els.findings.hidden = true;
  els.findingCount.textContent = "0 findings";
  els.findingsSummary.textContent = "";
  els.findingsList.replaceChildren();
  els.findingsEmpty.hidden = true;
}

function setStatus(message, tone) {
  els.status.textContent = message;
  els.status.dataset.tone = tone;
  els.statusSpinner.hidden = tone !== "progress";
}

function setScanning(scanning) {
  state.scanning = scanning;
  els.scanButton.disabled = scanning || state.pageBlocked;
  els.scanButton.setAttribute("aria-busy", String(scanning));
  els.scanButtonLabel.textContent = scanning ? "Scanning…" : "Scan this page";
  if (!scanning) {
    els.statusSpinner.hidden = true;
  }
}

function friendlyError(error) {
  if (error instanceof ScanError) {
    return error.message;
  }

  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (/context invalidated|extension context/i.test(raw)) {
    return "The extension was reloaded. Close and reopen this popup to continue.";
  }

  console.error("[BhashaGuard] Unexpected scan error.", error);
  return "The scan could not finish. Reload the page and try again.";
}
