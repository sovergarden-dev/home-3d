import { afterEach, expect, it, vi } from "vitest";
import { reportLovableError } from "@/lib/lovable-error-reporting";
afterEach(() => {
  delete window.__lovableEvents;
  delete window.__lovableReportRuntimeError;
});
it("does not send memory text, filename, image, camera hash or arbitrary error context", () => {
  const sentinel = "P10_SYNTHETIC_TELEMETRY_SENTINEL";
  const exception = vi.fn();
  const report = vi.fn();
  window.__lovableEvents = { captureException: exception };
  window.__lovableReportRuntimeError = report;
  reportLovableError(new Error(sentinel), { title: sentinel, photo: `data:${sentinel}` });
  expect(exception).toHaveBeenCalledOnce();
  expect(report).toHaveBeenCalledOnce();
  expect(JSON.stringify([exception.mock.calls, report.mock.calls])).not.toContain(sentinel);
  expect(report.mock.calls[0]?.[0]).toEqual({ message: "CLIENT_RENDER_FAILURE" });
});
