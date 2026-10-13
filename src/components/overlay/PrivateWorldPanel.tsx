import { useSyncExternalStore, type ChangeEvent } from "react";
import { FileUp, RotateCcw } from "lucide-react";
import { useT } from "@/i18n";
import { worldDataProvider } from "@/world/privateWorldSession";

interface PrivateWorldPanelProps {
  enabled: boolean;
}

export function PrivateWorldPanel({ enabled }: PrivateWorldPanelProps) {
  const t = useT();
  const snapshot = useSyncExternalStore(
    worldDataProvider.subscribe,
    worldDataProvider.getSnapshot,
    worldDataProvider.getSnapshot,
  );

  if (!enabled) return null;

  const onInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    await worldDataProvider.openFile(file);
    input.value = "";
  };

  return (
    <section
      className="pointer-events-auto absolute bottom-4 right-4 z-20 max-w-xs rounded-xl border border-border bg-background/90 p-3 shadow-lg backdrop-blur sm:bottom-6 sm:right-6"
      aria-labelledby="private-world-preview-title"
      data-testid="private-world-panel"
    >
      <h2 id="private-world-preview-title" className="text-sm font-semibold text-foreground">
        {t.localPreview.title}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.localPreview.body}</p>
      {snapshot.mode === "private" && (
        <p className="mt-2 text-xs font-medium text-primary" role="status">
          {t.localPreview.loaded}
        </p>
      )}
      {snapshot.mode === "private-error" && (
        <p className="mt-2 text-xs font-medium text-destructive" role="alert">
          {t.localPreview.error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="chip cursor-pointer gap-1.5 text-xs">
          <FileUp className="h-3.5 w-3.5" />
          <span>{t.localPreview.open}</span>
          <input
            className="sr-only"
            aria-label={t.localPreview.open}
            type="file"
            accept="application/json,.json"
            onChange={onInput}
          />
        </label>
        {snapshot.mode !== "fixture" && (
          <button
            type="button"
            className="chip gap-1.5 text-xs"
            onClick={() => worldDataProvider.resetFixture()}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {t.localPreview.reset}
          </button>
        )}
      </div>
    </section>
  );
}
