import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrivateWorldPanel } from "@/components/overlay/PrivateWorldPanel";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import { parseWorldPackage } from "@/world/package";
import { worldDataProvider } from "@/world/privateWorldSession";

const sentinel = "R23_SYNTHETIC_MANIFEST_SENTINEL";
function validPackage() {
  const world = structuredClone(SYNTHETIC_NEIGHBORHOOD);
  return { manifest: structuredClone(world.manifest), world };
}
const malformed = [
  ["missing coverage", (manifest: Record<string, unknown>) => delete manifest["coverage"]],
  ["null coverage", (manifest: Record<string, unknown>) => (manifest["coverage"] = null)],
  [
    "object sourceCount",
    (manifest: Record<string, unknown>) =>
      (manifest["coverage"] = { quality: "synthetic", sourceCount: { sentinel } }),
  ],
  [
    "string sourceCount",
    (manifest: Record<string, unknown>) =>
      (manifest["coverage"] = { quality: "synthetic", sourceCount: "1" }),
  ],
  [
    "negative sourceCount",
    (manifest: Record<string, unknown>) =>
      (manifest["coverage"] = { quality: "synthetic", sourceCount: -1 }),
  ],
  [
    "fractional sourceCount",
    (manifest: Record<string, unknown>) =>
      (manifest["coverage"] = { quality: "synthetic", sourceCount: 1.5 }),
  ],
  [
    "unknown quality",
    (manifest: Record<string, unknown>) =>
      (manifest["coverage"] = { quality: "trusted", sourceCount: 1 }),
  ],
  [
    "object licence",
    (manifest: Record<string, unknown>) => (manifest["licences"] = [{ sentinel }]),
  ],
  ["null chunk", (manifest: Record<string, unknown>) => (manifest["chunks"] = [null])],
  [
    "invalid chunk bounds",
    (manifest: Record<string, unknown>) =>
      (manifest["chunks"] = [{ localId: "synthetic-core", tier: "core", bounds: [0, 1] }]),
  ],
  [
    "invalid chunk tier",
    (manifest: Record<string, unknown>) =>
      (manifest["chunks"] = [
        { localId: "synthetic-core", tier: "invented", bounds: [-1, -1, 1, 1] },
      ]),
  ],
  [
    "object asset hash",
    (manifest: Record<string, unknown>) => (manifest["assetHashes"] = { fixture: { sentinel } }),
  ],
] as const;

afterEach(() => {
  vi.restoreAllMocks();
  act(() => worldDataProvider.resetFixture());
});

describe("R23-1 manifest boundary", () => {
  for (const location of ["manifest", "world.manifest"] as const) {
    it.each(malformed)(`rejects ${location}: %s without echoing input`, (_name, mutate) => {
      const pkg = validPackage();
      const manifest = location === "manifest" ? pkg.manifest : pkg.world.manifest;
      mutate(manifest as unknown as Record<string, unknown>);
      const result = parseWorldPackage(JSON.stringify(pkg));
      expect(result).toEqual({ ok: false, errorCode: "WORLD_PACKAGE_SHAPE_INVALID" });
      expect(JSON.stringify(result)).not.toContain(sentinel);
    });
  }
  it("retains valid optional metadata, all defined quality states and zero source count", () => {
    for (const quality of [
      "synthetic",
      "verified",
      "source_only",
      "inferred",
      "unknown",
      "conflict",
    ] as const) {
      const pkg = validPackage();
      for (const manifest of [pkg.manifest, pkg.world.manifest]) {
        delete manifest.sources;
        manifest.coverage = { quality, sourceCount: 0 };
      }
      expect(parseWorldPackage(JSON.stringify(pkg)).ok).toBe(true);
    }
  });
  it.each(malformed.slice(0, 3))(
    "file %s shows a safe error and immediately recovers with a valid file",
    async (_name, mutate) => {
      render(<PrivateWorldPanel enabled />);
      const pkg = validPackage();
      mutate(pkg.world.manifest as unknown as Record<string, unknown>);
      const input = screen.getByLabelText("Mở gói world");
      fireEvent.change(input, {
        target: {
          files: [new File([JSON.stringify(pkg)], "malformed.json", { type: "application/json" })],
        },
      });
      await waitFor(() => expect(worldDataProvider.getSnapshot().mode).toBe("private-error"));
      expect(screen.getByTestId("private-world-panel")).toHaveTextContent(
        "WORLD_PACKAGE_SHAPE_INVALID",
      );
      expect(document.body).not.toHaveTextContent(sentinel);
      fireEvent.change(screen.getByLabelText("Mở gói world"), {
        target: {
          files: [
            new File([JSON.stringify(validPackage())], "valid.json", { type: "application/json" }),
          ],
        },
      });
      await waitFor(() => expect(worldDataProvider.getSnapshot().mode).toBe("private"));
      expect(screen.getByText("Đã mở gói cục bộ", { exact: false })).toBeVisible();
      expect(document.body).not.toHaveTextContent("WORLD_PACKAGE_SHAPE_INVALID");
    },
  );
});
