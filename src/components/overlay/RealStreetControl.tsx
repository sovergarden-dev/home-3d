import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Building2 } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { useT } from "@/i18n";
import { useAppStore } from "@/state/appStore";
import { worldDataProvider } from "@/world/privateWorldSession";
import { buildGoogleMapsUrl, resolveRealStreetView } from "@/geo/realStreet";
import { openRealStreetWindow, readRealStreetView } from "@/engine/view/externalMapView";

function useWorldSession() {
  return useSyncExternalStore(
    worldDataProvider.subscribe,
    worldDataProvider.getSnapshot,
    worldDataProvider.getSnapshot,
  );
}

export function GeoreferenceInput() {
  const t = useT();
  const snapshot = useWorldSession();
  const [errorEpoch, setErrorEpoch] = useState<number | null>(null);
  const request = useRef(0);
  useEffect(() => {
    request.current += 1;
  }, [snapshot.packageEpoch, snapshot.loading]);
  if (snapshot.mode !== "private") return null;
  return (
    <div className="mt-2 rounded border border-border p-2 text-xs">
      <p role="status">
        {snapshot.georeferenceReady ? t.realStreet.referenceReady : t.realStreet.missing}
      </p>
      <label className="chip mt-2 inline-flex min-h-11 cursor-pointer items-center">
        {t.realStreet.loadReference}
        <input
          type="file"
          accept="application/json,.json"
          className="sr-only"
          aria-label={t.realStreet.loadReference}
          disabled={snapshot.loading}
          onChange={async (event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            input.value = "";
            if (!file) return;
            const id = ++request.current;
            const epoch = worldDataProvider.getSnapshot().packageEpoch;
            setErrorEpoch(null);
            // Clear the previous reference before even starting a potentially hanging read.
            await worldDataProvider.openGeoreferenceText("");
            let ok = false;
            try {
              if (file.size <= 4096) {
                const text =
                  typeof file.text === "function"
                    ? await file.text()
                    : await new Promise<string>((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(String(reader.result ?? ""));
                        reader.onerror = () => reject(new Error("GEOREFERENCE_READ_FAILED"));
                        reader.readAsText(file);
                      });
                const current = worldDataProvider.getSnapshot();
                if (request.current !== id || current.packageEpoch !== epoch || current.loading)
                  return;
                ok = await worldDataProvider.openGeoreferenceText(text);
              }
            } catch {
              /* Only a generic, non-sensitive error reaches the UI. */
            }
            if (request.current === id) setErrorEpoch(ok ? null : epoch);
          }}
        />
      </label>
      {errorEpoch === snapshot.packageEpoch && <p role="alert">{t.realStreet.invalidReference}</p>}
    </div>
  );
}

export function RealStreetControl() {
  const t = useT();
  const snapshot = useWorldSession();
  const ready = useAppStore((state) => state.sceneStatus === "ready");
  const [pending, setPending] = useState<null | {
    epoch: number;
    reference: string;
    preview: ReturnType<typeof resolveRealStreetView>;
  }>(null);
  const [kind, setKind] = useState<"streetview" | "satellite">("streetview");
  const [error, setError] = useState(false);
  const available =
    ready && snapshot.mode === "private" && !snapshot.loading && snapshot.georeferenceReady;
  useEffect(() => {
    if (!available || pending?.epoch !== snapshot.packageEpoch) setPending(null);
  }, [available, snapshot.packageEpoch, pending?.epoch]);
  const close = () => {
    setPending(null);
    setError(false);
  };
  const begin = () => {
    const current = worldDataProvider.getSnapshot();
    const reference = worldDataProvider.getGeoreference();
    const view = readRealStreetView();
    if (!available || current.loading || !reference || !view) return;
    try {
      const preview = resolveRealStreetView(view, reference.origin);
      if (!preview) return;
      setKind("streetview");
      setError(false);
      setPending({ epoch: current.packageEpoch, reference: JSON.stringify(reference), preview });
    } catch {
      setError(true);
    }
  };
  const confirm = () => {
    const current = worldDataProvider.getSnapshot();
    const reference = worldDataProvider.getGeoreference();
    const view = readRealStreetView();
    if (
      !pending ||
      !ready ||
      current.mode !== "private" ||
      current.loading ||
      current.packageEpoch !== pending.epoch ||
      !reference ||
      JSON.stringify(reference) !== pending.reference ||
      !view
    ) {
      close();
      return;
    }
    try {
      // Re-read the active camera and target at the actual confirming gesture.
      const resolved = resolveRealStreetView(view, reference.origin);
      if (!resolved) {
        setError(true);
        return;
      }
      const url = buildGoogleMapsUrl(kind, resolved);
      if (openRealStreetWindow(url)) close();
      else setError(true);
    } catch {
      setError(true);
    }
  };
  return (
    <Dialog.Root
      open={pending !== null}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <Dialog.Trigger asChild>
        <button
          type="button"
          disabled={!available}
          aria-label={t.viewMode.real}
          title={available ? t.viewMode.real : t.realStreet.missing}
          className="ctl text-foreground hover:bg-secondary disabled:opacity-40"
          onClick={begin}
        >
          <Building2 className="h-5 w-5" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-border bg-background p-5 text-foreground shadow-xl"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("p7-cancel")?.focus();
          }}
        >
          <Dialog.Title className="text-lg font-semibold">{t.viewMode.real}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm">
            {t.realStreet.disclosure}
          </Dialog.Description>
          <p className="mt-2 text-xs text-muted-foreground">{t.realStreet.coverage}</p>
          <p className="mt-2 text-xs">{t.realStreet.northConvention}</p>
          {pending && (
            <p className="mt-2 break-words text-xs" data-testid="real-street-preview">
              {t.realStreet.currentTarget}: {pending.preview?.latitude.toFixed(6)},{" "}
              {pending.preview?.longitude.toFixed(6)} · {pending.preview?.heading.toFixed(1)}°
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t.realStreet.choose}>
            <button
              type="button"
              aria-pressed={kind === "streetview"}
              className="chip min-h-11 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              onClick={() => setKind("streetview")}
            >
              {t.realStreet.streetView}
            </button>
            <button
              type="button"
              aria-pressed={kind === "satellite"}
              className="chip min-h-11 aria-pressed:bg-primary aria-pressed:text-primary-foreground"
              onClick={() => setKind("satellite")}
            >
              {t.realStreet.satellite}
            </button>
          </div>
          {error && (
            <p className="mt-3 text-sm" role="alert">
              {t.realStreet.blocked}
            </p>
          )}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button id="p7-cancel" type="button" className="chip min-h-11" onClick={close}>
              {t.realStreet.cancel}
            </button>
            <button
              type="button"
              className="chip min-h-11 bg-primary text-primary-foreground"
              onClick={confirm}
            >
              {t.realStreet.confirm}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
