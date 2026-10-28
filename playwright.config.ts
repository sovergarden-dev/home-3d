import { defineConfig, devices } from "@playwright/test";
const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE"];
const localURL = process.env["PLAYWRIGHT_LOCAL_URL"];
if (localURL && !["127.0.0.1", "localhost"].includes(new URL(localURL).hostname))
  throw Error("LOCAL_TEST_SERVER_REQUIRED");
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }], ["./scripts/h6-budget-reporter.mjs"]],
  use: {
    baseURL: localURL ?? "http://127.0.0.1:4178",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    contextOptions: { reducedMotion: "no-preference" },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: ["--enable-unsafe-swiftshader"],
          ...(executablePath ? { executablePath } : {}),
        },
      },
    },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
  ],
  webServer: localURL
    ? undefined
    : {
        command: "bun run dev --host 127.0.0.1 --port 4178",
        url: "http://127.0.0.1:4178",
        reuseExistingServer: !process.env["CI"],
        timeout: 60000,
      },
});
