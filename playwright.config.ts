import { execFileSync } from "node:child_process";
import { defineConfig } from "@playwright/test";

// SMOKE_BASE_URL points the tests at a running deployment (devbox run smoke); without it they start the app locally.
const smokeBaseUrl = process.env.SMOKE_BASE_URL;

// The local app runs on E2E_PORT, else PORT, else a free port, so a busy 3000 does not break the tests.
// Playwright loads this file again in every worker: the chosen port goes into the environment the workers inherit.
function freePort(): string {
  const script = "const s=require('node:net').createServer().listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})";
  return execFileSync(process.execPath, ["-e", script], { encoding: "utf8" }).trim();
}
if (!smokeBaseUrl && !process.env.E2E_PORT) process.env.E2E_PORT = process.env.PORT || freePort();
// The stub Task API (e2e/helpers/stub-api.mjs) the local app talks to; the specs steer it over HTTP.
if (!smokeBaseUrl && !process.env.STUB_PORT) process.env.STUB_PORT = freePort();
const port = process.env.E2E_PORT;
const stubPort = process.env.STUB_PORT;

export default defineConfig({
  testDir: "./e2e",
  // The stub API keeps shared state, so the specs run one after another.
  workers: 1,
  ...(smokeBaseUrl
    ? {}
    : {
        webServer: [
          {
            command: "node e2e/helpers/stub-api.mjs",
            url: `http://127.0.0.1:${stubPort}/__ready`,
            reuseExistingServer: !process.env.CI,
            env: { STUB_PORT: String(stubPort) },
          },
          {
            command: `pnpm build && pnpm exec next start --port ${port}`,
            url: `http://localhost:${port}/api/health`,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            env: { TASKBOARD4_API_URL: `http://127.0.0.1:${stubPort}` },
          },
        ],
      }),
  use: { baseURL: smokeBaseUrl || `http://localhost:${port}` },
});
