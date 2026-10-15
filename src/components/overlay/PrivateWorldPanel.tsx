import { useState, useSyncExternalStore, useEffect, type ChangeEvent } from "react";
import { Download, FileUp, Redo2, RotateCcw, Save, Undo2 } from "lucide-react";
import { useT } from "@/i18n";
import { worldDataProvider } from "@/world/privateWorldSession";
import type {
  Building,
  BuildingPart,
  Lot,
  RoadSegment,
  RoofType,
  SurfaceGeometry,
  WorldOverrideDocument,
} from "@/world/schema";

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
  const [selectedPartId, setSelectedPartId] = useState<string>("");
  const [editHeight, setEditHeight] = useState<number>(6);
  const [editLevels, setEditLevels] = useState<number>(2);
  const [editRoof, setEditRoof] = useState<RoofType>("flat");
  const [editGeometry, setEditGeometry] = useState<string>("");
  const [selectedRoadId, setSelectedRoadId] = useState<string>("");
  const [editRoadWidth, setEditRoadWidth] = useState<number>(5);
  const [selectedLotId, setSelectedLotId] = useState<string>("");
  const [editPartHeight, setEditPartHeight] = useState<number>(6);
  const [editPartLevels, setEditPartLevels] = useState<number>(2);
  const [editPartRoof, setEditPartRoof] = useState<RoofType>("flat");
  const [editLotGeometry, setEditLotGeometry] = useState<string>("");
  const [geometryError, setGeometryError] = useState<string | null>(null);
  const [history, setHistory] = useState<WorldOverrideDocument[]>([]);
  const [future, setFuture] = useState<WorldOverrideDocument[]>([]);
  const [lastPackageEpoch, setLastPackageEpoch] = useState<number>(snapshot.packageEpoch);

  // Reset local undo/redo/selection if package is reloaded or fixture reset externally
  useEffect(() => {
    if (snapshot.packageEpoch !== lastPackageEpoch) {
      setLastPackageEpoch(snapshot.packageEpoch);
      setHistory([]);
      setFuture([]);
      setSelectedId("");
      setSelectedPartId("");
      setSelectedRoadId("");
      setSelectedLotId("");
      setGeometryError(null);
    }
  }, [snapshot.packageEpoch, lastPackageEpoch]);

  if (!enabled) return null;

  const onInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    await worldDataProvider.openFile(file);
    input.value = "";
  };

  const buildings = snapshot.mode !== "private-error" ? snapshot.world.buildings : [];
  const roads = snapshot.mode !== "private-error" ? snapshot.world.roads : [];
  const lots = snapshot.mode !== "private-error" ? snapshot.world.lots : [];
  const selectedBuilding = buildings.find((item) => item.localId === selectedId);
  const selectedPart = selectedBuilding?.parts?.find((item) => item.localId === selectedPartId);

  const handleSelectBuilding = (id: string) => {
    setSelectedId(id);
    const b = buildings.find((item: Building) => item.localId === id);
    if (b) {
      setEditHeight(b.wallHeight);
      setEditLevels(b.levels ?? Math.round(b.wallHeight / 3.2));
      setEditRoof(b.roofType);
      setEditGeometry(JSON.stringify(b.geometry));
      const firstPart = b.parts?.[0];
      setSelectedPartId(firstPart?.localId ?? "");
      setEditPartHeight(firstPart?.wallHeight ?? 6);
      setEditPartLevels(firstPart?.levels ?? Math.round((firstPart?.wallHeight ?? 6) / 3.2));
      setEditPartRoof(firstPart?.roofType ?? "flat");
      setGeometryError(null);
    } else {
      setSelectedPartId("");
    }
  };

  const handleSelectPart = (id: string) => {
    setSelectedPartId(id);
    const part = selectedBuilding?.parts?.find((item) => item.localId === id);
    if (part) {
      setEditPartHeight(part.wallHeight);
      setEditPartLevels(part.levels ?? Math.round(part.wallHeight / 3.2));
      setEditPartRoof(part.roofType);
    }
  };

  const parseSurfaceGeometry = (text: string, label: string): SurfaceGeometry | null => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setGeometryError(`${label} JSON không hợp lệ`);
      return null;
    }
    const candidate = parsed as SurfaceGeometry;
    if (!candidate || (candidate.type !== "Polygon" && candidate.type !== "MultiPolygon")) {
      setGeometryError(`${label} phải là Polygon/MultiPolygon GeoJSON`);
      return null;
    }
    setGeometryError(null);
    return candidate;
  };

  const commitOverrideDocument = (base: WorldOverrideDocument, next: WorldOverrideDocument) => {
    if (!worldDataProvider.applyOverrides(next)) return false;
    setHistory((prev) => [...prev, base]);
    setFuture([]);
    return true;
  };

  const upsertOverride = (
    operation: "replace_building_geometry" | "replace_lot_geometry",
    featureId: string,
    geometry: SurfaceGeometry,
    reason: string,
  ) => {
    if (snapshot.mode === "private-error") return;
    const base = snapshot.overrides ?? {
      schemaVersion: "1.0" as const,
      overrides: [],
    };
    const next: WorldOverrideDocument = {
      schemaVersion: "1.0",
      overrides: [
        ...base.overrides.filter(
          (o) => !(o.patch.operation === operation && o.patch.featureId === featureId),
        ),
        {
          localId: `ov-${operation}-${featureId}`,
          revision: base.overrides.length + 1,
          reason,
          provenance: { source: "manual_override" as const, quality: "inferred" as const },
          patch: { operation, featureId, geometry },
        },
      ],
    };
    commitOverrideDocument(base, next);
  };

  const handleApplyGeometry = () => {
    if (!selectedId || snapshot.mode === "private-error") return;
    const geometry = parseSurfaceGeometry(editGeometry, "Footprint");
    if (!geometry) return;
    upsertOverride(
      "replace_building_geometry",
      selectedId,
      geometry,
      `Chỉnh footprint trong trình biên tập cho ${selectedId}; chưa đối chiếu nguồn thực địa`,
    );
  };

  const handleSelectRoad = (id: string) => {
    setSelectedRoadId(id);
    const road = roads.find((item: RoadSegment) => item.localId === id);
    if (road) setEditRoadWidth(road.carriagewayWidth ?? 5);
  };

  const handleApplyRoadOverride = () => {
    if (!selectedRoadId || snapshot.mode === "private-error") return;
    const base = snapshot.overrides ?? {
      schemaVersion: "1.0" as const,
      overrides: [],
    };
    const next: WorldOverrideDocument = {
      schemaVersion: "1.0",
      overrides: [
        ...base.overrides.filter(
          (o) => !(o.patch.operation === "patch_road" && o.patch.featureId === selectedRoadId),
        ),
        {
          localId: `ov-road-width-${selectedRoadId}`,
          revision: base.overrides.length + 1,
          reason: `Chỉnh bề rộng đường ${selectedRoadId} trong trình biên tập; chưa đối chiếu nguồn thực địa`,
          provenance: { source: "manual_override" as const, quality: "inferred" as const },
          patch: {
            operation: "patch_road" as const,
            featureId: selectedRoadId,
            patch: { carriagewayWidth: editRoadWidth },
          },
        },
      ],
    };
    commitOverrideDocument(base, next);
  };

  const handleSelectLot = (id: string) => {
    setSelectedLotId(id);
    const lot = lots.find((item: Lot) => item.localId === id);
    if (lot) {
      setEditLotGeometry(JSON.stringify(lot.geometry));
      setGeometryError(null);
    }
  };

  const handleApplyLotGeometry = () => {
    if (!selectedLotId || snapshot.mode === "private-error") return;
    const geometry = parseSurfaceGeometry(editLotGeometry, "Lot geometry");
    if (!geometry) return;
    upsertOverride(
      "replace_lot_geometry",
      selectedLotId,
      geometry,
      `Chỉnh hình dạng lô ${selectedLotId} trong trình biên tập; chưa đối chiếu nguồn thực địa`,
    );
  };

  const handleApplyOverride = () => {
    if (!selectedId || snapshot.mode === "private-error") return;
    const currentDoc = snapshot.overrides ?? {
      schemaVersion: "1.0" as const,
      overrides: [],
    };

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
    commitOverrideDocument(currentDoc, nextOverrides);
  };

  const handleApplyPartOverride = () => {
    if (!selectedBuilding || !selectedPart || snapshot.mode === "private-error") return;
    const currentDoc = snapshot.overrides ?? {
      schemaVersion: "1.0" as const,
      overrides: [],
    };
    const revision =
      currentDoc.overrides.reduce((max, item) => Math.max(max, item.revision), 0) + 1;
    const nextOverrides: WorldOverrideDocument = {
      schemaVersion: "1.0",
      overrides: [
        ...currentDoc.overrides.filter(
          (item) =>
            !(
              item.patch.operation === "patch_building_part" &&
              item.patch.buildingId === selectedBuilding.localId &&
              item.patch.partId === selectedPart.localId
            ),
        ),
        {
          localId: `ov-part-${selectedPart.localId}`,
          revision,
          reason: `Chỉnh phần ${selectedPart.localId} trong trình biên tập; chưa đối chiếu nguồn thực địa`,
          provenance: { source: "manual_override", quality: "inferred" },
          patch: {
            operation: "patch_building_part",
            buildingId: selectedBuilding.localId,
            partId: selectedPart.localId,
            patch: {
              wallHeight: editPartHeight,
              levels: editPartLevels,
              roofType: editPartRoof,
            },
          },
        },
      ],
    };
    commitOverrideDocument(currentDoc, nextOverrides);
  };

  const handleUndo = () => {
    if (history.length === 0 || snapshot.mode === "private-error") return;
    const currentDoc = snapshot.overrides ?? {
      schemaVersion: "1.0" as const,
      overrides: [],
    };
    const previous = history[history.length - 1]!;
    if (worldDataProvider.applyOverrides(previous)) {
      setHistory((prev) => prev.slice(0, -1));
      setFuture((prev) => [currentDoc, ...prev]);
    }
  };

  const handleRedo = () => {
    if (future.length === 0 || snapshot.mode === "private-error") return;
    const currentDoc = snapshot.overrides ?? {
      schemaVersion: "1.0" as const,
      overrides: [],
    };
    const next = future[0]!;
    if (worldDataProvider.applyOverrides(next)) {
      setFuture((prev) => prev.slice(1));
      setHistory((prev) => [...prev, currentDoc]);
    }
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
                {selectedBuilding?.parts?.length ? (
                  <div
                    className="rounded border border-border p-2"
                    data-testid="building-part-editor"
                  >
                    <p className="mb-2 text-[10px] leading-snug text-muted-foreground">
                      Công trình cha là vùng chứa; chỉ các phần bên dưới đang được dựng. Chọn phần
                      để sửa, không sửa chiều cao cha.
                    </p>
                    <label className="text-[11px] text-muted-foreground">
                      Chọn phần công trình:
                    </label>
                    <select
                      className="mb-2 w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
                      aria-label="Chọn phần công trình"
                      value={selectedPartId}
                      onChange={(event) => handleSelectPart(event.target.value)}
                    >
                      <option value="">-- Chọn phần --</option>
                      {selectedBuilding.parts.map((part: BuildingPart) => (
                        <option key={part.localId} value={part.localId}>
                          {part.localId} ({part.wallHeight.toFixed(1)}m)
                        </option>
                      ))}
                    </select>
                    {selectedPart && (
                      <div className="flex flex-col gap-1.5">
                        <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          Chiều cao phần (m):
                          <input
                            type="number"
                            aria-label="Chiều cao phần (m)"
                            step="0.5"
                            className="w-20 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
                            value={editPartHeight}
                            onChange={(event) =>
                              setEditPartHeight(Number.parseFloat(event.target.value) || 0)
                            }
                          />
                        </label>
                        <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          Số tầng phần:
                          <input
                            type="number"
                            aria-label="Số tầng phần"
                            className="w-20 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
                            value={editPartLevels}
                            onChange={(event) =>
                              setEditPartLevels(Number.parseInt(event.target.value, 10) || 1)
                            }
                          />
                        </label>
                        <label className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                          Kiểu mái phần:
                          <select
                            aria-label="Kiểu mái phần"
                            className="rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
                            value={editPartRoof}
                            onChange={(event) => setEditPartRoof(event.target.value as RoofType)}
                          >
                            <option value="flat">Bằng (flat)</option>
                            <option value="terrace_tum">Mái tum (terrace_tum)</option>
                            <option value="gabled">Mái dốc (gabled)</option>
                            <option value="hipped">Mái vát (hipped)</option>
                            <option value="corrugated">Mái tôn (corrugated)</option>
                          </select>
                        </label>
                        <button
                          type="button"
                          className="chip justify-center gap-1 text-[11px]"
                          onClick={handleApplyPartOverride}
                        >
                          <Save className="h-3 w-3" />
                          <span>Lưu phần</span>
                        </button>
                      </div>
                    )}
                  </div>
                ) : null}
                <fieldset disabled={Boolean(selectedBuilding?.parts?.length)} className="contents">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-[11px] text-muted-foreground">Chiều cao (m):</label>
                    <input
                      type="number"
                      aria-label="Chiều cao (m)"
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
                      aria-label="Số tầng"
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
                  <div className="text-[10px] leading-snug text-muted-foreground">
                    Mái dốc/vát/tôn được dựng dạng khối xấp xỉ (prism) trên mặt bằng, gắn nhãn xấp
                    xỉ trong mesh — không phải mái khảo sát thật.
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-muted-foreground">
                      Footprint (GeoJSON Polygon/MultiPolygon):
                    </label>
                    <textarea
                      className="h-20 w-full rounded border border-border bg-background px-1.5 py-1 font-mono text-[10px] text-foreground"
                      aria-label="Footprint GeoJSON"
                      value={editGeometry}
                      onChange={(e) => setEditGeometry(e.target.value)}
                    />
                    <button
                      type="button"
                      className="chip justify-center gap-1 text-[11px]"
                      onClick={handleApplyGeometry}
                    >
                      <Save className="h-3 w-3" />
                      <span>Lưu hình dạng</span>
                    </button>
                  </div>
                </fieldset>
                <div className="mt-1 flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    className="chip gap-1 text-[11px]"
                    onClick={handleApplyOverride}
                    disabled={Boolean(selectedBuilding?.parts?.length)}
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

      {snapshot.mode === "private" && roads.length > 0 && (
        <div className="mt-3.5 border-t border-border pt-3 text-xs">
          <div className="font-medium text-foreground">Biên tập đường</div>
          <div className="mt-2 flex flex-col gap-1.5">
            <select
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
              aria-label="Chọn tuyến đường"
              value={selectedRoadId}
              onChange={(e) => handleSelectRoad(e.target.value)}
            >
              <option value="">-- Chọn tuyến đường để sửa --</option>
              {roads.map((r: RoadSegment) => (
                <option key={r.localId} value={r.localId}>
                  {r.localId} ({r.carriagewayWidth ?? "?"}m, layer {r.elevationLayer})
                </option>
              ))}
            </select>
            {selectedRoadId && (
              <div className="mt-1 flex items-center justify-between gap-2 rounded bg-muted/40 p-2">
                <label className="text-[11px] text-muted-foreground">Bề rộng đường (m):</label>
                <input
                  type="number"
                  step="0.5"
                  aria-label="Bề rộng đường"
                  className="w-20 rounded border border-border bg-background px-1.5 py-0.5 text-xs text-foreground"
                  value={editRoadWidth}
                  onChange={(e) => setEditRoadWidth(Number.parseFloat(e.target.value) || 0)}
                />
                <button
                  type="button"
                  className="chip gap-1 text-[11px]"
                  onClick={handleApplyRoadOverride}
                >
                  <Save className="h-3 w-3" />
                  <span>Lưu đường</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {snapshot.mode === "private" && lots.length > 0 && (
        <div className="mt-3.5 border-t border-border pt-3 text-xs">
          <div className="font-medium text-foreground">Biên tập lô đất</div>
          <div className="mt-2 flex flex-col gap-1.5">
            <select
              className="w-full rounded border border-border bg-background px-2 py-1 text-xs text-foreground"
              aria-label="Chọn lô đất"
              value={selectedLotId}
              onChange={(e) => handleSelectLot(e.target.value)}
            >
              <option value="">-- Chọn lô đất để sửa --</option>
              {lots.map((l: Lot) => (
                <option key={l.localId} value={l.localId}>
                  {l.localId} ({l.status}
                  {l.confirmed ? ", confirmed" : ""})
                </option>
              ))}
            </select>
            {selectedLotId && (
              <div className="mt-1 flex flex-col gap-1 rounded bg-muted/40 p-2">
                <label className="text-[11px] text-muted-foreground">
                  Ranh lô (GeoJSON Polygon/MultiPolygon):
                </label>
                <textarea
                  className="h-20 w-full rounded border border-border bg-background px-1.5 py-1 font-mono text-[10px] text-foreground"
                  aria-label="Lot geometry GeoJSON"
                  value={editLotGeometry}
                  onChange={(e) => setEditLotGeometry(e.target.value)}
                />
                <button
                  type="button"
                  className="chip justify-center gap-1 text-[11px]"
                  onClick={handleApplyLotGeometry}
                >
                  <Save className="h-3 w-3" />
                  <span>Lưu hình dạng lô</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {snapshot.mode !== "private-error" && geometryError && (
        <p className="mt-2 text-xs font-medium text-destructive" role="alert">
          {geometryError}
        </p>
      )}
    </section>
  );
}
