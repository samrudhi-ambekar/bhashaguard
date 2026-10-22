import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { once } from "node:events";
import { createApp } from "../server/server.js";
import { AnalysisError } from "../server/analyzer.js";

const EXTENSION_ORIGIN = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=";

let server;
let baseUrl;

before(async () => {
  server = createApp({ isModelConfigured: false }).listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

async function withApp(app, run) {
  const httpServer = app.listen(0, "127.0.0.1");
  await once(httpServer, "listening");
  const url = `http://127.0.0.1:${httpServer.address().port}`;
  try {
    return await run(url);
  } finally {
    await new Promise((resolve) => httpServer.close(resolve));
  }
}

function validPayload(overrides = {}) {
  return {
    sessionId: "bg-test-session",
    targetLanguage: "mr",
    screenshot: {
      mimeType: "image/png",
      dataUrl: PNG_DATA_URL,
    },
    candidates: [
      { id: "bg-test-1", text: "Apply Now", tag: "a" },
      { id: "bg-test-2", text: "मराठी माहिती", tag: "p" },
    ],
    ...overrides,
  };
}

async function postJson(path, body, headers = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

test("GET /health returns a small local health response without secrets", async () => {
  const response = await fetch(`${baseUrl}/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(body.ok, true);
  assert.equal(body.status, "ok");
  assert.equal(body.service, "bhashaguard-server");
  assert.equal(typeof body.version, "string");
  assert.equal(typeof body.model, "string");
  assert.equal(typeof body.modelConfigured, "boolean");
  assert.equal("findings" in body, false);
  assert.doesNotMatch(JSON.stringify(body), /api.?key|secret|token/i);
});

test("POST /analyze rejects malformed JSON with a meaningful error", async () => {
  const response = await postJson("/analyze", '{"sessionId":');
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "INVALID_JSON");
  assert.match(body.error.message, /valid JSON/i);
});

test("POST /analyze rejects a missing request body", async () => {
  const response = await postJson("/analyze", {});
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_REQUEST");
  assert.ok(Array.isArray(body.error.details));
  assert.ok(body.error.details.some((detail) => detail.path === "candidates"));
});

test("POST /analyze rejects unsupported content types", async () => {
  const response = await fetch(`${baseUrl}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: "not json",
  });
  const body = await response.json();

  assert.equal(response.status, 415);
  assert.equal(body.error.code, "UNSUPPORTED_MEDIA_TYPE");
});

test("POST /analyze rejects duplicate candidate IDs", async () => {
  const payload = validPayload({
    candidates: [
      { id: "same-id", text: "First text" },
      { id: "same-id", text: "Second text" },
    ],
  });
  const response = await postJson("/analyze", payload);
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.equal(body.error.code, "INVALID_REQUEST");
  assert.ok(body.error.details.some((detail) => /unique/.test(detail.message)));
});

test("POST /analyze rejects an incorrect target language", async () => {
  const response = await postJson("/analyze", validPayload({ targetLanguage: "en" }));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.ok(body.error.details.some((detail) => detail.path === "targetLanguage"));
});

test("POST /analyze validates a well-formed request without fabricating findings", async () => {
  const response = await postJson("/analyze", validPayload());
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.error.code, "MODEL_NOT_CONFIGURED");
  assert.equal("findings" in body, false);
});

test("POST /analyze returns findings from the injected analysis implementation", async () => {
  const expectedFindings = [
    {
      candidateId: "bg-test-1",
      originalText: "Apply Now",
      suggestedText: "आता अर्ज करा",
      category: "untranslated",
      evidence: "The call-to-action button is in English.",
      explanation: "The surrounding page is Marathi, so this action label appears untranslated.",
      severity: "high",
      requiresHumanReview: true,
    },
  ];
  let received;
  let receivedUrl;

  const app = createApp({
    isModelConfigured: true,
    activeModel: "test-gemma-model",
    runAnalysis: async (value) => {
      received = value;
      return {
        model: "test-gemma-model",
        findings: expectedFindings,
        summary: { candidateCount: value.candidates.length, findingCount: 1 },
      };
    },
  });

  await withApp(app, async (url) => {
    receivedUrl = url;
    const response = await fetch(`${url}/analyze`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: EXTENSION_ORIGIN,
      },
      body: JSON.stringify(validPayload({ viewport: { width: 1280, height: 720 } })),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), EXTENSION_ORIGIN);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.model, "test-gemma-model");
    assert.deepEqual(body.findings, expectedFindings);
    assert.deepEqual(body.summary, { candidateCount: 2, findingCount: 1 });
  });

  assert.ok(receivedUrl);
  assert.equal(received.targetLanguage, "mr");
  assert.equal(received.sessionId, "bg-test-session");
  assert.equal(received.screenshot.mimeType, "image/png");
  assert.ok(Buffer.isBuffer(received.screenshot.bytes));
  assert.equal(received.candidates[0].text, "Apply Now");
  assert.deepEqual(received.viewport, { width: 1280, height: 720 });
});

test("POST /analyze maps invalid model output to a safe structured error", async () => {
  const app = createApp({
    isModelConfigured: true,
    runAnalysis: async () => {
      throw new AnalysisError(
        "INVALID_MODEL_RESPONSE",
        "Gemma 4 returned an invalid analysis response. No findings were accepted.",
        { detail: "findings[0].candidateId does not match a submitted candidate." }
      );
    },
  });

  await withApp(app, async (url) => {
    const response = await fetch(`${url}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload()),
    });
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.equal(body.ok, false);
    assert.equal(body.error.code, "INVALID_MODEL_RESPONSE");
    assert.match(body.error.message, /No findings were accepted/);
    assert.equal("details" in body.error, false);
    assert.doesNotMatch(JSON.stringify(body), /candidateId does not match/);
  });
});

test("CORS preflight allows a Chrome extension origin", async () => {
  const response = await fetch(`${baseUrl}/analyze`, {
    method: "OPTIONS",
    headers: {
      Origin: EXTENSION_ORIGIN,
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "content-type",
    },
  });

  assert.equal(response.status, 204);
  assert.equal(response.headers.get("access-control-allow-origin"), EXTENSION_ORIGIN);
  assert.match(response.headers.get("access-control-allow-methods"), /POST/);
});

test("CORS rejects an unrelated origin", async () => {
  const response = await fetch(`${baseUrl}/health`, {
    headers: { Origin: "https://example.com" },
  });
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.equal(body.error.code, "ORIGIN_NOT_ALLOWED");
});

test("unknown endpoints return a structured 404", async () => {
  const response = await fetch(`${baseUrl}/missing`);
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, "NOT_FOUND");
});
