import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { beforeEach, describe, expect, it } from "vitest";
import { Splash } from "@/components/overlay/Splash";
import { dictionaries } from "@/i18n";
import { useAppStore } from "@/state/appStore";

const initial = useAppStore.getState();
beforeEach(() => useAppStore.setState(initial, true));

describe("Splash loading progress accessibility", () => {
  it.each(["vi", "en"] as const)(
    "exposes a named progressbar without ARIA violations in %s",
    async (language) => {
      useAppStore.setState({ language, loadingProgress: 0.42 });
      const { container } = render(<Splash />);
      const bar = screen.getByRole("progressbar", {
        name: dictionaries[language].loadingProgress,
      });
      expect(bar).toHaveAttribute("aria-valuemin", "0");
      expect(bar).toHaveAttribute("aria-valuemax", "100");
      expect(bar).toHaveAttribute("aria-valuenow", "42");
      const result = await axe.run(container, {
        runOnly: {
          type: "rule",
          values: [
            "aria-allowed-attr",
            "aria-prohibited-attr",
            "aria-progressbar-name",
            "aria-required-attr",
            "aria-valid-attr-value",
          ],
        },
      });
      expect(result.violations.map((violation) => violation.id)).toEqual([]);
    },
  );
});
