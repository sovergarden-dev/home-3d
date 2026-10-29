import { chromium } from "@playwright/test";
import { readFile } from "node:fs/promises";
const svg = await readFile("src/assets/pwa/icon.svg", "utf8");
const browser = await chromium.launch();
try {
  for (const size of [192, 512]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<style>html,body{margin:0;background:#F3F1EA;width:100%;height:100%}svg{display:block;width:100%;height:100%}</style>${svg}`,
    );
    await page.screenshot({ path: `src/assets/pwa/icon-${size}.png` });
    await page.close();
  }
} finally {
  await browser.close();
}
