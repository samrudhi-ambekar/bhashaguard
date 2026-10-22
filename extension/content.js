(() => {
  "use strict";

  const INSTALL_FLAG = "__bhashaguardContentV1";
  if (window[INSTALL_FLAG]) {
    return;
  }
  window[INSTALL_FLAG] = true;

  const SCAN_MESSAGE_TYPE = "BHASHAGUARD_SCAN";
  const APPLY_MESSAGE_TYPE = "BHASHAGUARD_APPLY";
  const MIN_TEXT_LENGTH = 2;
  const MAX_TEXT_LENGTH = 320;
  const MAX_CANDIDATES = 40;

  const EXCLUDED_SELECTOR = [
    "script",
    "style",
    "noscript",
    "template",
    "svg",
    "canvas",
    "iframe",
    "object",
    "embed",
    "input",
    "textarea",
    "select",
    "option",
    "head",
    "meta",
    "link",
    "[hidden]",
    "[inert]",
    '[aria-hidden="true" i]',
    "[contenteditable]:not([contenteditable='false'])",
  ].join(",");

  const SESSION_ID = createSessionId();
  const nodeIds = new WeakMap();
  const registry = new Map();
  let nextCandidateNumber = 1;

  const correctionManager = globalThis.BhashaGuardCorrection?.createCorrectionManager?.({
    resolveCandidate: (candidateId) => registry.get(candidateId) || null,
    isSafeTarget: isActionableTextNode,
  });

  if (!correctionManager) {
    console.error("[BhashaGuard] The correction core did not load.");
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message.type !== "string") {
      return false;
    }

    if (message.type === SCAN_MESSAGE_TYPE) {
      try {
        sendResponse({ ok: true, ...scanViewport() });
      } catch (error) {
        console.error("[BhashaGuard] Visible text scan failed.", error);
        sendResponse({
          ok: false,
          error: "The visible text scan could not complete on this page.",
        });
      }

      return false;
    }

    if (message.type === APPLY_MESSAGE_TYPE) {
      if (!correctionManager) {
        sendResponse({
          ok: false,
          code: "APPLY_UNAVAILABLE",
          message: "Safe correction support is unavailable on this page.",
        });
        return false;
      }

      try {
        sendResponse(
          correctionManager.apply({
            candidateId: message.candidateId,
            originalText: message.originalText,
            replacementText: message.replacementText,
          })
        );
      } catch (error) {
        console.error("[BhashaGuard] Correction application failed.", error);
        sendResponse({
          ok: false,
          code: "APPLY_FAILED",
          message: "The correction could not be applied.",
        });
      }

      return false;
    }

    return false;
  });

  function scanViewport() {
    if (!document.body) {
      throw new Error("The page has no body element.");
    }

    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
    };

    const candidates = [];
    const seenText = new Set();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let totalEligible = 0;

    registry.clear();

    while (walker.nextNode()) {
      const node = walker.currentNode;
      const text = normalizeText(node.nodeValue || "");
      if (!isEligibleText(text)) {
        continue;
      }

      const parent = node.parentElement;
      if (!parent) {
        continue;
      }

      const rect = getVisibleRect(parent, viewport);
      if (!rect) {
        continue;
      }

      const dedupeKey = text.toLocaleLowerCase();
      if (seenText.has(dedupeKey)) {
        continue;
      }
      seenText.add(dedupeKey);
      totalEligible += 1;

      if (candidates.length >= MAX_CANDIDATES) {
        continue;
      }

      const id = getNodeId(node);
      const actionable = isActionableTextNode(node);
      const candidate = {
        id,
        text,
        tag: parent.tagName.toLowerCase(),
        actionable,
        rect: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
      };

      registry.set(id, {
        node,
        text,
        originalNodeValue: node.nodeValue,
        actionable,
      });
      candidates.push(candidate);
    }

    return {
      sessionId: SESSION_ID,
      candidates,
      totalEligible,
      truncated: totalEligible > candidates.length,
      viewport,
      scannedAt: new Date().toISOString(),
    };
  }

  function normalizeText(value) {
    return value.replace(/\s+/g, " ").trim();
  }

  function isEligibleText(text) {
    if (text.length < MIN_TEXT_LENGTH || text.length > MAX_TEXT_LENGTH) {
      return false;
    }
    return /[\p{L}\p{N}]/u.test(text);
  }

  function isActionableTextNode(node) {
    if (!node || node.nodeType !== Node.TEXT_NODE || !node.isConnected) {
      return false;
    }

    const parent = node.parentElement;
    if (!parent || !parent.isConnected || parent.closest(EXCLUDED_SELECTOR)) {
      return false;
    }

    if (parent.isContentEditable || parent.children.length !== 0) {
      return false;
    }

    const nonEmptyTextNodes = [];
    for (const child of parent.childNodes) {
      if (
        child.nodeType === Node.TEXT_NODE &&
        normalizeText(child.nodeValue || "").length > 0
      ) {
        nonEmptyTextNodes.push(child);
      }
    }

    return nonEmptyTextNodes.length === 1 && nonEmptyTextNodes[0] === node;
  }

  function getVisibleRect(element, viewport) {
    if (!element.isConnected || element.closest(EXCLUDED_SELECTOR)) {
      return null;
    }

    if (
      typeof element.checkVisibility === "function" &&
      !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    ) {
      return null;
    }

    const style = getComputedStyle(element);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.visibility === "collapse"
    ) {
      return null;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) {
      return null;
    }

    const isInsideViewport =
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < viewport.height &&
      rect.left < viewport.width;

    return isInsideViewport ? rect : null;
  }

  function getNodeId(node) {
    let id = nodeIds.get(node);
    if (!id) {
      id = `bg-${SESSION_ID}-${nextCandidateNumber}`;
      nextCandidateNumber += 1;
      nodeIds.set(node, id);
    }
    return id;
  }

  function createSessionId() {
    try {
      if (globalThis.crypto?.randomUUID) {
        return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
      }
      if (globalThis.crypto?.getRandomValues) {
        const bytes = new Uint8Array(5);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      }
    } catch {
      // Fall back to a time-based identifier below.
    }

    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }
})();
