import { webkit } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await webkit.launch();
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:4188/gioi-thieu");
  const result = await page.evaluate(async () => {
    const globals = {
      AudioContext: typeof window.AudioContext,
      webkitAudioContext: typeof window.webkitAudioContext,
      OfflineAudioContext: typeof window.OfflineAudioContext,
      webkitOfflineAudioContext: typeof window.webkitOfflineAudioContext,
    };
    let constructed = false,
      state = null,
      errorName = null,
      errorMessage = null;
    try {
      const context = new AudioContext();
      constructed = true;
      state = context.state;
      await context.close();
    } catch (error) {
      errorName = error.name;
      errorMessage = error.message;
    }
    return { globals, constructed, state, errorName, errorMessage };
  });
  const report = {
    syntheticOnly: true,
    platform: "WINDOWS_LOCAL",
    browser: "Playwright WebKit",
    version: browser.version(),
    nativeSafari: false,
    ...result,
  };
  await mkdir("docs/assets/qa/codex/m2", { recursive: true });
  await writeFile(
    "docs/assets/qa/codex/m2/webkit-audio-capability.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
}
