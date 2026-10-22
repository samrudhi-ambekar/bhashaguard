import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  createCorrectionManager,
  validateReplacementText,
} = require("../extension/correction-core.js");

function createTextNode(value, overrides = {}) {
  return {
    nodeType: 3,
    isConnected: true,
    nodeValue: value,
    ...overrides,
  };
}

function createCandidate(overrides = {}) {
  const node = overrides.node || createTextNode("Apply Now");
  return {
    id: "bg-test-1",
    text: "Apply Now",
    originalNodeValue: "Apply Now",
    actionable: true,
    node,
    ...overrides,
  };
}

function createHarness(candidate) {
  const candidates = new Map();
  if (candidate) {
    candidates.set(candidate.id, candidate);
  }

  const manager = createCorrectionManager({
    resolveCandidate: (candidateId) => candidates.get(candidateId) || null,
    isSafeTarget: (node) => node.safe !== false,
  });

  return { candidates, manager };
}

test("applies a validated correction to the mapped text node", () => {
  const candidate = createCandidate();
  const { manager } = createHarness(candidate);

  const result = manager.apply({
    candidateId: candidate.id,
    originalText: "Apply Now",
    replacementText: "आता अर्ज करा",
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, "APPLIED");
  assert.equal(candidate.node.nodeValue, "आता अर्ज करा");
  assert.equal(manager.isApplied(candidate.id), true);
  assert.equal(manager.appliedCount(), 1);
});

test("rejects an unknown candidate before touching the page", () => {
  const { manager } = createHarness(null);

  const result = manager.apply({
    candidateId: "bg-test-unknown",
    originalText: "Apply Now",
    replacementText: "आता अर्ज करा",
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "UNKNOWN_CANDIDATE");
});

test("rejects an original text that does not match the scan", () => {
  const candidate = createCandidate();
  const { manager } = createHarness(candidate);

  const result = manager.apply({
    candidateId: candidate.id,
    originalText: "Apply now",
    replacementText: "आता अर्ज करा",
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "MISMATCHED_ORIGINAL");
  assert.equal(candidate.node.nodeValue, "Apply Now");
});

test("rejects a target that was removed after scanning", () => {
  const node = createTextNode("Apply Now", { isConnected: false });
  const candidate = createCandidate({ node });
  const { manager } = createHarness(candidate);

  const result = manager.apply({
    candidateId: candidate.id,
    originalText: "Apply Now",
    replacementText: "आता अर्ज करा",
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "STALE_TARGET");
  assert.equal(node.nodeValue, "Apply Now");
});

test("rejects a target whose text changed after scanning", () => {
  const node = createTextNode("Apply Now");
  const candidate = createCandidate({ node });
  const { manager } = createHarness(candidate);
  node.nodeValue = "Apply here";

  const result = manager.apply({
    candidateId: candidate.id,
    originalText: "Apply Now",
    replacementText: "आता अर्ज करा",
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "TEXT_CHANGED");
  assert.equal(node.nodeValue, "Apply here");
});

test("rejects non-actionable nested content", () => {
  const candidate = createCandidate({ actionable: false });
  const { manager } = createHarness(candidate);

  const result = manager.apply({
    candidateId: candidate.id,
    originalText: "Apply Now",
    replacementText: "आता अर्ज करा",
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "NOT_ACTIONABLE");
  assert.equal(candidate.node.nodeValue, "Apply Now");
});

test("rejects a target that is no longer safe", () => {
  const node = createTextNode("Apply Now", { safe: false });
  const candidate = createCandidate({ node });
  const { manager } = createHarness(candidate);

  const result = manager.apply({
    candidateId: candidate.id,
    originalText: "Apply Now",
    replacementText: "आता अर्ज करा",
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "UNSAFE_TARGET");
  assert.equal(node.nodeValue, "Apply Now");
});

test("rejects a non-text target", () => {
  const node = createTextNode("Apply Now", { nodeType: 1 });
  const candidate = createCandidate({ node });
  const { manager } = createHarness(candidate);

  const result = manager.apply({
    candidateId: candidate.id,
    originalText: "Apply Now",
    replacementText: "आता अर्ज करा",
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "UNSAFE_TARGET");
});

test("rejects empty, unsafe, or oversized replacement text", () => {
  const invalidValues = [
    "",
    "   ",
    "<strong>आता अर्ज करा</strong>",
    "Apply\u0000Now",
    "x".repeat(501),
    null,
  ];

  for (const value of invalidValues) {
    const candidate = createCandidate();
    const { manager } = createHarness(candidate);

    const result = manager.apply({
      candidateId: candidate.id,
      originalText: "Apply Now",
      replacementText: value,
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, "INVALID_REPLACEMENT");
    assert.equal(candidate.node.nodeValue, "Apply Now");
  }
});

test("trims replacement text before applying it", () => {
  const candidate = createCandidate();
  const { manager } = createHarness(candidate);

  const result = manager.apply({
    candidateId: candidate.id,
    originalText: "Apply Now",
    replacementText: "  आता अर्ज करा  ",
  });

  assert.equal(result.ok, true);
  assert.equal(candidate.node.nodeValue, "आता अर्ज करा");
});

test("does not apply the same correction twice", () => {
  const candidate = createCandidate();
  const { manager } = createHarness(candidate);

  const first = manager.apply({
    candidateId: candidate.id,
    originalText: "Apply Now",
    replacementText: "आता अर्ज करा",
  });
  const second = manager.apply({
    candidateId: candidate.id,
    originalText: "Apply Now",
    replacementText: "आता अर्ज करा",
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.code, "ALREADY_APPLIED");
  assert.equal(candidate.node.nodeValue, "आता अर्ज करा");
});

test("applies only the selected finding", () => {
  const firstNode = createTextNode("Apply Now");
  const secondNode = createTextNode("Download form");
  const first = createCandidate({ id: "bg-test-1", node: firstNode });
  const second = createCandidate({
    id: "bg-test-2",
    node: secondNode,
    text: "Download form",
    originalNodeValue: "Download form",
  });
  const { manager, candidates } = createHarness(first);
  candidates.set(second.id, second);

  const result = manager.apply({
    candidateId: first.id,
    originalText: "Apply Now",
    replacementText: "आता अर्ज करा",
  });

  assert.equal(result.ok, true);
  assert.equal(firstNode.nodeValue, "आता अर्ज करा");
  assert.equal(secondNode.nodeValue, "Download form");
  assert.equal(manager.isApplied(second.id), false);
});

test("applies multiple corrections independently", () => {
  const firstNode = createTextNode("Apply Now");
  const secondNode = createTextNode("Download form");
  const first = createCandidate({ id: "bg-test-1", node: firstNode });
  const second = createCandidate({
    id: "bg-test-2",
    node: secondNode,
    text: "Download form",
    originalNodeValue: "Download form",
  });
  const { manager, candidates } = createHarness(first);
  candidates.set(second.id, second);

  assert.equal(
    manager.apply({
      candidateId: first.id,
      originalText: "Apply Now",
      replacementText: "आता अर्ज करा",
    }).ok,
    true
  );
  assert.equal(
    manager.apply({
      candidateId: second.id,
      originalText: "Download form",
      replacementText: "अर्ज डाउनलोड करा",
    }).ok,
    true
  );

  assert.equal(manager.appliedCount(), 2);
  assert.equal(firstNode.nodeValue, "आता अर्ज करा");
  assert.equal(secondNode.nodeValue, "अर्ज डाउनलोड करा");
});

test("changes only the mapped text node and leaves sibling markup alone", () => {
  const sibling = { nodeType: 1, textContent: "Keep this label" };
  const parent = { nodeType: 1, children: [sibling] };
  const node = createTextNode("Apply Now", { parentElement: parent });
  const candidate = createCandidate({ node });
  const { manager } = createHarness(candidate);

  const result = manager.apply({
    candidateId: candidate.id,
    originalText: "Apply Now",
    replacementText: "आता अर्ज करा",
  });

  assert.equal(result.ok, true);
  assert.equal(node.nodeValue, "आता अर्ज करा");
  assert.equal(sibling.textContent, "Keep this label");
  assert.deepEqual(parent.children, [sibling]);
});

test("validateReplacementText returns trimmed plain text only", () => {
  assert.equal(validateReplacementText("  आता अर्ज करा  "), "आता अर्ज करा");
  assert.equal(validateReplacementText(""), null);
  assert.equal(validateReplacementText(" <b>text</b> "), null);
  assert.equal(validateReplacementText("x".repeat(501)), null);
});
