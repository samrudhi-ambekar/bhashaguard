import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CHROME_TIMEOUT_MS = 30_000;

function findChrome() {
  if (process.env.CHROME_BIN) {
    return process.env.CHROME_BIN;
  }

  for (const name of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]) {
    try {
      return execFileSync("which", [name], { encoding: "utf8" }).trim();
    } catch {
      // Try the next executable.
    }
  }

  return null;
}

function contentType(filePath) {
  if (filePath.endsWith(".html")) {
    return "text/html; charset=utf-8";
  }
  if (filePath.endsWith(".js")) {
    return "text/javascript; charset=utf-8";
  }
  if (filePath.endsWith(".css")) {
    return "text/css; charset=utf-8";
  }
  return "application/octet-stream";
}

async function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);
      const filePath = path.resolve(ROOT, "." + decodeURIComponent(url.pathname));
      if (!filePath.startsWith(`${ROOT}${path.sep}`)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }

      const body = await readFile(filePath);
      response.writeHead(200, {
        "cache-control": "no-store",
        "content-type": contentType(filePath),
      });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end("Not found");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  return {
    origin: `http://127.0.0.1:${address.port}`,
    server,
  };
}

async function runHarness(chromePath, url, resultElementId) {
  const profileDirectory = await mkdtemp(path.join(tmpdir(), "bhashaguard-chrome-"));

  try {
    const { code, stdout, stderr } = await new Promise((resolve, reject) => {
      const child = spawn(
        chromePath,
        [
          "--headless=new",
          "--no-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--no-first-run",
          "--no-default-browser-check",
          `--user-data-dir=${profileDirectory}`,
          "--virtual-time-budget=10000",
          "--dump-dom",
          url,
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`Headless Chrome timed out after ${CHROME_TIMEOUT_MS}ms.`));
      }, CHROME_TIMEOUT_MS);

      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on("close", (exitCode) => {
        clearTimeout(timer);
        resolve({ code: exitCode, stdout, stderr });
      });
    });

    assert.equal(code, 0, `Headless Chrome failed.\n${stderr}`);
    const pattern = new RegExp(`<pre id="${resultElementId}">RESULT:(\\{.*?\\})</pre>`);
    const match = stdout.match(pattern);
    assert.ok(match, `The harness did not produce a result.\n${stderr}\n${stdout.slice(-2000)}`);
    return JSON.parse(match[1]);
  } finally {
    await rm(profileDirectory, { recursive: true, force: true });
  }
}

const chromePath = findChrome();

test(
  "content script applies, refuses stale changes, undoes, and reload-restores",
  { skip: chromePath ? false : "Chrome/Chromium is not available", timeout: 60_000 },
  async () => {
    const { origin, server } = await startServer();

    try {
      const result = await runHarness(
        chromePath,
        `${origin}/tests/browser/content-integration.html`,
        "results"
      );

      assert.deepEqual(result, {
        scanOk: true,
        foundTarget: true,
        targetActionable: true,
        nestedNotActionable: true,
        applyTarget: "APPLIED",
        targetApplied: true,
        otherUnchanged: true,
        undoTarget: "UNDONE",
        targetRestored: true,
        applyMultiple: true,
        undoFirst: "UNDONE",
        multipleIndependent: true,
        undoSecond: "UNDONE",
        allRestored: true,
        unknown: "UNKNOWN_CANDIDATE",
        mismatch: "MISMATCHED_ORIGINAL",
        unchangedAfterFailures: true,
        changed: "TEXT_CHANGED",
        changedTextPreserved: true,
        stale: "STALE_TARGET",
        nestedRefused: "NOT_ACTIONABLE",
        nestedChildPreserved: true,
        markupRejected: "INVALID_REPLACEMENT",
        noInjectedMarkup: true,
        reapplyBeforeReload: "APPLIED",
        pendingBeforeReload: true,
        reloadOk: true,
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
);

test(
  "popup gates Apply on actionable findings and wires Apply/Undo messages",
  { skip: chromePath ? false : "Chrome/Chromium is not available", timeout: 60_000 },
  async () => {
    const { origin, server } = await startServer();

    try {
      const result = await runHarness(
        chromePath,
        `${origin}/tests/browser/popup-integration.html`,
        "results-output"
      );

      assert.deepEqual(result, {
        summaryVisible: true,
        summaryBeforeAnalysis: true,
        summaryCandidates: "5",
        partialBadge: "Partial viewport scan",
        partialBannerVisible: true,
        summaryFindings: "5",
        summaryActionable: "3",
        summaryReview: "2",
        summaryDetailMentionsReview: true,
        categorySummaryVisible: true,
        categoryUntranslated: "4",
        categoryQuality: "1",
        categoryOther: "0",
        reviewBannerVisible: true,
        noAutoApply: true,
        itemCount: 5,
        validationMappedActionable: true,
        actionableShowsApplyAndSkip: true,
        nonActionableHidesActions: true,
        noSuggestionHidesActions: true,
        failShowsApply: true,
        evidenceFieldsPresent: true,
        markupLiteral: true,
        skipSendsNoMessage: true,
        skipHidesApply: true,
        skipChangesLabel: true,
        skipStatusMentionsNoChange: true,
        reviewAgainShowsApply: true,
        reviewAgainSendsNoMessage: true,
        applyMessage: true,
        applyHidesApply: true,
        applyHidesSkip: true,
        applyShowsUndo: true,
        applyStatusMentionsTemporary: true,
        undoMessage: true,
        undoShowsApply: true,
        undoHidesUndo: true,
        undoShowsSkip: true,
        undoStatusMentionsRestored: true,
        failureKeepsApply: true,
        failureStatusMentionsChanged: true,
        completeScanNotPartial: true,
      });
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }
);
