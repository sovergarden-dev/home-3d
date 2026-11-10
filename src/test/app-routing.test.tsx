import { readFileSync } from "node:fs";
import { createRouter, rootRouteId } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";

import { routeTree } from "@/routeTree.gen";

// Match routes without running loaders or rendering: loaders may need a server or
// network the test run lacks, and jsdom never loads the stylesheets React waits on.
describe("App routing", () => {
  it("matches a page for / without requiring QueryClient, Sonner, or Radix AlertDialog in the root shell", () => {
    const router = createRouter({ routeTree });

    const matches = router.matchRoutes("/");

    expect(matches.at(-1)?.routeId).not.toBe(rootRouteId);
    const rootSource = readFileSync("src/routes/__root.tsx", "utf8");
    const pwaSource = readFileSync("src/components/PwaUpdate.tsx", "utf8");
    expect(rootSource).not.toMatch(/QueryClient|sonner/);
    expect(pwaSource).not.toMatch(/alert-dialog|@radix-ui/);
  });
});
