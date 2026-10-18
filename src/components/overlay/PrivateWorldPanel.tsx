import { useEffect, useState, useSyncExternalStore, type ChangeEvent } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  FileUp,
  RotateCcw,
  Save,
  Undo2,
  Redo2,
} from "lucide-react";
import { useT } from "@/i18n";
import { worldDataProvider } from "@/world/privateWorldSession";
import {
  WORLD_OVERRIDE_IDENTITY_SCHEME,
  type Building,
  type BuildingPart,
  type Lot,
  type RoadSegment,
  type RoofType,
  type SurfaceGeometry,
  type WorldOverrideDocument,
} from "@/world/schema";
import { assessWallHeight } from "@/world/wallHeight";
import {
  getSelectedFeature,
  isConfidenceVisible,
  selectFeature,
  setConfidenceVisible,
  subscribeConfidenceVisibility,
  subscribeFeatureSelection,
} from "@/world/featureSelection";
import {
  buildingPatch,
  classifyNumericDraft,
  parseNumericDraft,
  partPatch,
  roadWidthPatch,
  type NumericDraft,
} from "@/world/editorDraft";

interface PrivateWorldPanelProps {
  enabled: boolean;
}
const emptyDoc = (): WorldOverrideDocument => ({ schemaVersion: "1.0", overrides: [] });
const EMPTY_FEATURES = [] as const;
const provenance = (
  feature: {
    provenance: { source: string; quality: string };
    attributes?: Record<string, { source: string; quality: string }>;
  },
  field: string,
) =>
  feature.attributes?.[field] ??
  (field === "geometry" ? feature.provenance : { source: "unknown", quality: "unknown" });

export function PrivateWorldPanel({ enabled }: PrivateWorldPanelProps) {
  const t = useT();
  const snapshot = useSyncExternalStore(
    worldDataProvider.subscribe,
    worldDataProvider.getSnapshot,
    worldDataProvider.getSnapshot,
  );
  const [collapsed, setCollapsed] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [selectedPartId, setSelectedPartId] = useState("");
  const [selectedRoadId, setSelectedRoadId] = useState("");
  const [selectedLotId, setSelectedLotId] = useState("");
  const [height, setHeight] = useState<NumericDraft>("");
  const [levels, setLevels] = useState<NumericDraft>("");
  const [roof, setRoof] = useState<RoofType>("flat");
  const [partHeight, setPartHeight] = useState<NumericDraft>("");
  const [partLevels, setPartLevels] = useState<NumericDraft>("");
  const [partRoof, setPartRoof] = useState<RoofType>("flat");
  const [roadWidth, setRoadWidth] = useState<NumericDraft>("");
  const [geometry, setGeometry] = useState("");
  const [lotGeometry, setLotGeometry] = useState("");
  const [geometryError, setGeometryError] = useState<string | null>(null);
  const [history, setHistory] = useState<WorldOverrideDocument[]>([]);
  const [future, setFuture] = useState<WorldOverrideDocument[]>([]);
  const [epoch, setEpoch] = useState(snapshot.packageEpoch);
  const selectedFeature = useSyncExternalStore(
    subscribeFeatureSelection,
    getSelectedFeature,
    getSelectedFeature,
  );
  const confidenceVisible = useSyncExternalStore(
    subscribeConfidenceVisibility,
    isConfidenceVisible,
    isConfidenceVisible,
  );
  const synthetic =
    snapshot.mode === "fixture" ||
    (snapshot.mode !== "private-error" && snapshot.world.manifest.isSynthetic);
  const buildings = snapshot.mode === "private-error" ? EMPTY_FEATURES : snapshot.world.buildings;
  const roads = snapshot.mode === "private-error" ? EMPTY_FEATURES : snapshot.world.roads;
  const lots = snapshot.mode === "private-error" ? EMPTY_FEATURES : snapshot.world.lots;
  const selected = buildings.find((b) => b.localId === selectedId);
  const selectedPart = selected?.parts?.find((p) => p.localId === selectedPartId);
  const selectedRoad = roads.find((r) => r.localId === selectedRoadId);
  const selectedLot = lots.find((lot) => lot.localId === selectedLotId);
  const footprintCount = buildings.reduce(
    (count, building) => count + (building.parts?.length || 1),
    0,
  );
  const editingDisabled = snapshot.loading || snapshot.mode !== "private";

  useEffect(() => {
    if (!selectedFeature) {
      setSelectedId("");
      setSelectedPartId("");
      setSelectedRoadId("");
      setSelectedLotId("");
      return;
    }
    if (selectedFeature.featureType !== "road") setSelectedRoadId("");
    if (selectedFeature.featureType !== "lot") setSelectedLotId("");
    if (!["building", "building-part"].includes(selectedFeature.featureType)) {
      setSelectedId("");
      setSelectedPartId("");
    }
    if (selectedFeature.featureType === "building") setSelectedId(selectedFeature.featureId);
    else if (selectedFeature.featureType === "road") setSelectedRoadId(selectedFeature.featureId);
    else if (selectedFeature.featureType === "lot") setSelectedLotId(selectedFeature.featureId);
    else if (selectedFeature.featureType === "building-part") {
      const selection = selectedFeature as typeof selectedFeature & { parentFeatureId?: string };
      const parentId =
        selection.parentFeatureId ??
        buildings.find((building) =>
          building.parts?.some((part) => part.localId === selection.featureId),
        )?.localId;
      if (parentId) {
        setSelectedId(parentId);
        setSelectedPartId(selection.featureId);
      }
    }
  }, [selectedFeature, buildings]);

  useEffect(() => {
    if (snapshot.mode !== "private" || !snapshot.dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [snapshot]);

  useEffect(() => {
    if (snapshot.packageEpoch === epoch) return;
    setEpoch(snapshot.packageEpoch);
    setHistory([]);
    setFuture([]);
    setSelectedId("");
    setSelectedPartId("");
    setSelectedRoadId("");
    setSelectedLotId("");
    setHeight("");
    setLevels("");
    setPartHeight("");
    setPartLevels("");
    setRoadWidth("");
    setGeometry("");
    setLotGeometry("");
    setAdvanced(false);
    setGeometryError(null);
  }, [snapshot.packageEpoch, epoch]);
  useEffect(() => {
    if (!selected) return;
    setHeight(
      assessWallHeight(selected, synthetic).status === "unknown" ? "" : String(selected.wallHeight),
    );
    setLevels(String(selected.levels ?? ""));
    setRoof(selected.roofType);
    setGeometry(JSON.stringify(selected.geometry));
    const currentPart = selected.parts?.find((part) => part.localId === selectedPartId);
    if (!currentPart) setSelectedPartId(selected.parts?.[0]?.localId ?? "");
  }, [selected, selectedId, selectedPartId, snapshot.revision, synthetic]);
  useEffect(() => {
    if (!selectedPart) return;
    setPartHeight(
      assessWallHeight(selectedPart, synthetic).status === "unknown"
        ? ""
        : String(selectedPart.wallHeight),
    );
    setPartLevels(String(selectedPart.levels ?? ""));
    setPartRoof(selectedPart.roofType);
  }, [selectedPart, selectedPartId, snapshot.revision, synthetic]);
  useEffect(() => {
    if (selectedRoad) setRoadWidth(String(selectedRoad.carriagewayWidth ?? ""));
  }, [selectedRoad, selectedRoadId, snapshot.revision]);
  useEffect(() => {
    if (selectedLot) setLotGeometry(JSON.stringify(selectedLot.geometry));
  }, [selectedLot, selectedLotId, snapshot.revision]);
  if (!enabled) return null;

  const dirty = snapshot.mode === "private" && snapshot.dirty;
  const confirmDiscard = (message: string) => !dirty || window.confirm(message);
  const applyDocument = (next: WorldOverrideDocument, base: WorldOverrideDocument) => {
    if (!worldDataProvider.applyOverrides(next)) return false;
    setHistory((items) => [...items, base]);
    setFuture([]);
    return true;
  };
  const addOverride = (patch: WorldOverrideDocument["overrides"][number]["patch"]) => {
    if (snapshot.loading) return false;
    const base =
      snapshot.mode !== "private-error" ? (snapshot.overrides ?? emptyDoc()) : emptyDoc();
    const revision = base.overrides.reduce((max, item) => Math.max(max, item.revision), 0) + 1;
    const next = {
      ...base,
      overrides: [
        ...base.overrides,
        {
          localId: `ov-${revision}-${Date.now()}`,
          revision,
          identityScheme: WORLD_OVERRIDE_IDENTITY_SCHEME,
          reason: "Local editor change; source not re-surveyed",
          provenance: { source: "manual_override" as const, quality: "inferred" as const },
          patch,
        },
      ],
    };
    return applyDocument(next, base);
  };
  const valid = (value: NumericDraft, integer = false) =>
    parseNumericDraft(value, { min: 0, max: integer ? 200 : 1000, integer });
  const numericValid = (value: NumericDraft, integer = false) =>
    value.trim() === "" || valid(value, integer) !== undefined;
  const buildingCanSave = Boolean(
    selected &&
    !selected.parts?.length &&
    numericValid(height) &&
    numericValid(levels, true) &&
    ((valid(height) ?? selected.wallHeight) !== selected.wallHeight ||
      (valid(levels, true) ?? selected.levels) !== selected.levels ||
      roof !== selected.roofType),
  );
  const partCanSave = Boolean(
    selectedPart &&
    numericValid(partHeight) &&
    numericValid(partLevels, true) &&
    ((valid(partHeight) ?? selectedPart.wallHeight) !== selectedPart.wallHeight ||
      (valid(partLevels) ?? selectedPart.levels) !== selectedPart.levels ||
      partRoof !== selectedPart.roofType),
  );
  const roadCanSave = Boolean(
    selectedRoad &&
    valid(roadWidth) !== undefined &&
    valid(roadWidth) !== selectedRoad.carriagewayWidth,
  );
  const saveBuilding = () => {
    if (!buildingCanSave || !selected || selected.parts?.length || snapshot.loading) return;
    const h = valid(height),
      l = valid(levels, true);
    if ((height.trim() && h === undefined) || (levels.trim() && l === undefined)) return;
    const patch = buildingPatch(selected, {
      ...(h === undefined ? {} : { wallHeight: h }),
      ...(l === undefined ? {} : { levels: l }),
      roofType: roof,
    });
    if (Object.keys(patch).length)
      addOverride({ operation: "patch_building", featureId: selected.localId, patch });
  };
  const savePart = () => {
    if (!partCanSave || !selected || !selectedPart || snapshot.loading) return;
    const h = valid(partHeight),
      l = valid(partLevels, true);
    if ((partHeight.trim() && h === undefined) || (partLevels.trim() && l === undefined)) return;
    const patch = partPatch(selectedPart, {
      ...(h === undefined ? {} : { wallHeight: h }),
      ...(l === undefined ? {} : { levels: l }),
      roofType: partRoof,
    });
    if (Object.keys(patch).length)
      addOverride({
        operation: "patch_building_part",
        buildingId: selected.localId,
        partId: selectedPart.localId,
        patch,
      });
  };
  const saveRoad = () => {
    if (!roadCanSave || !selectedRoad || snapshot.loading) return;
    const width = valid(roadWidth);
    if (width === undefined) return;
    const patch = roadWidthPatch(selectedRoad, width);
    if (Object.keys(patch).length)
      addOverride({ operation: "patch_road", featureId: selectedRoad.localId, patch });
  };
  const saveGeometry = () => {
    if (!selected || selected.parts?.length) return;
    try {
      const value = JSON.parse(geometry);
      if (value.type !== "Polygon" && value.type !== "MultiPolygon") throw new Error();
      setGeometryError(null);
      addOverride({
        operation: "replace_building_geometry",
        featureId: selected.localId,
        geometry: value,
      });
    } catch {
      setGeometryError(t.localPreview.invalidNumber);
    }
  };
  const saveLotGeometry = () => {
    if (!selectedLot || snapshot.loading) return;
    try {
      const value = JSON.parse(lotGeometry) as SurfaceGeometry;
      if (value.type !== "Polygon" && value.type !== "MultiPolygon") throw new Error();
      setGeometryError(null);
      addOverride({
        operation: "replace_lot_geometry",
        featureId: selectedLot.localId,
        geometry: value,
      });
    } catch {
      setGeometryError(t.localPreview.invalidNumber);
    }
  };
  const onInput = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    if (!confirmDiscard(t.localPreview.confirmReplace)) {
      input.value = "";
      return;
    }
    await worldDataProvider.openFile(file);
    if (input) input.value = "";
  };
  const exportPackage = () => {
    const workingPackage = worldDataProvider.exportWorkingPackage();
    if (!workingPackage) return;
    const blob = new Blob([JSON.stringify(workingPackage, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "working-world-package.json";
    a.click();
    worldDataProvider.markExported();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const exportOverrides = () => {
    const doc = snapshot.mode === "private" ? (snapshot.overrides ?? emptyDoc()) : null;
    if (!doc) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "world-overrides.json";
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const resetDraft = () => {
    if (selected) {
      setHeight(
        assessWallHeight(selected, synthetic).status === "unknown"
          ? ""
          : String(selected.wallHeight),
      );
      setLevels(String(selected.levels ?? ""));
      setRoof(selected.roofType);
      setGeometry(JSON.stringify(selected.geometry));
    }
    if (selectedPart) {
      setPartHeight(
        assessWallHeight(selectedPart, synthetic).status === "unknown"
          ? ""
          : String(selectedPart.wallHeight),
      );
      setPartLevels(String(selectedPart.levels ?? ""));
      setPartRoof(selectedPart.roofType);
    }
    setRoadWidth(String(selectedRoad?.carriagewayWidth ?? ""));
    setLotGeometry(selectedLot ? JSON.stringify(selectedLot.geometry) : "");
    setGeometryError(null);
  };
  const undo = () => {
    const current =
      snapshot.mode !== "private-error" ? (snapshot.overrides ?? emptyDoc()) : emptyDoc();
    const previous = history.at(-1);
    if (!snapshot.loading && previous && worldDataProvider.applyOverrides(previous)) {
      setHistory((items) => items.slice(0, -1));
      setFuture((items) => [current, ...items]);
    }
  };
  const redo = () => {
    const current =
      snapshot.mode !== "private-error" ? (snapshot.overrides ?? emptyDoc()) : emptyDoc();
    const next = future[0];
    if (!snapshot.loading && next && worldDataProvider.applyOverrides(next)) {
      setFuture((items) => items.slice(1));
      setHistory((items) => [...items, current]);
    }
  };
  const status = snapshot.loading
    ? t.localPreview.statusLoading
    : snapshot.mode === "private-error"
      ? t.localPreview.statusError
      : synthetic
        ? t.localPreview.statusSynthetic
        : t.localPreview.statusPrivate;
  const statusClass =
    snapshot.mode === "private-error"
      ? "text-destructive"
      : synthetic
        ? "text-muted-foreground"
        : "text-primary";
  const field = (
    feature: Building | BuildingPart | RoadSegment | Lot | undefined,
    name: string,
  ) => {
    if (!feature) return t.localPreview.noValue;
    const p = provenance(feature, name);
    return `${p.source} · ${p.quality}`;
  };

  return (
    <section
      className={`private-world-panel pointer-events-auto absolute z-20 flex max-h-[calc(100dvh-8rem)] max-w-sm flex-col overflow-hidden rounded-xl border border-border bg-background/95 p-3.5 shadow-xl backdrop-blur ${collapsed ? "left-4 top-60 w-fit" : "bottom-20 right-4 w-[calc(100vw-2rem)] md:bottom-72 md:right-6"}`}
      aria-labelledby="private-world-preview-title"
      aria-busy={snapshot.loading}
      data-testid="private-world-panel"
      data-collapsed={collapsed}
    >
      <header className="flex shrink-0 items-center justify-between gap-3">
        <div>
          <h2 id="private-world-preview-title" className="text-sm font-semibold">
            {t.localPreview.title}
          </h2>
          <p className={`text-[10px] font-semibold tracking-wide ${statusClass}`}>{status}</p>
        </div>
        <button
          type="button"
          className="ctl min-h-11 min-w-11 shrink-0"
          aria-label={collapsed ? t.localPreview.expand : t.localPreview.collapse}
          aria-expanded={!collapsed}
          aria-controls="private-world-panel-content"
          onClick={() => setCollapsed((v) => !v)}
        >
          {collapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
        </button>
      </header>
      <div
        id="private-world-panel-content"
        className="flex min-h-0 flex-col overflow-y-auto overscroll-contain"
        hidden={collapsed}
      >
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t.localPreview.body}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-border p-2 text-[10px]">
          <div className="font-medium">{t.localPreview.toggleTemporaryLotIllustration}</div>
          <p className="sr-only">{t.localPreview.temporaryLotNote}</p>
          <button
            type="button"
            className="chip mt-1 min-h-11"
            data-testid="toggle-temporary-lot-illustration"
            aria-pressed={snapshot.temporaryLotIllustrationSelected}
            disabled={snapshot.mode !== "private" || snapshot.loading}
            onClick={() => worldDataProvider.toggleTemporaryLotIllustration()}
          >
            {snapshot.temporaryLotIllustrationSelected
              ? t.localPreview.hideTemporaryLotIllustration
              : t.localPreview.showTemporaryLotIllustration}
          </button>
        </div>
        {snapshot.mode === "private" && (
          <p className="mt-2 text-xs font-medium text-primary" role="status">
            {t.localPreview.loaded} ·{" "}
            {t.localPreview.counts
              .replace("{footprints}", String(footprintCount))
              .replace("{roads}", String(roads.length))
              .replace("{lots}", String(lots.length))}
            {" · "}
            {t.localPreview.source}: {snapshot.world.manifest.coverage.sourceCount} ·{" "}
            {t.localPreview.unknownHeight}:{" "}
            {
              buildings
                .flatMap((b) => (b.parts?.length ? b.parts : [b]))
                .filter((b) => assessWallHeight(b, synthetic).status === "unknown").length
            }
          </p>
        )}
        {snapshot.mode === "private-error" && (
          <p className="mt-2 text-xs font-medium text-destructive" role="alert">
            {t.localPreview.error} ({t.localPreview.errorCode}: {snapshot.errorCode})
          </p>
        )}
        {snapshot.mode !== "private-error" && snapshot.lastError && (
          <p
            data-testid="private-world-last-error"
            className="mt-2 text-xs font-medium text-destructive"
            role="alert"
          >
            {snapshot.lastError}
          </p>
        )}
        <div className="order-first mt-3 flex flex-wrap items-center gap-2">
          <label className="chip min-h-11 cursor-pointer gap-1.5 text-xs">
            <FileUp className="h-3.5 w-3.5" />
            <span>{t.localPreview.open}</span>
            <input
              className="sr-only"
              aria-label={t.localPreview.openInput}
              type="file"
              accept="application/json,.json"
              onChange={onInput}
            />
          </label>
          {snapshot.mode !== "fixture" && (
            <button
              type="button"
              className="chip min-h-11 gap-1.5 text-xs"
              onClick={() => {
                if (confirmDiscard(t.localPreview.confirmReset)) worldDataProvider.resetFixture();
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {t.localPreview.reset}
            </button>
          )}
          <button
            type="button"
            className="chip min-h-11 gap-1.5 text-xs"
            onClick={exportPackage}
            disabled={snapshot.mode !== "private" || snapshot.loading}
          >
            <Download className="h-3.5 w-3.5" />
            {t.localPreview.export}
          </button>
        </div>
        <section
          className="mt-3 border-t border-border pt-3"
          aria-labelledby="private-inspector-title"
        >
          <h3 id="private-inspector-title" className="text-xs font-semibold">
            {t.localPreview.inspector}
          </h3>
          <select
            className="mt-2 min-h-11 w-full rounded border border-border bg-background px-2 text-xs"
            aria-label={t.localPreview.buildingSelectLabel}
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              selectFeature(
                e.target.value ? { featureId: e.target.value, featureType: "building" } : null,
              );
            }}
          >
            <option value="">{t.localPreview.chooseFeature}</option>
            {buildings.map((b) => (
              <option key={b.localId} value={b.localId}>
                {b.localId} ·{" "}
                {assessWallHeight(b, synthetic).status === "unknown"
                  ? t.localPreview.heightUnknown
                  : `${assessWallHeight(b, synthetic).renderedHeight.toFixed(1)} m`}{" "}
                ·{" "}
                {
                  {
                    known: t.localPreview.heightKnown,
                    inferred: t.localPreview.heightInferred,
                    synthetic: t.localPreview.heightSynthetic,
                    unknown: t.localPreview.heightUnknown,
                  }[assessWallHeight(b, synthetic).status]
                }
              </option>
            ))}
          </select>
          {selected && (
            <div className="mt-2 rounded border border-border p-2 text-[11px]">
              <div className="font-medium">{t.localPreview.provenance}</div>
              <div>
                {t.localPreview.height}:{" "}
                {assessWallHeight(selected, synthetic).status === "unknown"
                  ? t.localPreview.unknownHeight
                  : `${assessWallHeight(selected, synthetic).renderedHeight.toFixed(1)} m`}
              </div>
              {assessWallHeight(selected, synthetic).status === "unknown" && (
                <p role="note">{t.localPreview.heightUnknownNote}</p>
              )}
              <div>
                {t.localPreview.source}: {field(selected, "wallHeight")}
              </div>
              <div>
                {t.localPreview.levelsProvenance}: {selected.levels ?? t.localPreview.noValue} ·{" "}
                {field(selected, "levels")}
              </div>
              <div>
                {t.localPreview.roofProvenance}: {selected.roofType} · {field(selected, "roofType")}
              </div>
              <div>
                {t.localPreview.geometry}: {field(selected, "geometry")}
              </div>
              <div>
                {t.localPreview.boundary}: {t.unmeasuredBoundary}
              </div>
              <div>
                {t.localPreview.center}:{" "}
                {snapshot.centerConfirmation?.status === "confirmed"
                  ? t.confirmedLocation
                  : snapshot.centerConfirmation?.status === "provisionally-accepted"
                    ? t.provisionallyAcceptedCenter
                    : t.referencePoint}
              </div>
            </div>
          )}
          {selectedPart && (
            <div className="mt-2 rounded border border-border p-2 text-[11px]">
              <p>
                {selectedPart.localId} · {t.localPreview.height}:{" "}
                {assessWallHeight(selectedPart, synthetic).status === "unknown"
                  ? t.localPreview.unknownHeight
                  : `${assessWallHeight(selectedPart, synthetic).renderedHeight} m`}{" "}
                · {field(selectedPart, "wallHeight")}
              </p>
              <p>
                {t.localPreview.levels}: {selectedPart.levels ?? t.localPreview.noValue} ·{" "}
                {field(selectedPart, "levels")}
              </p>
              <p>
                {t.localPreview.roof}: {selectedPart.roofType} · {field(selectedPart, "roofType")}
              </p>
            </div>
          )}
          {selectedRoad && (
            <div className="mt-2 rounded border border-border p-2 text-[11px]">
              <p>{selectedRoad.localId}</p>
              <p>
                {t.localPreview.width}: {selectedRoad.carriagewayWidth ?? t.localPreview.noValue} ·{" "}
                {field(selectedRoad, "carriagewayWidth")}
              </p>
              <p>
                {t.localPreview.geometry}: {field(selectedRoad, "geometry")}
              </p>
            </div>
          )}
          {selectedLot && (
            <div className="mt-2 rounded border border-border p-2 text-[11px]">
              <p>{selectedLot.localId}</p>
              <p>
                {t.localPreview.boundary}:{" "}
                {selectedLot.confirmed ? t.localPreview.sourceOnly : t.unmeasuredBoundary} ·{" "}
                {field(selectedLot, "geometry")}
              </p>
            </div>
          )}
        </section>
        <section className="mt-3 border-t border-border pt-3">
          <button
            type="button"
            className="flex min-h-11 w-full items-center justify-between text-left text-xs font-semibold"
            aria-expanded={advanced}
            onClick={() => setAdvanced((v) => !v)}
          >
            <span>{t.localPreview.advanced}</span>
            {advanced ? <ChevronUp /> : <ChevronDown />}
          </button>
          <p className="text-[10px] text-muted-foreground">{t.localPreview.advancedHint}</p>
          {advanced && (
            <div className="mt-2 flex flex-col gap-2 text-xs">
              {selected && (
                <div className="rounded bg-muted/40 p-2">
                  {selected.parts?.length ? (
                    <>
                      <label className="flex items-center justify-between">
                        {t.localPreview.height}
                        <input
                          aria-label={t.localPreview.height}
                          className="min-h-11 w-24 rounded border border-border bg-background px-2"
                          type="number"
                          value={height}
                          disabled
                        />
                      </label>
                      <p className="mb-2 text-[10px] text-muted-foreground">
                        {t.localPreview.partsParentNote}
                      </p>
                      <select
                        className="min-h-11 w-full rounded border border-border bg-background px-2"
                        aria-label={t.localPreview.partSelectLabel}
                        value={selectedPartId}
                        onChange={(e) => {
                          setSelectedPartId(e.target.value);
                          selectFeature(
                            e.target.value
                              ? {
                                  featureId: e.target.value,
                                  featureType: "building-part",
                                  parentFeatureId: selected.localId,
                                }
                              : { featureId: selected.localId, featureType: "building" },
                          );
                        }}
                      >
                        <option value="">{t.localPreview.partSelectPlaceholder}</option>
                        {selected.parts.map((p) => (
                          <option key={p.localId} value={p.localId}>
                            {p.localId}
                          </option>
                        ))}
                      </select>
                      {selectedPart && (
                        <EditorFields
                          height={partHeight}
                          setHeight={setPartHeight}
                          levels={partLevels}
                          setLevels={setPartLevels}
                          roof={partRoof}
                          setRoof={setPartRoof}
                          t={t}
                          prefix="part"
                          onSave={savePart}
                          disabled={editingDisabled}
                          canSave={partCanSave}
                        />
                      )}
                    </>
                  ) : (
                    <EditorFields
                      height={height}
                      setHeight={setHeight}
                      levels={levels}
                      setLevels={setLevels}
                      roof={roof}
                      setRoof={setRoof}
                      t={t}
                      prefix=""
                      onSave={saveBuilding}
                      disabled={editingDisabled}
                      canSave={buildingCanSave}
                    />
                  )}
                </div>
              )}
              <select
                className="min-h-11 rounded border border-border bg-background px-2"
                aria-label={t.localPreview.roadSelectLabel}
                value={selectedRoadId}
                onChange={(e) => {
                  setSelectedRoadId(e.target.value);
                  selectFeature(
                    e.target.value ? { featureId: e.target.value, featureType: "road" } : null,
                  );
                }}
              >
                <option value="">{t.localPreview.width}</option>
                {roads.map((r) => (
                  <option key={r.localId} value={r.localId}>
                    {r.localId} · {r.carriagewayWidth ?? t.localPreview.noValue}m
                  </option>
                ))}
              </select>
              {selectedRoad && (
                <label className="flex items-center justify-between">
                  {t.localPreview.width}
                  <input
                    aria-label={t.localPreview.width}
                    className="min-h-11 w-24 rounded border border-border bg-background px-2"
                    type="number"
                    value={roadWidth}
                    onChange={(e) => setRoadWidth(e.target.value)}
                  />
                </label>
              )}{" "}
              {selectedRoad && (
                <button
                  type="button"
                  className="chip min-h-11"
                  onClick={saveRoad}
                  disabled={editingDisabled || !roadCanSave}
                >
                  {t.localPreview.saveRoad}
                </button>
              )}
              {selected && !selected.parts?.length && (
                <>
                  <label>
                    {t.localPreview.geometry}
                    <textarea
                      className="h-20 w-full rounded border border-border bg-background p-2 font-mono text-[10px]"
                      aria-label={t.localPreview.geometry}
                      value={geometry}
                      onChange={(e) => setGeometry(e.target.value)}
                    />
                  </label>
                  <button type="button" className="chip min-h-11" onClick={saveGeometry}>
                    <Save className="h-3 w-3" />
                    {t.localPreview.saveGeometry}
                  </button>
                  {geometryError && (
                    <p role="alert" className="text-destructive">
                      {geometryError}
                    </p>
                  )}
                </>
              )}
              <select
                className="min-h-11 rounded border border-border bg-background px-2"
                aria-label={t.localPreview.lotSelectLabel}
                value={selectedLotId}
                onChange={(e) => {
                  setSelectedLotId(e.target.value);
                  selectFeature(
                    e.target.value ? { featureId: e.target.value, featureType: "lot" } : null,
                  );
                }}
              >
                <option value="">{t.localPreview.noSelection}</option>
                {lots.map((lot) => (
                  <option key={lot.localId} value={lot.localId}>
                    {lot.localId}
                  </option>
                ))}
              </select>
              {selectedLot && (
                <>
                  <label>
                    {t.localPreview.lotGeometry}
                    <textarea
                      className="h-20 w-full rounded border border-border bg-background p-2 font-mono text-[10px]"
                      aria-label={t.localPreview.lotGeometry}
                      value={lotGeometry}
                      onChange={(e) => setLotGeometry(e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="chip min-h-11"
                    onClick={saveLotGeometry}
                    disabled={editingDisabled}
                  >
                    <Save className="h-3 w-3" />
                    {t.localPreview.saveGeometry}
                  </button>
                </>
              )}
              {(history.length > 0 || future.length > 0) && (
                <div className="flex gap-2">
                  {history.length > 0 && (
                    <button
                      type="button"
                      className="chip min-h-11"
                      onClick={undo}
                      disabled={editingDisabled}
                    >
                      <Undo2 className="h-3 w-3" />
                      {t.localPreview.undo}
                    </button>
                  )}
                  {future.length > 0 && (
                    <button
                      type="button"
                      className="chip min-h-11"
                      onClick={redo}
                      disabled={editingDisabled}
                    >
                      <Redo2 className="h-3 w-3" />
                      {t.localPreview.redo}
                    </button>
                  )}
                </div>
              )}
              <button
                type="button"
                className="chip min-h-11"
                onClick={resetDraft}
                disabled={editingDisabled}
              >
                {t.localPreview.resetDraft}
              </button>
              <button
                type="button"
                className="chip min-h-11"
                onClick={exportOverrides}
                disabled={snapshot.mode !== "private" || snapshot.loading}
              >
                {t.localPreview.exportOverrides}
              </button>
              <div className="text-[10px] text-muted-foreground">
                {t.localPreview.legend}: ● {t.localPreview.heightKnown} · △{" "}
                {t.localPreview.inferred} · □ {t.localPreview.unknown} · ◇{" "}
                {t.localPreview.heightSynthetic}
              </div>
              <label className="flex min-h-11 items-center justify-between gap-2 text-[10px]">
                <span>
                  {confidenceVisible ? t.localPreview.confidenceOn : t.localPreview.confidenceOff}
                </span>
                <input
                  type="checkbox"
                  aria-label={t.localPreview.confidenceToggle}
                  checked={confidenceVisible}
                  onChange={(event) => setConfidenceVisible(event.target.checked)}
                />
              </label>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function EditorFields({
  height,
  setHeight,
  levels,
  setLevels,
  roof,
  setRoof,
  t,
  prefix,
  onSave,
  disabled = false,
  canSave = true,
}: {
  height: NumericDraft;
  setHeight: (v: string) => void;
  levels: NumericDraft;
  setLevels: (v: string) => void;
  roof: RoofType;
  setRoof: (v: RoofType) => void;
  t: ReturnType<typeof useT>;
  prefix: string;
  onSave: () => void;
  disabled?: boolean;
  canSave?: boolean;
}) {
  const invalidHeight =
    height !== "" &&
    !["valid", "zero"].includes(classifyNumericDraft(height, { min: 0, max: 1000 }));
  const invalidLevels =
    levels !== "" &&
    !["valid", "zero"].includes(classifyNumericDraft(levels, { min: 0, max: 200, integer: true }));
  const heightLabel = prefix
    ? t.localPreview.partHeightLabel.replace(":", "")
    : t.localPreview.height;
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <label className="flex items-center justify-between">
        {heightLabel}
        <input
          className="min-h-11 w-24 rounded border border-border bg-background px-2"
          type="number"
          min={0}
          max={1000}
          step="any"
          aria-invalid={invalidHeight}
          value={height}
          disabled={disabled}
          onChange={(e) => setHeight(e.target.value)}
        />
      </label>
      <label className="flex items-center justify-between">
        {t.localPreview.levels}
        <input
          className="min-h-11 w-24 rounded border border-border bg-background px-2"
          type="number"
          min={0}
          max={200}
          step={1}
          aria-invalid={invalidLevels}
          value={levels}
          disabled={disabled}
          onChange={(e) => setLevels(e.target.value)}
        />
      </label>
      <label className="flex items-center justify-between">
        {t.localPreview.roof}
        <select
          className="min-h-11 rounded border border-border bg-background px-2"
          value={roof}
          disabled={disabled}
          onChange={(e) => setRoof(e.target.value as RoofType)}
        >
          <option value="unknown">{t.localPreview.unknown}</option>
          <option value="flat">{t.localPreview.partRoofTypes.flat}</option>
          <option value="terrace_tum">{t.localPreview.partRoofTypes.terrace_tum}</option>
          <option value="gabled">{t.localPreview.partRoofTypes.gabled}</option>
          <option value="hipped">{t.localPreview.partRoofTypes.hipped}</option>
          <option value="corrugated">{t.localPreview.partRoofTypes.corrugated}</option>
        </select>
      </label>
      {(invalidHeight || invalidLevels) && (
        <p role="alert" className="text-destructive">
          {t.localPreview.invalidNumber}
        </p>
      )}
      <button
        type="button"
        className="chip min-h-11 justify-center"
        onClick={onSave}
        disabled={disabled || !canSave}
      >
        <Save className="h-3 w-3" />
        {prefix ? t.localPreview.savePart : t.localPreview.save}
      </button>
    </div>
  );
}
