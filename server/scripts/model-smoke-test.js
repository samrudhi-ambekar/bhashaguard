import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(scriptDirectory, "..", ".env");
dotenv.config({ path: envPath, quiet: true });

const DEFAULT_MODEL = "gemma-4-26b-a4b-it";
const PROMPT =
  "Return exactly this sentence and nothing else: BhashaGuard Gemma 4 connectivity OK";

async function main() {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.GEMMA_MODEL?.trim() || DEFAULT_MODEL;

  console.log(`Model: ${model}`);

  if (!apiKey) {
    console.error("Gemma smoke test: FAILED");
    console.error("Kind: missing_api_key");
    console.error("Message: GEMINI_API_KEY is not set in server/.env.");
    return 1;
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: 45000 },
  });

  let response;
  try {
    response = await ai.models.generateContent({
      model,
      contents: PROMPT,
      config: {
        temperature: 0,
        maxOutputTokens: 256,
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        systemInstruction:
          "You are a connectivity check for BhashaGuard. Follow the requested output exactly.",
      },
    });
  } catch (error) {
    const failure = classifyError(error, apiKey);
    console.error("Gemma smoke test: FAILED");
    console.error(`Kind: ${failure.kind}`);
    if (failure.status !== undefined) {
      console.error(`HTTP status: ${failure.status}`);
    }
    if (failure.code) {
      console.error(`Code: ${failure.code}`);
    }
    console.error(`Message: ${failure.message}`);
    return 1;
  }

  const text = normalizeResponse(response?.text);

  if (!text) {
    console.error("Gemma smoke test: FAILED");
    console.error("Kind: empty_response");
    console.error("Message: The model returned no text content.");
    return 1;
  }

  console.log("Gemma smoke test: OK");
  console.log(`Response: ${text.slice(0, 240)}`);
  return 0;
}

function classifyError(error, apiKey) {
  const status = Number.isInteger(error?.status) ? error.status : undefined;
  const code = typeof error?.code === "string" ? error.code : "";
  const rawMessage = sanitizeMessage(error?.message || "Unknown API error", apiKey);
  const lowerMessage = rawMessage.toLowerCase();

  let kind = "unknown";
  if (status === 400 && /api.?key|invalid.?argument|invalid.?key/.test(lowerMessage)) {
    kind = "invalid_credentials_or_request";
  } else if (status === 401 || status === 403) {
    kind = "authentication_or_permission";
  } else if (status === 404) {
    kind = "model_not_found";
  } else if (status === 429) {
    kind = /quota|billing/.test(lowerMessage) ? "quota_exceeded" : "rate_limited";
  } else if (status !== undefined && status >= 500) {
    kind = "upstream_error";
  } else if (
    /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|fetch failed/i.test(
      `${code} ${rawMessage}`
    ) ||
    error?.name === "TimeoutError" ||
    error?.name === "AbortError"
  ) {
    kind = "network_error";
  } else if (status === 400) {
    kind = "invalid_request";
  }

  return { kind, status, code, message: rawMessage };
}

function sanitizeMessage(value, apiKey) {
  let message = String(value || "Unknown API error");
  if (apiKey) {
    message = message.split(apiKey).join("[REDACTED]");
  }
  message = message.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED]");
  message = message.replace(/([?&](?:key|api_key)=)[^&\s]+/gi, "$1[REDACTED]");
  return message.replace(/\s+/g, " ").trim().slice(0, 400) || "No error message.";
}

function normalizeResponse(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

const exitCode = await main();
process.exitCode = exitCode;
