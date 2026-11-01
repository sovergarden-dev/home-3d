import { expect, it } from "vitest";
import { vi } from "@/i18n/vi";
import { en } from "@/i18n/en";
function keys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") return [prefix];
  return Object.entries(value)
    .flatMap(([key, child]) => keys(child, `${prefix}.${key}`))
    .sort();
}
it("keeps every VI/EN message and array slot in parity", () => {
  expect(keys(en)).toEqual(keys(vi));
});
