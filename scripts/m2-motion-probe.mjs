import { chromium, devices } from "@playwright/test";
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage({
    ...devices["Desktop Chrome"],
    viewport: { width: 740, height: 390 },
    reducedMotion: "reduce",
  });
  await page.goto("http://127.0.0.1:4188/");
  await page.getByRole("button", { name: "Kéo để mở rộng bảng điều khiển", exact: true }).waitFor();
  console.log(
    JSON.stringify(
      await page.evaluate(() => {
        const h = document.querySelector('button[aria-label="Kéo để mở rộng bảng điều khiển"]'),
          s = h.parentElement;
        return {
          media: matchMedia("(prefers-reduced-motion: reduce)").matches,
          cls: s.className,
          style: s.getAttribute("style"),
          duration: getComputedStyle(s).transitionDuration,
          property: getComputedStyle(s).transitionProperty,
        };
      }),
    ),
  );
} finally {
  await browser.close();
}
