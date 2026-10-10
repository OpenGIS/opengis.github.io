// Full-page screenshots of the site at 1024px width.
// Spawns its own Vite dev server on a free port picked from the ephemeral range
// (11000-11999) so the standard development port is never disturbed, captures
// via system Chrome, saves DARK.png (dark theme) then LIGHT.png (light theme),
// then cleans up.
import { spawn } from "node:child_process";
import net from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { chromium } from "playwright-core";

const THEMES = [
  { name: "dark", file: "DARK.png" },
  { name: "light", file: "LIGHT.png" },
];
const VIEWPORT_WIDTH = 1024;
const SERVER_START_TIMEOUT_MS = 30_000;
const PAGE_LOAD_TIMEOUT_MS = 60_000;
const PORT_RANGE_START = 11000;
const PORT_RANGE_END = 11999;

const port = await findFreePort(PORT_RANGE_START, PORT_RANGE_END);
const vite = spawn("node_modules/.bin/vite", ["--port", String(port), "--strictPort"], {
  detached: true, // own process group so we can kill the whole tree
  stdio: ["ignore", "pipe", "pipe"],
});

let url = null;
try {
  url = await waitForServerUrl(vite, SERVER_START_TIMEOUT_MS);
  console.log(`Vite ready at ${url}`);

  const browser = await chromium.launch({ channel: "chrome" });
  try {
    const page = await browser.newPage({
      viewport: { width: VIEWPORT_WIDTH, height: 800 },
    });
    await page.goto(url, { waitUntil: "networkidle", timeout: PAGE_LOAD_TIMEOUT_MS });
    for (const { name, file } of THEMES) {
      await page.evaluate(async (theme) => {
        document.documentElement.setAttribute("data-theme", theme);
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
      }, name);
      await page.screenshot({ path: file, fullPage: true });
      console.log(`Saved ${file}`);
    }
  } finally {
    await browser.close();
  }
} finally {
  stopVite(vite);
}

/**
 * Picks the first free TCP port in the inclusive range [start, end].
 * Probes each port by attempting to listen; EADDRINUSE means it is taken.
 * @param {number} start
 * @param {number} end
 * @returns {Promise<number>}
 */
function findFreePort(start, end) {
  return new Promise((resolve, reject) => {
    const tryPort = (candidate) => {
      if (candidate > end) {
        reject(new Error(`No free port in range ${start}-${end}`));
        return;
      }
      const probe = net.createServer();
      probe.unref();
      probe.once("error", (err) => {
        if (err.code === "EADDRINUSE") tryPort(candidate + 1);
        else reject(err);
      });
      probe.listen(candidate, () => {
        probe.close(() => resolve(candidate));
      });
    };
    tryPort(start);
  });
}

/**
 * Waits for Vite to print its "Local:" URL, then confirms the server responds.
 * @param {import("node:child_process").ChildProcess} child
 * @param {number} timeoutMs
 * @returns {Promise<string>}
 */
function waitForServerUrl(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Vite did not start within ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const match = chunk.toString().match(/Local:\s+http:\/\/localhost:(\d+)/);
      if (!match) return;
      clearTimeout(timer);
      const url = `http://localhost:${match[1]}/`;
      waitUntilResponding(url, timeoutMs)
        .then(() => resolve(url))
        .catch(reject);
    });

    child.on("error", reject);
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      if (/error|failed/i.test(text)) console.error(`[vite] ${text.trim()}`);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Vite exited before ready (code ${code})`));
    });
  });
}

/** Polls the URL until it returns an HTTP 200. */
async function waitUntilResponding(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // server not up yet — retry
    }
    await sleep(250);
  }
  throw new Error(`Server at ${url} did not respond within ${timeoutMs}ms`);
}

/** Kills the Vite process group, with a SIGKILL fallback. */
function stopVite(child) {
  if (child.exitCode !== null) return; // already exited
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill("SIGTERM");
  }
  setTimeout(() => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      /* already gone */
    }
  }, 3_000).unref();
}
