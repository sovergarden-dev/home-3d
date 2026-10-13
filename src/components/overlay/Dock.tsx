import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Clock, CloudSun, Lamp, Heart } from "lucide-react";
import { useT } from "@/i18n";
import { FestivalPanel, MemoriesPanel, TimePanel, WeatherPanel } from "./DockPanels";

const tabs = [
  { id: "time", Icon: Clock, Panel: TimePanel },
  { id: "weather", Icon: CloudSun, Panel: WeatherPanel },
  { id: "festival", Icon: Lamp, Panel: FestivalPanel },
  { id: "memories", Icon: Heart, Panel: MemoriesPanel },
] as const;
type TabId = (typeof tabs)[number]["id"];

type Snap = "peek" | "half" | "full";
const snapHeights: Record<Snap, string> = { peek: "96px", half: "48dvh", full: "86dvh" };

interface DockProps {
  mobile: boolean;
  /** Mobile only: true while the bottom sheet is above its peek height and would cover the map controls. */
  onExpandedChange?: (expanded: boolean) => void;
}

export function Dock({ mobile, onExpandedChange }: DockProps) {
  const t = useT();
  const [active, setActive] = useState<TabId>("time");
  const [snap, setSnap] = useState<Snap>("peek");
  useEffect(() => {
    onExpandedChange?.(mobile && snap !== "peek");
  }, [mobile, snap, onExpandedChange]);
  const drag = useRef<{ y: number; h: number } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const Panel = tabs.find((x) => x.id === active)!.Panel;

  const onTabKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    const n = (i + d + tabs.length) % tabs.length;
    setActive(tabs[n]!.id);
    tabRefs.current[n]?.focus();
  };

  const tabBar = (
    <div role="tablist" aria-label="Dock" className="no-scrollbar flex gap-1 overflow-x-auto">
      {tabs.map(({ id, Icon }, i) => (
        <button
          key={id}
          ref={(el) => { tabRefs.current[i] = el; }}
          type="button" role="tab" id={`tab-${id}`}
          aria-selected={active === id} aria-controls={`panel-${id}`}
          tabIndex={active === id ? 0 : -1}
          onKeyDown={(e) => onTabKey(e, i)}
          onClick={() => { setActive(id); if (mobile && snap === "peek") setSnap("half"); }}
          className="ctl flex-1 flex-col gap-0.5 px-3 py-1 text-xs text-muted-foreground hover:text-foreground aria-selected:bg-secondary aria-selected:text-primary sm:flex-row sm:gap-2 sm:text-sm"
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="whitespace-nowrap">{t.tabs[id]}</span>
        </button>
      ))}
    </div>
  );

  const panel = (
    <div role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`} className="animate-in fade-in duration-200">
      <Panel />
    </div>
  );

  if (!mobile) {
    return (
      <div className="pointer-events-auto glass w-[min(680px,calc(100vw-2rem))] p-3">
        <div className="mb-3">{panel}</div>
        {tabBar}
      </div>
    );
  }

  const order: Snap[] = ["peek", "half", "full"];
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { y: e.clientY, h: sheetRef.current!.getBoundingClientRect().height };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    sheetRef.current!.style.transition = "none";
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    sheetRef.current!.style.height = `${Math.max(80, drag.current.h + drag.current.y - e.clientY)}px`;
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dy = drag.current.y - e.clientY;
    const h = drag.current.h + dy;
    drag.current = null;
    const el = sheetRef.current!;
    el.style.transition = "";
    el.style.height = "";
    const vh = window.innerHeight;
    if (Math.abs(dy) < 6) { setSnap(order[(order.indexOf(snap) + 1) % 3]!); return; }
    setSnap(h > vh * 0.67 ? "full" : h > vh * 0.3 ? "half" : "peek");
  };

  return (
    <div
      ref={sheetRef}
      className="pointer-events-auto glass fixed inset-x-0 bottom-0 z-20 flex flex-col !rounded-b-none transition-[height] duration-250 ease-[var(--ease)]"
      style={{ height: snapHeights[snap], paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <button
        type="button"
        aria-label={t.sheetHandle}
        aria-expanded={snap !== "peek"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") setSnap(order[Math.min(2, order.indexOf(snap) + 1)]!);
          if (e.key === "ArrowDown") setSnap(order[Math.max(0, order.indexOf(snap) - 1)]!);
        }}
        className="flex h-6 w-full shrink-0 touch-none items-center justify-center"
      >
        <span className="h-1.5 w-10 rounded-full bg-border" />
      </button>
      <div className="px-3">{tabBar}</div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-3">{snap !== "peek" && panel}</div>
    </div>
  );
}

export const SHEET_PEEK = snapHeights.peek;
