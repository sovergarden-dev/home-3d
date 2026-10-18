import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "sonner";
import { toast } from "sonner";

const trackedVisibilityListeners = () => {
  const added = new Set<EventListenerOrEventListenerObject>();
  const originalAdd = document.addEventListener;
  const originalRemove = document.removeEventListener;

  const addSpy = vi
    .spyOn(document, "addEventListener")
    .mockImplementation((type, listener, options) => {
      if (type === "visibilitychange") added.add(listener);
      return originalAdd.call(document, type, listener, options);
    });
  const removeSpy = vi
    .spyOn(document, "removeEventListener")
    .mockImplementation((type, listener, options) => {
      if (type === "visibilitychange") added.delete(listener);
      return originalRemove.call(document, type, listener, options);
    });

  return { added, addSpy, removeSpy };
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Sonner lifecycle", () => {
  it("removes every visibilitychange listener from document on unmount", async () => {
    const { added, addSpy, removeSpy } = trackedVisibilityListeners();
    const view = render(<Toaster />);
    toast("lifecycle regression");

    await waitFor(() => {
      expect(addSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
      expect(added.size).toBeGreaterThan(0);
    });

    view.unmount();

    expect(removeSpy).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(added.size).toBe(0);
  });
});
