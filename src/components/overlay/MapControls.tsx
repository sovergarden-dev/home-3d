import {
  Compass,
  Footprints,
  Box,
  Building2,
  Minus,
  Plus,
  LocateFixed,
  Map as MapIcon,
} from "lucide-react";
import { useAppStore, type ViewMode } from "@/state/appStore";
import { useT } from "@/i18n";

const modes: { id: ViewMode; Icon: typeof Box }[] = [
  { id: "diorama", Icon: Box },
  { id: "topdown", Icon: MapIcon },
  { id: "walk", Icon: Footprints },
];

export function MapControls() {
  const t = useT();
  const ready = useAppStore((s) => s.sceneStatus === "ready");
  const { zoomIn, zoomOut, resetView, heading, setHeading, viewMode, setViewMode } = useAppStore();
  const btn = "ctl text-foreground hover:bg-secondary";

  return (
    <div className="pointer-events-auto flex flex-col gap-2">
      <div className="glass flex flex-col p-1">
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
      <div role="radiogroup" aria-label={t.viewModeLabel} className="glass flex flex-col p-1">
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
        <button
          type="button"
          disabled
          aria-label={t.viewMode.real}
          title={t.demoOnly}
          className={`${btn} opacity-40`}
        >
          <Building2 className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
