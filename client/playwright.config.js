import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 120000,
  expect: { timeout: 10000 },
  use: {
    baseURL: "http://127.0.0.1:4175",
    browserName: "chromium",
    ...(process.platform === "win32" ? { channel: "msedge" } : {}),
    trace: "retain-on-failure",
    actionTimeout: 10000,
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node ../server/testing/browser-server.js",
      url: "http://127.0.0.1:4174/api/health",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4175 --strictPort",
      url: "http://127.0.0.1:4175",
      env: { VITE_API_BASE: "http://127.0.0.1:4174" },
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
