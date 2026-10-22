import assert from "node:assert/strict";
import test from "node:test";
import { AnalysisError, validateModelFindings } from "../server/analyzer.js";

const CANDIDATES = [
  { id: "bg-test-1", text: "Apply Now", tag: "a" },
  { id: "bg-test-2", text: "मराठी माहिती", tag: "p" },
];

function validFinding(overrides = {}) {
  return {
    candidateId: "bg-test-1",
    originalText: "Apply Now",
    suggestedText: "आता अर्ज करा",
    category: "untranslated",
    evidence: "The visible call-to-action button is labelled in English.",
    explanation: "The rest of the page is Marathi, so this action label appears untranslated.",
    severity: "high",
    requiresHumanReview: true,
    ...overrides,
  };
}

function modelResponse(findings) {
  return JSON.stringify({ findings });
}

function assertInvalid(rawResponse, pattern) {
  assert.throws(
    () => validateModelFindings(rawResponse, CANDIDATES),
    (error) => {
      assert.ok(error instanceof AnalysisError);
      assert.equal(error.code, "INVALID_MODEL_RESPONSE");
      assert.match(error.detail, pattern);
      return true;
    }
  );
}

test("validateModelFindings accepts a valid finding and preserves exact candidate text", () => {
  const findings = validateModelFindings(modelResponse([validFinding()]), CANDIDATES);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].candidateId, "bg-test-1");
  assert.equal(findings[0].originalText, "Apply Now");
  assert.equal(findings[0].suggestedText, "आता अर्ज करा");
  assert.equal(findings[0].requiresHumanReview, true);
});

test("validateModelFindings accepts an empty findings array", () => {
  assert.deepEqual(validateModelFindings(modelResponse([]), CANDIDATES), []);
});

test("validateModelFindings accepts JSON wrapped in a Markdown code fence", () => {
  const fenced = "```json\n" + modelResponse([validFinding()]) + "\n```";
  const findings = validateModelFindings(fenced, CANDIDATES);
  assert.equal(findings.length, 1);
});

test("validateModelFindings forces human review even if the model says false", () => {
  const findings = validateModelFindings(
    modelResponse([validFinding({ requiresHumanReview: false })]),
    CANDIDATES
  );

  assert.equal(findings[0].requiresHumanReview, true);
});

test("validateModelFindings rejects malformed JSON", () => {
  assertInvalid("Not JSON at all", /not valid JSON/);
});

test("validateModelFindings rejects a response without a findings array", () => {
  assertInvalid(JSON.stringify({ results: [] }), /findings array/);
});

test("validateModelFindings rejects an unknown candidate ID", () => {
  assertInvalid(
    modelResponse([validFinding({ candidateId: "bg-does-not-exist" })]),
    /does not match a submitted candidate/
  );
});

test("validateModelFindings rejects mismatched original text", () => {
  assertInvalid(
    modelResponse([validFinding({ originalText: "Apply" })]),
    /does not match the candidate text/
  );
});

test("validateModelFindings rejects duplicate candidate findings", () => {
  assertInvalid(
    modelResponse([validFinding(), validFinding({ suggestedText: "दुसरा पर्याय" })]),
    /duplicated/
  );
});

test("validateModelFindings rejects HTML in a suggested correction", () => {
  assertInvalid(
    modelResponse([validFinding({ suggestedText: "<script>alert(1)</script>" })]),
    /plain text/
  );
});

test("validateModelFindings rejects unsupported categories and severities", () => {
  assertInvalid(
    modelResponse([validFinding({ category: "font_issue" })]),
    /category is not supported/
  );
  assertInvalid(
    modelResponse([validFinding({ severity: "critical" })]),
    /severity is not supported/
  );
});

test("validateModelFindings rejects more findings than candidates", () => {
  assertInvalid(
    modelResponse([validFinding(), validFinding({ candidateId: "bg-test-2", originalText: "मराठी माहिती" }), validFinding()]),
    /more findings than submitted candidates/
  );
});

test("validateModelFindings rejects oversized model responses", () => {
  assertInvalid("x".repeat(200_001), /too large/);
});

test("validateModelFindings rejects an empty model response", () => {
  assertInvalid("", /no text content/);
});
