import {
  Activity,
  Bike,
  Box,
  Compass,
  Footprints,
  Layers,
  LocateFixed,
  Map as MapIcon,
  Minus,
  Plus,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useAppStore, type ViewMode } from "@/state/appStore";
import type { DetailTier } from "@/world/enrichment/schema";
import { useT } from "@/i18n";
import { sendLifeCommand } from "@/engine/life/session";
import { RealStreetControl } from "./RealStreetControl";

const modes: { id: ViewMode; Icon: typeof Box }[] = [
  { id: "diorama", Icon: Box },
  { id: "topdown", Icon: MapIcon },
  { id: "walk", Icon: Footprints },
  { id: "ride", Icon: Bike },
];

export function MapControls() {
  const t = useT();
  const ready = useAppStore((s) => s.sceneStatus === "ready");
  const {
    zoomIn,
    zoomOut,
    resetView,
    heading,
    setHeading,
    viewMode,
    setViewMode,
    lifeEnabled,
    setLifeEnabled,
    detailTier,
    cycleDetailTier,
    soundOn,
    toggleSound,
  } = useAppStore();
  const btn = "ctl text-foreground hover:bg-secondary";
  const densityLabel = t.life.densityCycle.replace("{tier}", t.life.tiers[detailTier]);
  const handleCycleDensity = () => {
    const attr = document.querySelector<HTMLElement>('[data-testid="demo-scene"]')?.dataset[
      "detailTier"
    ];
    const effective: DetailTier =
      attr === "low" || attr === "mid" || attr === "high"
        ? attr
        : window.innerWidth < 768
          ? "low"
          : "mid";
    cycleDetailTier(effective);
  };

  return (
    <div className="h6-map-controls pointer-events-auto flex flex-col gap-2">
      <div className="h6-camera-actions glass flex flex-col p-1">
        <button
          type="button"
          disabled={!ready}
          aria-label={t.zoomIn}
          title={t.zoomIn}
          onClick={zoomIn}
          className={btn}
        >
          <Plus className="h-5 w-5" />
        </button>
        <button
          type="button"
          disabled={!ready}
          aria-label={t.zoomOut}
          title={t.zoomOut}
          onClick={zoomOut}
          className={btn}
        >
          <Minus className="h-5 w-5" />
        </button>
        <button
          type="button"
          disabled={!ready}
          aria-label={t.reset}
          title={t.reset}
          onClick={resetView}
          className={btn}
        >
          <LocateFixed className="h-5 w-5" />
        </button>
        <button
          type="button"
          disabled={!ready || viewMode === "topdown"}
          aria-label={t.compass}
          title={viewMode === "topdown" ? t.northUp : t.compass}
          onClick={() => setHeading(0)}
          className={btn}
        >
          <Compass
            className="h-5 w-5 text-accent transition-transform duration-200"
            style={{ transform: `rotate(${-heading}deg)` }}
          />
        </button>
      </div>
      <div
        role="radiogroup"
        aria-label={t.viewModeLabel}
        className="h6-view-actions glass flex flex-col p-1"
      >
        {modes.map(({ id, Icon }) => (
          <button
            key={id}
            type="button"
            disabled={!ready}
            role="radio"
            aria-checked={viewMode === id}
            aria-label={t.viewMode[id]}
            title={t.viewMode[id]}
            onClick={() => setViewMode(id)}
            className={`${btn} aria-checked:bg-primary aria-checked:text-primary-foreground`}
          >
            <Icon className="h-5 w-5" />
          </button>
        ))}
      </div>
      <div className="h6-life-actions glass flex flex-col p-1">
        <button
          type="button"
          data-testid="life-quick-toggle"
          disabled={!ready}
          aria-pressed={lifeEnabled}
          aria-label={t.life.quickToggle}
          title={t.life.quickToggle}
          onClick={() => setLifeEnabled(!lifeEnabled)}
          className={`${btn} aria-pressed:bg-primary aria-pressed:text-primary-foreground`}
        >
          <Activity className="h-5 w-5" />
        </button>
        <button
          type="button"
          data-testid="density-tier-cycle"
          data-detail-tier={detailTier}
          disabled={!ready}
          aria-label={densityLabel}
          title={densityLabel}
          onClick={handleCycleDensity}
          className={detailTier === "high" ? "ctl bg-primary text-primary-foreground" : btn}
        >
          <Layers className="h-5 w-5" />
        </button>
        <RealStreetControl worldSource="home" />
        <button
          type="button"
          data-testid="sound-toggle"
          disabled={!ready}
          aria-pressed={soundOn}
          aria-label={t.sound}
          title={`${t.sound} (${t.soundDemo})`}
          onClick={() => {
            sendLifeCommand({ kind: "soundGesture" });
            toggleSound();
          }}
          className={`${btn} aria-pressed:bg-primary aria-pressed:text-primary-foreground`}
        >
          {soundOn ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}
