import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/production",
  timeout: 90000,
  workers: 1,
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: "test-results/production-report.json" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:4193",
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { args: ["--enable-unsafe-swiftshader"] },
  },
  webServer: {
    command: "bun scripts/production-server.mjs",
    url: "http://127.0.0.1:4193/gioi-thieu",
    env: { PRODUCTION_QA_UPDATE: "1" },
    reuseExistingServer: false,
    timeout: 60000,
  },
});
