import { useAppStore } from "@/state/appStore";
import { useT } from "@/i18n";
import { Trees, Tag } from "lucide-react";

/**
 * Metric scale bar and layer toggles for the top-down plan view (Bước 4).
 * Calculates real-world ground distance based on current zoom level.
 */
export function ScaleBar() {
  const t = useT();
  const { viewMode, zoom, showTrees, toggleTrees, showLabels, toggleLabels } = useAppStore();

  if (viewMode !== "topdown") return null;

  // Ground distance represented by a 100px bar at zoom level 1 is ~40m.
  // When zoom changes, ground distance scales inversely.
  const rawMeters = 40 / zoom;
  // Pick a clean round number for the scale bar: 10, 20, 50, 100, 200
  let displayMeters = 20;
  if (rawMeters > 120) displayMeters = 100;
  else if (rawMeters > 60) displayMeters = 50;
  else if (rawMeters > 30) displayMeters = 20;
  else displayMeters = 10;

  // Bar pixel width based on displayMeters
  const barWidthPx = Math.round((displayMeters / rawMeters) * 100);

  return (
    <div
      data-testid="plan-scale-bar"
      className="pointer-events-auto fixed bottom-28 left-4 z-10 flex flex-col gap-2 sm:bottom-6 sm:left-6"
    >
      {/* Layer Toggles */}
      <div className="glass flex items-center gap-1 p-1">
        <button
          type="button"
          onClick={toggleTrees}
          aria-pressed={showTrees}
          title={t.toggleTrees}
          className={`ctl text-xs ${showTrees ? "bg-secondary text-primary font-medium" : "text-muted-foreground"}`}
        >
          <Trees className="h-4 w-4" />
          <span className="hidden sm:inline">Cây xanh</span>
        </button>
        <button
          type="button"
          onClick={toggleLabels}
          aria-pressed={showLabels}
          title={t.toggleLabels}
          className={`ctl text-xs ${showLabels ? "bg-secondary text-primary font-medium" : "text-muted-foreground"}`}
        >
          <Tag className="h-4 w-4" />
          <span className="hidden sm:inline">Nhãn</span>
        </button>
      </div>

      {/* Metric Scale Ruler */}
      <div className="glass flex flex-col items-center gap-1 px-3 py-1.5 text-[11px] text-foreground font-mono">
        <div className="flex items-center justify-between w-full text-muted-foreground">
          <span>0</span>
          <span>{displayMeters}m</span>
        </div>
        <div
          className="h-1.5 border-x border-b border-foreground bg-primary/20"
          style={{ width: `${Math.max(40, Math.min(180, barWidthPx))}px` }}
        />
        <div className="text-[10px] text-accent font-sans font-medium flex items-center gap-1">
          <span>Bắc ↑</span>
          <span className="text-muted-foreground">·</span>
          <span>Thước mét</span>
        </div>
      </div>
    </div>
  );
}
