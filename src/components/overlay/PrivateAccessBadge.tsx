import { useEffect, useState } from "react";
import { useT } from "@/i18n";
import {
  decodeRuntimeMode,
  DEMO_RUNTIME,
  PRIVATE_RUNTIME_PATH,
  type RuntimeMode,
} from "@/private/contract";

export function PrivateAccessBadge() {
  const t = useT();
  const [mode, setMode] = useState<RuntimeMode>(DEMO_RUNTIME);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    void fetch(PRIVATE_RUNTIME_PATH, {
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then(async (response) =>
        response.ok ? decodeRuntimeMode(await response.json()) : DEMO_RUNTIME,
      )
      .then((next) => {
        if (!controller.signal.aborted) setMode(next);
      })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, []);
  if (mode.mode !== "private") return null;
  return (
    <p className="mt-1 text-[11px] font-medium text-primary" role="status">
      {t.privateAccessVerified}
    </p>
  );
}
