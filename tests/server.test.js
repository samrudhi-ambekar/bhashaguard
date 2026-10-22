import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { once } from "node:events";
import { createApp } from "../server/server.js";

const EXTENSION_ORIGIN = "chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF9sAAAAASUVORK5CYII=";

let server;
let baseUrl;

before(async () => {
  server = createApp().listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
});

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
  assert.ok(["MODEL_NOT_CONFIGURED", "ANALYSIS_NOT_IMPLEMENTED"].includes(body.error.code));
  assert.equal("findings" in body, false);
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
