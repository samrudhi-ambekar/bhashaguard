(function (global) {
  "use strict";

  const CANDIDATE_ID_PATTERN = /^[A-Za-z0-9_.:-]{1,128}$/;
  const MAX_REPLACEMENT_LENGTH = 500;
  const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
  const HTML_TAG = /<\/?[a-z][^>]*>/i;

  function createCorrectionManager({ resolveCandidate, isSafeTarget } = {}) {
    if (typeof resolveCandidate !== "function") {
      throw new TypeError("createCorrectionManager requires a resolveCandidate function.");
    }

    const safeTargetCheck =
      typeof isSafeTarget === "function"
        ? isSafeTarget
        : (node) => Boolean(node && node.isConnected && node.nodeType === 3);

    const applications = new Map();

    function apply({ candidateId, originalText, replacementText } = {}) {
      if (typeof candidateId !== "string" || !CANDIDATE_ID_PATTERN.test(candidateId)) {
        return failure("UNKNOWN_CANDIDATE", "This candidate is not available.");
      }

      const candidate = resolveCandidate(candidateId);
      if (!candidate) {
        return failure("UNKNOWN_CANDIDATE", "This candidate was not part of the last scan.");
      }

      if (candidate.actionable !== true) {
        return failure(
          "NOT_ACTIONABLE",
          "This text cannot be changed safely without affecting nested content."
        );
      }

      if (typeof originalText !== "string" || originalText !== candidate.text) {
        return failure(
          "MISMATCHED_ORIGINAL",
          "The requested original text does not match the last scan."
        );
      }

      const replacement = validateReplacementText(replacementText);
      if (!replacement) {
        return failure(
          "INVALID_REPLACEMENT",
          "The proposed replacement must be plain text of at most 500 characters."
        );
      }

      const node = candidate.node;
      if (!node || node.nodeType !== 3) {
        return failure("UNSAFE_TARGET", "The correction target is not a text node.");
      }

      if (node.isConnected !== true) {
        return failure("STALE_TARGET", "The target element is no longer present on the page.");
      }

      if (!safeTargetCheck(node)) {
        return failure(
          "UNSAFE_TARGET",
          "The target changed and can no longer be mapped to one safe text node."
        );
      }

      if (applications.has(candidateId) || hasApplicationForNode(node)) {
        return failure("ALREADY_APPLIED", "This correction is already applied.");
      }

      if (
        typeof candidate.originalNodeValue !== "string" ||
        node.nodeValue !== candidate.originalNodeValue
      ) {
        return failure("TEXT_CHANGED", "The page text changed after the last scan.");
      }

      try {
        node.nodeValue = replacement;
      } catch {
        return failure("APPLY_FAILED", "The page did not accept the correction.");
      }

      if (node.nodeValue !== replacement) {
        return failure("APPLY_FAILED", "The page did not retain the correction.");
      }

      applications.set(candidateId, {
        candidateId,
        node,
        originalNodeValue: candidate.originalNodeValue,
        appliedNodeValue: replacement,
      });

      return {
        ok: true,
        code: "APPLIED",
        candidateId,
        replacementText: replacement,
      };
    }

    function isApplied(candidateId) {
      return applications.has(candidateId);
    }

    function undo({ candidateId } = {}) {
      if (typeof candidateId !== "string" || !CANDIDATE_ID_PATTERN.test(candidateId)) {
        return failure("NOT_APPLIED", "This correction is not currently applied.");
      }

      const application = applications.get(candidateId);
      if (!application) {
        return failure("NOT_APPLIED", "This correction is not currently applied.");
      }

      const node = application.node;
      if (!node || node.nodeType !== 3) {
        return failure("UNSAFE_TARGET", "The correction target is not a text node.");
      }

      if (node.isConnected !== true) {
        return failure("STALE_TARGET", "The target element is no longer present on the page.");
      }

      if (!safeTargetCheck(node)) {
        return failure(
          "UNSAFE_TARGET",
          "The target changed and can no longer be mapped to one safe text node."
        );
      }

      if (node.nodeValue !== application.appliedNodeValue) {
        return failure(
          "TEXT_CHANGED",
          "The page text changed after the correction was applied."
        );
      }

      try {
        node.nodeValue = application.originalNodeValue;
      } catch {
        return failure("UNDO_FAILED", "The page did not restore the original text.");
      }

      if (node.nodeValue !== application.originalNodeValue) {
        return failure("UNDO_FAILED", "The page did not retain the original text.");
      }

      applications.delete(candidateId);

      return {
        ok: true,
        code: "UNDONE",
        candidateId,
        restoredText: application.originalNodeValue,
      };
    }

    function hasApplicationForNode(node) {
      for (const application of applications.values()) {
        if (application.node === node) {
          return true;
        }
      }
      return false;
    }

    function appliedCount() {
      return applications.size;
    }

    return { apply, undo, isApplied, appliedCount };
  }

  function validateReplacementText(value) {
    if (typeof value !== "string") {
      return null;
    }

    const text = value.trim();
    if (text.length === 0 || text.length > MAX_REPLACEMENT_LENGTH) {
      return null;
    }

    if (CONTROL_CHARACTERS.test(text) || HTML_TAG.test(text)) {
      return null;
    }

    return text;
  }

  function failure(code, message) {
    return { ok: false, code, message };
  }

  const api = { createCorrectionManager, validateReplacementText };

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  global.BhashaGuardCorrection = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
