type LovableErrorOptions = {
  mechanism?: "manual" | "onerror" | "unhandledrejection" | "react_error_boundary";
  handled?: boolean;
  severity?: "error" | "warning" | "info";
};
type LovableEvents = {
  track?: (event: string, properties?: Record<string, unknown>) => string | null;
  captureException?: (
    error: unknown,
    context?: Record<string, unknown>,
    options?: LovableErrorOptions,
  ) => void;
};
declare global {
  interface Window {
    __lovableEvents?: LovableEvents;
    __lovableReportRuntimeError?: (payload: {
      message: string;
      stack?: string;
      filename?: string;
    }) => void;
  }
}
// Error values, stacks, URLs and arbitrary context may include tab-local text,
// image URLs or a local filename. Never forward those across the trust boundary.
export function reportLovableError(_error: unknown, _context: Record<string, unknown> = {}) {
  if (typeof window === "undefined") return;
  window.__lovableEvents?.captureException?.(
    "CLIENT_RENDER_FAILURE",
    { source: "react_error_boundary" },
    { mechanism: "react_error_boundary", handled: false, severity: "error" },
  );
  window.__lovableReportRuntimeError?.({ message: "CLIENT_RENDER_FAILURE" });
}
