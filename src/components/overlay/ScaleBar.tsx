import { useEffect, useMemo, useState } from "react";
import { Tag, Trees } from "lucide-react";
import { calculatePlanScaleBar } from "@/engine/view/planCamera";
import { useT } from "@/i18n";
import { useAppStore } from "@/state/appStore";

export function ScaleBar() {
  const t = useT();
  const { viewMode, planMeasurement, showTrees, toggleTrees, showLabels, toggleLabels } =
    useAppStore();
  const [targetWidth, setTargetWidth] = useState(120);

  useEffect(() => {
    const update = () => setTargetWidth(window.innerWidth < 480 ? 92 : 120);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const scale = useMemo(
    () =>
      planMeasurement
        ? calculatePlanScaleBar(planMeasurement.metresPerCssPixel, targetWidth)
        : null,
    [planMeasurement, targetWidth],
  );

  if (viewMode !== "topdown") return null;

  return (
    <div
      data-testid="plan-scale-bar"
      className="plan-scale-bar pointer-events-auto fixed bottom-28 left-4 z-10 flex flex-col gap-2 sm:bottom-6 sm:left-6"
    >
      <div className="glass flex items-center gap-1 p-1">
        <button
          type="button"
          onClick={toggleTrees}
          aria-pressed={showTrees}
          title={t.toggleTrees}
          className={`ctl text-xs ${showTrees ? "bg-secondary font-medium text-primary" : "text-muted-foreground"}`}
        >
          <Trees className="h-4 w-4" />
          <span className="hidden sm:inline">{t.layers.trees}</span>
        </button>
        <button
          type="button"
          onClick={toggleLabels}
          aria-pressed={showLabels}
          title={t.toggleLabels}
          className={`ctl text-xs ${showLabels ? "bg-secondary font-medium text-primary" : "text-muted-foreground"}`}
        >
          <Tag className="h-4 w-4" />
          <span className="hidden sm:inline">{t.layers.labels}</span>
        </button>
      </div>

      <div className="glass flex min-w-32 flex-col items-center gap-1 px-3 py-1.5 font-mono text-[11px] text-foreground">
        {scale ? (
          <>
            <div className="flex w-full items-center justify-between text-muted-foreground">
              <span>0</span>
              <span>{scale.metres} m</span>
            </div>
            <div
              data-testid="plan-scale-ruler"
              className="h-1.5 border-x border-b border-foreground bg-primary/20"
              style={{ width: `${scale.cssPixels}px` }}
            />
          </>
        ) : (
          <span data-testid="plan-scale-pending" className="text-muted-foreground">
            {t.scalePending}
          </span>
        )}
        <div className="flex items-center gap-1 font-sans text-[10px] font-medium text-accent">
          <span>{t.northUp}</span>
          <span className="text-muted-foreground">·</span>
          <span>{t.scaleBar}</span>
        </div>
      </div>
    </div>
  );
}
