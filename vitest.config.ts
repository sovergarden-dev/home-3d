import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    ...(process.platform === "win32" ? { pool: "threads" as const, maxWorkers: 1 } : {}),
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: [
        "src/geo/*.ts",
        "src/state/*.ts",
        "src/engine/life/{simulation,graph,collision,orientation}.ts",
        "src/atmosphere/{astronomy,clock,calendar,weather}.ts",
      ],
      reporter: ["text", "json-summary"],
      reportsDirectory: "coverage",
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
