import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import express from "express";

const serverDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(serverDirectory, ".env"), quiet: true });

const SERVICE_NAME = "bhashaguard-server";
const SERVICE_VERSION = "0.1.0";
const HOST = "127.0.0.1";
const DEFAULT_PORT = 8787;
const DEFAULT_MODEL = "gemma-4-26b-a4b-it";
const MAX_CANDIDATES = 40;
const MAX_CANDIDATE_TEXT_LENGTH = 320;
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const JSON_BODY_LIMIT = "12mb";

const port = parsePort(process.env.PORT);
const model = parseModel(process.env.GEMMA_MODEL);
const modelConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());

const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;
const LOCAL_ORIGIN = /^http:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/;

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(securityHeaders);
  app.use(corsMiddleware);
  app.use(express.json({ limit: JSON_BODY_LIMIT, type: "application/json" }));

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      status: "ok",
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      model,
      modelConfigured,
    });
  });

  app.post("/analyze", requireJsonContentType, (request, response) => {
    const validation = validateAnalyzeRequest(request.body);
    if (!validation.ok) {
      return sendError(
        response,
        400,
        "INVALID_REQUEST",
        "The analysis request is invalid.",
        validation.errors
      );
    }

    if (!modelConfigured) {
      return sendError(
        response,
        503,
        "MODEL_NOT_CONFIGURED",
        "Gemma 4 is not configured. Add GEMINI_API_KEY to server/.env and restart the server."
      );
    }

    return sendError(
      response,
      503,
      "ANALYSIS_NOT_IMPLEMENTED",
      "Gemma 4 analysis is not connected yet."
    );
  });

  app.use((_request, response) => {
    return sendError(response, 404, "NOT_FOUND", "The requested endpoint does not exist.");
  });

  app.use(errorHandler);

  return app;
}

function securityHeaders(_request, response, next) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  next();
}

function corsMiddleware(request, response, next) {
  const origin = request.get("origin");

  if (origin) {
    if (!EXTENSION_ORIGIN.test(origin) && !LOCAL_ORIGIN.test(origin)) {
      return sendError(response, 403, "ORIGIN_NOT_ALLOWED", "This origin is not allowed.");
    }

    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type");
    response.setHeader("Access-Control-Max-Age", "600");
  }

  if (request.method === "OPTIONS") {
    return response.status(204).end();
  }

  return next();
}

function requireJsonContentType(request, response, next) {
  if (!request.is("application/json")) {
    return sendError(
      response,
      415,
      "UNSUPPORTED_MEDIA_TYPE",
      "The analysis endpoint requires an application/json request body."
    );
  }
  return next();
}

function validateAnalyzeRequest(body) {
  const errors = [];

  if (!isPlainObject(body)) {
    return { ok: false, errors: [{ path: "body", message: "must be a JSON object" }] };
  }

  if (!isBoundedString(body.sessionId, 1, 128)) {
    errors.push({ path: "sessionId", message: "must be a string between 1 and 128 characters" });
  }

  if (body.targetLanguage !== "mr") {
    errors.push({ path: "targetLanguage", message: 'must be "mr" (Marathi)' });
  }

  const screenshot = validateScreenshot(body.screenshot, errors);
  const candidates = validateCandidates(body.candidates, errors);
  const viewport = validateViewport(body.viewport, errors);

  if (errors.length > 0) {
    return { ok: false, errors: errors.slice(0, 12) };
  }

  return {
    ok: true,
    value: {
      sessionId: body.sessionId,
      targetLanguage: "mr",
      screenshot,
      candidates,
      viewport,
    },
  };
}

function validateScreenshot(value, errors) {
  if (!isPlainObject(value)) {
    errors.push({ path: "screenshot", message: "must be an object with mimeType and dataUrl" });
    return null;
  }

  const mimeType = value.mimeType;
  if (mimeType !== "image/png" && mimeType !== "image/jpeg") {
    errors.push({ path: "screenshot.mimeType", message: 'must be "image/png" or "image/jpeg"' });
  }

  if (typeof value.dataUrl !== "string") {
    errors.push({ path: "screenshot.dataUrl", message: "must be a base64 data URL" });
    return null;
  }

  const prefix = `data:${mimeType};base64,`;
  if (!value.dataUrl.startsWith(prefix)) {
    errors.push({ path: "screenshot.dataUrl", message: `must start with ${prefix}` });
    return null;
  }

  const encoded = value.dataUrl.slice(prefix.length);
  if (encoded.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) {
    errors.push({ path: "screenshot.dataUrl", message: "must contain valid base64 image data" });
    return null;
  }

  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0) {
    errors.push({ path: "screenshot.dataUrl", message: "must contain image data" });
    return null;
  }

  if (bytes.length > MAX_SCREENSHOT_BYTES) {
    errors.push({
      path: "screenshot.dataUrl",
      message: `must decode to at most ${MAX_SCREENSHOT_BYTES} bytes`,
    });
    return null;
  }

  if (mimeType === "image/png" && !isPng(bytes)) {
    errors.push({ path: "screenshot.dataUrl", message: "does not contain a valid PNG image" });
    return null;
  }

  if (mimeType === "image/jpeg" && !isJpeg(bytes)) {
    errors.push({ path: "screenshot.dataUrl", message: "does not contain a valid JPEG image" });
    return null;
  }

  return { mimeType, bytes };
}

function validateCandidates(value, errors) {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CANDIDATES) {
    errors.push({
      path: "candidates",
      message: `must be an array containing between 1 and ${MAX_CANDIDATES} candidates`,
    });
    return [];
  }

  const ids = new Set();
  const candidates = [];

  value.forEach((candidate, index) => {
    const pathPrefix = `candidates[${index}]`;
    if (!isPlainObject(candidate)) {
      errors.push({ path: pathPrefix, message: "must be an object" });
      return;
    }

    if (typeof candidate.id !== "string" || !/^[A-Za-z0-9_.:-]{1,128}$/.test(candidate.id)) {
      errors.push({
        path: `${pathPrefix}.id`,
        message: "must be a 1-128 character identifier using letters, numbers, _, ., : or -",
      });
    } else if (ids.has(candidate.id)) {
      errors.push({ path: `${pathPrefix}.id`, message: "must be unique" });
    } else {
      ids.add(candidate.id);
    }

    if (
      typeof candidate.text !== "string" ||
      candidate.text.length < 1 ||
      candidate.text.length > MAX_CANDIDATE_TEXT_LENGTH ||
      candidate.text.trim() !== candidate.text
    ) {
      errors.push({
        path: `${pathPrefix}.text`,
        message: `must be trimmed text between 1 and ${MAX_CANDIDATE_TEXT_LENGTH} characters`,
      });
    }

    if (candidate.tag !== undefined && (typeof candidate.tag !== "string" || candidate.tag.length > 32)) {
      errors.push({ path: `${pathPrefix}.tag`, message: "must be a string of at most 32 characters" });
    }

    candidates.push({
      id: candidate.id,
      text: candidate.text,
      tag: typeof candidate.tag === "string" ? candidate.tag : "",
    });
  });

  return candidates;
}

function validateViewport(value, errors) {
  if (value === undefined) {
    return null;
  }

  if (
    !isPlainObject(value) ||
    !Number.isFinite(value.width) ||
    !Number.isFinite(value.height) ||
    value.width <= 0 ||
    value.height <= 0 ||
    value.width > 20000 ||
    value.height > 20000
  ) {
    errors.push({
      path: "viewport",
      message: "must contain positive finite width and height values",
    });
    return null;
  }

  return { width: Math.round(value.width), height: Math.round(value.height) };
}

function sendError(response, status, code, message, details) {
  const body = { ok: false, error: { code, message } };
  if (details?.length) {
    body.error.details = details;
  }
  return response.status(status).json(body);
}

function errorHandler(error, _request, response, _next) {
  if (error?.type === "entity.too.large") {
    return sendError(response, 413, "PAYLOAD_TOO_LARGE", "The request body is too large.");
  }

  if (error instanceof SyntaxError && error.status === 400) {
    return sendError(response, 400, "INVALID_JSON", "The request body is not valid JSON.");
  }

  console.error("[BhashaGuard] Unhandled server error:", error?.message || "unknown error");
  return sendError(response, 500, "INTERNAL_ERROR", "The server could not complete the request.");
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBoundedString(value, minimum, maximum) {
  return typeof value === "string" && value.length >= minimum && value.length <= maximum;
}

function isPng(bytes) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length > signature.length && signature.every((byte, index) => bytes[index] === byte);
}

function isJpeg(bytes) {
  return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function parsePort(value) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535 ? parsed : DEFAULT_PORT;
}

function parseModel(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return /^[a-z0-9][a-z0-9._-]{2,80}$/i.test(normalized) ? normalized : DEFAULT_MODEL;
}

export function startServer({ host = HOST, serverPort = port } = {}) {
  return new Promise((resolve, reject) => {
    const httpServer = createApp().listen(serverPort, host, () => resolve(httpServer));
    httpServer.once("error", reject);
  });
}

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  startServer()
    .then((httpServer) => {
      console.log(`[BhashaGuard] Local API listening on http://${HOST}:${port}`);
      console.log(
        `[BhashaGuard] Gemma model: ${model} (${modelConfigured ? "configured" : "API key missing"})`
      );

      const shutdown = () => {
        httpServer.close(() => process.exit(0));
      };
      process.once("SIGINT", shutdown);
      process.once("SIGTERM", shutdown);
    })
    .catch((error) => {
      console.error("[BhashaGuard] Failed to start local API:", error?.message || "unknown error");
      process.exitCode = 1;
    });
}
