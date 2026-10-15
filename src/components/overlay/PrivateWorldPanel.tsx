import { useState, useSyncExternalStore, useEffect, type ChangeEvent } from "react";
import { Download, FileUp, Redo2, RotateCcw, Save, Undo2 } from "lucide-react";
import { useT } from "@/i18n";
import { worldDataProvider } from "@/world/privateWorldSession";
import type { RoofType, WorldOverrideDocument } from "@/world/schema";

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

  const [selectedId, setSelectedId] = useState<string>("");
  const [editHeight, setEditHeight] = useState<number>(6);
  const [editLevels, setEditLevels] = useState<number>(2);
  const [editRoof, setEditRoof] = useState<RoofType>("flat");
  const [history, setHistory] = useState<WorldOverrideDocument[]>([]);
  const [future, setFuture] = useState<WorldOverrideDocument[]>([]);
  const [lastRevision, setLastRevision] = useState<number>(snapshot.revision);

  // Reset local undo/redo/selection if package is reloaded or fixture reset externally
  useEffect(() => {
    if (snapshot.revision !== lastRevision) {
      setLastRevision(snapshot.revision);
      if (snapshot.mode === "fixture" || snapshot.mode === "private-error") {
        setHistory([]);
        setFuture([]);
        setSelectedId("");
      }
    }
  }, [snapshot.revision, snapshot.mode, lastRevision]);

  if (!enabled) return null;

  const onInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    await worldDataProvider.openFile(file);
    input.value = "";
  };

  const buildings = snapshot.mode !== "private-error" ? snapshot.world.buildings : [];

  const handleSelectBuilding = (id: string) => {
    setSelectedId(id);
    const b = buildings.find((item: { localId: string }) => item.localId === id);
    if (b) {
      setEditHeight(b.wallHeight);
      setEditLevels(b.levels ?? Math.round(b.wallHeight / 3.2));
      setEditRoof(b.roofType);
    }
  };

  const handleApplyOverride = () => {
    if (!selectedId || snapshot.mode === "private-error") return;
    const currentDoc = snapshot.overrides ?? {
      schemaVersion: "1.0" as const,
      overrides: [],
    };
    setHistory((prev) => [...prev, currentDoc]);
    setFuture([]);

    const newOverride = {
      localId: `ov-${selectedId}`,
      revision: (currentDoc.overrides.length || 0) + 1,
      reason: `Chỉnh sửa cục bộ trong trình biên tập cho ${selectedId}; chưa đối chiếu nguồn thực địa`,
      provenance: {
        source: "manual_override" as const,
        quality: "inferred" as const,
      },
      patch: {
        operation: "patch_building" as const,
        featureId: selectedId,
        patch: {
          wallHeight: editHeight,
          levels: editLevels,
          roofType: editRoof,
        },
      },
    };

    const nextOverrides: WorldOverrideDocument = {
      schemaVersion: "1.0",
      overrides: [
        ...currentDoc.overrides.filter((o) => {
          if (o.patch.operation === "patch_building" && o.patch.featureId === selectedId) {
            return false;
          }
          return true;
        }),
        newOverride,
      ],
    };
    worldDataProvider.applyOverrides(nextOverrides);
  };

  const handleUndo = () => {
    if (history.length === 0 || snapshot.mode === "private-error") return;
    const currentDoc = snapshot.overrides ?? {
      schemaVersion: "1.0" as const,
      overrides: [],
    };
    const previous = history[history.length - 1]!;
    setHistory((prev) => prev.slice(0, -1));
    setFuture((prev) => [currentDoc, ...prev]);
    worldDataProvider.applyOverrides(previous);
  };

  const handleRedo = () => {
    if (future.length === 0 || snapshot.mode === "private-error") return;
    const currentDoc = snapshot.overrides ?? {
      schemaVersion: "1.0" as const,
      overrides: [],
    };
    const next = future[0]!;
    setFuture((prev) => prev.slice(1));
    setHistory((prev) => [...prev, currentDoc]);
    worldDataProvider.applyOverrides(next);
  };

  const handleExportOverrides = () => {
    const doc =
      snapshot.mode !== "private-error" && snapshot.overrides
        ? snapshot.overrides
        : {
            schemaVersion: "1.0" as const,
            overrides: [],
          };
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "world-overrides.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section
      className="pointer-events-auto absolute bottom-4 right-4 z-20 max-w-sm rounded-xl border border-border bg-background/95 p-3.5 shadow-xl backdrop-blur sm:bottom-6 sm:right-6"
      aria-labelledby="private-world-preview-title"
      data-testid="private-world-panel"
    >
      <h2 id="private-world-preview-title" className="text-sm font-semibold text-foreground">
        {t.localPreview.title}
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.localPreview.body}</p>
      {snapshot.mode === "private" && (
        <p className="mt-2 text-xs font-medium text-primary" role="status">
          {t.localPreview.loaded} ({buildings.length} công trình)
        </p>
      )}
      {snapshot.mode === "private-error" && (
        <p className="mt-2 text-xs font-medium text-destructive" role="alert">
          {t.localPreview.error}
        </p>
      )}
      {snapshot.mode !== "private-error" && snapshot.lastError && (
        <p
          className="mt-2 text-xs font-medium text-destructive"
          role="alert"
          data-testid="private-world-last-error"
        >
          {snapshot.lastError}
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

      {snapshot.mode === "private" && buildings.length > 0 && (
        <div className="mt-3.5 border-t border-border pt-3 text-xs">
          <div className="font-medium text-foreground">Biên tập công trình</div>
          <div className="mt-2 flex flex-col gap-1.5">
            <select
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
              aria-label="Chọn công trình"
              value={selectedId}
              onChange={(e) => handleSelectBuilding(e.target.value)}
            >
              <option value="">-- Chọn công trình để sửa --</option>
              {buildings.map((b: { localId: string; wallHeight: number; roofType: string }) => (
                <option key={b.localId} value={b.localId}>
                  {b.localId} ({b.wallHeight.toFixed(1)}m, {b.roofType})
                </option>
              ))}
            </select>

            {selectedId && (
              <div className="mt-1 flex flex-col gap-2 rounded bg-muted/40 p-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] text-muted-foreground">Chiều cao (m):</label>
                  <input
                    type="number"
                    step="0.5"
                    className="w-20 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
                    value={editHeight}
                    onChange={(e) => setEditHeight(Number.parseFloat(e.target.value) || 0)}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] text-muted-foreground">Số tầng:</label>
                  <input
                    type="number"
                    className="w-20 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
                    value={editLevels}
                    onChange={(e) => setEditLevels(Number.parseInt(e.target.value, 10) || 1)}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <label className="text-[11px] text-muted-foreground">Kiểu mái:</label>
                  <select
                    className="rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
                    value={editRoof}
                    onChange={(e) => setEditRoof(e.target.value as RoofType)}
                  >
                    <option value="flat">Bằng (flat)</option>
                    <option value="terrace_tum">Mái tum (terrace_tum)</option>
                    <option value="gabled">Mái dốc (gabled)</option>
                    <option value="hipped">Mái vát (hipped)</option>
                    <option value="corrugated">Mái tôn (corrugated)</option>
                  </select>
                </div>
                <div className="mt-1 flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    className="chip gap-1 text-[11px]"
                    onClick={handleApplyOverride}
                  >
                    <Save className="h-3 w-3" />
                    <span>Lưu sửa</span>
                  </button>
                  <div className="flex items-center gap-1">
                    {history.length > 0 && (
                      <button
                        type="button"
                        className="chip gap-1 text-[11px]"
                        onClick={handleUndo}
                        title="Hoàn tác (Undo)"
                      >
                        <Undo2 className="h-3 w-3" />
                        <span>Undo</span>
                      </button>
                    )}
                    {future.length > 0 && (
                      <button
                        type="button"
                        className="chip gap-1 text-[11px]"
                        onClick={handleRedo}
                        title="Làm lại (Redo)"
                      >
                        <Redo2 className="h-3 w-3" />
                        <span>Redo</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            <button
              type="button"
              className="chip mt-1.5 w-full justify-center gap-1.5 text-xs"
              onClick={handleExportOverrides}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Xuất file overrides (.json)</span>
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
