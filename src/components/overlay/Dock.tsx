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

  const onTabKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    const n = (i + d + tabs.length) % tabs.length;
    setActive(tabs[n]!.id);
    tabRefs.current[n]?.focus();
  };

  const tabBar = (
    <div
      role="tablist"
      aria-label={t.dockLabel}
      className="no-scrollbar flex gap-1 overflow-x-auto"
    >
      {tabs.map(({ id, Icon }, i) => (
        <button
          key={id}
          ref={(el) => {
            tabRefs.current[i] = el;
          }}
          type="button"
          role="tab"
          id={`tab-${id}`}
          aria-selected={active === id}
          aria-controls={`panel-${id}`}
          tabIndex={active === id ? 0 : -1}
          onKeyDown={(e) => onTabKey(e, i)}
          onClick={() => {
            setActive(id);
            if (mobile && snap === "peek") setSnap("half");
          }}
          className="ctl flex-1 flex-col gap-0.5 px-3 py-1 text-xs text-muted-foreground hover:text-foreground aria-selected:bg-secondary aria-selected:text-primary sm:flex-row sm:gap-2 sm:text-sm"
        >
          <Icon className="h-4 w-4 shrink-0" />
          <span className="whitespace-nowrap">{t.tabs[id]}</span>
        </button>
      ))}
    </div>
  );

  const panel = tabs.map(({ id, Panel }) => {
    const visible = active === id && (!mobile || snap !== "peek");
    return (
      <div
        key={id}
        role="tabpanel"
        id={`panel-${id}`}
        aria-labelledby={`tab-${id}`}
        hidden={!visible}
        className="animate-in fade-in duration-200"
      >
        {visible && <Panel />}
      </div>
    );
  });

  if (!mobile) {
    return (
      <div className="pointer-events-auto glass w-full max-w-[680px] p-3">
        <div
          className={`mb-3 overflow-y-auto overscroll-contain ${
            active === "memories" ? "max-h-[58dvh]" : "max-h-[min(30dvh,176px)]"
          }`}
        >
          {panel}
        </div>
        {tabBar}
      </div>
    );
  }

  const order: Snap[] = ["peek", "half", "full"];
  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = { y: e.clientY, h: sheetRef.current!.getBoundingClientRect().height };
    e.currentTarget.setPointerCapture(e.pointerId);
    (e.currentTarget as HTMLButtonElement).focus({ preventScroll: true });
    sheetRef.current!.style.transition = "none";
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const height = Math.max(
      80,
      Math.min(window.innerHeight * 0.9, drag.current.h + drag.current.y - e.clientY),
    );
    sheetRef.current!.style.height = `${height}px`;
    onExpandedChange?.(height > 100);
  };
  const finishDrag = (next: Snap) => {
    drag.current = null;
    const element = sheetRef.current!;
    element.style.transition = "";
    element.style.height = snapHeights[next];
    setSnap(next);
    onExpandedChange?.(next !== "peek");
  };
  const cancelDrag = () => {
    if (drag.current) finishDrag(snap);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dy = drag.current.y - e.clientY;
    const height = drag.current.h + dy;
    const next =
      Math.abs(dy) < 6
        ? order[(order.indexOf(snap) + 1) % 3]!
        : height > window.innerHeight * 0.67
          ? "full"
          : height > window.innerHeight * 0.3
            ? "half"
            : "peek";
    finishDrag(next);
  };

  return (
    <div
      ref={sheetRef}
      className={`pointer-events-auto glass fixed inset-x-0 bottom-0 ${snap === "peek" ? "z-20" : "z-50"} flex flex-col !rounded-b-none transition-[height] duration-250 ease-[var(--ease)] motion-reduce:transition-none`}
      style={{ height: snapHeights[snap], paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <button
        type="button"
        aria-label={t.sheetHandle}
        aria-expanded={snap !== "peek"}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={cancelDrag}
        onLostPointerCapture={cancelDrag}
        onKeyDown={(e) => {
          if (["ArrowUp", "ArrowDown", "Enter", " "].includes(e.key)) e.preventDefault();
          if (e.key === "Enter" || e.key === " ") setSnap(order[(order.indexOf(snap) + 1) % 3]!);
          if (e.key === "ArrowUp") setSnap(order[Math.min(2, order.indexOf(snap) + 1)]!);
          if (e.key === "ArrowDown") setSnap(order[Math.max(0, order.indexOf(snap) - 1)]!);
        }}
        className="flex h-6 w-full shrink-0 touch-none items-center justify-center"
      >
        <span className="h-1.5 w-10 rounded-full bg-border" />
      </button>
      <div className="px-3">{tabBar}</div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3 pt-3">
        {panel}
      </div>
    </div>
  );
}

export const SHEET_PEEK = snapHeights.peek;
