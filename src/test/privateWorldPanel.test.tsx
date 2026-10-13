import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PrivateWorldPanel } from "@/components/overlay/PrivateWorldPanel";
import { worldDataProvider } from "@/world/privateWorldSession";

afterEach(() => worldDataProvider.resetFixture());

describe("local private preview panel", () => {
  it("renders only when explicitly enabled and keeps a local file input", () => {
    const { rerender } = render(<PrivateWorldPanel enabled={false} />);
    expect(screen.queryByText("Xem trước gói cục bộ")).toBeNull();

    rerender(<PrivateWorldPanel enabled />);
    expect(screen.getByText("Xem trước gói cục bộ")).toBeVisible();
    expect(screen.getByLabelText("Mở gói world")).toHaveAttribute("type", "file");
  });

  it("shows a failure state for an invalid local package instead of returning to demo silently", async () => {
    render(<PrivateWorldPanel enabled />);
    const file = new File(["{ bad"], "invalid-world.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Mở gói world"), { target: { files: [file] } });
    expect(
      await screen.findByText("Không thể mở gói cục bộ. Giữ gói riêng trên thiết bị và thử lại."),
    ).toBeVisible();
  });
});
