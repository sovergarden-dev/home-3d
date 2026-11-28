import { createFileRoute } from "@tanstack/react-router";
import { SITE_CONFIG } from "@/config/site";
import { useEffect, useLayoutEffect, useRef } from "react";
import { SceneViewport } from "@/components/overlay/SceneViewport";
import { TopInfo } from "@/components/overlay/TopInfo";
import { TopActions } from "@/components/overlay/TopActions";
import { MapControls } from "@/components/overlay/MapControls";
import { PovControls } from "@/components/overlay/LifeControls";
import { SceneExtras } from "@/components/overlay/SceneExtras";
import { ScaleBar } from "@/components/overlay/ScaleBar";
import { Dock } from "@/components/overlay/Dock";
import { Splash } from "@/components/overlay/Splash";
import { useClock } from "@/components/overlay/useClock";
import { useSceneShortcuts } from "@/components/overlay/useSceneShortcuts";
import { useAppStore } from "@/state/appStore";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${SITE_CONFIG.homeLabel.vi} — ${SITE_CONFIG.name}` },
      {
        name: "description",
        content: `${SITE_CONFIG.name}: sa bàn 3D khu phố quanh nhà, đổi buổi trong ngày và thời tiết.`,
      },
      { property: "og:title", content: `${SITE_CONFIG.homeLabel.vi} — ${SITE_CONFIG.name}` },
      { property: "og:description", content: `${SITE_CONFIG.name}, một chút thôi.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  useClock();
  useSceneShortcuts();
  const lang = useAppStore((s) => s.language);
  const viewMode = useAppStore((s) => s.viewMode);
  const sceneStatus = useAppStore((s) => s.sceneStatus);
  // While the splash covers startup, keyboard focus must not reach the controls behind it either.
  const startingUp = useAppStore((s) => s.loadingProgress < 1);
  const mainRef = useRef<HTMLElement>(null);
  const lastFocusedRef = useRef<{ element: HTMLElement; inSceneRoot: boolean } | null>(null);
  const pendingRestoreRef = useRef<{ element: HTMLElement; inSceneRoot: boolean } | null>(null);
  const wasStartingUpRef = useRef(startingUp);

  useLayoutEffect(() => {
    if (!wasStartingUpRef.current && startingUp) {
      if (
        mainRef.current &&
        document.activeElement instanceof HTMLElement &&
        mainRef.current.contains(document.activeElement)
      ) {
        lastFocusedRef.current = {
          element: document.activeElement,
          inSceneRoot: Boolean(document.activeElement.closest("#scene-root")),
        };
        document.activeElement.blur();
      }
      pendingRestoreRef.current = lastFocusedRef.current;
    }
    wasStartingUpRef.current = startingUp;
  }, [startingUp]);

  useEffect(() => {
    if (startingUp || sceneStatus === "loading" || !pendingRestoreRef.current) return;
    if (sceneStatus === "fallback" && mainRef.current?.querySelector("#scene-root button:disabled"))
      return;
    const saved = pendingRestoreRef.current;
    pendingRestoreRef.current = null;
    if (
      document.activeElement &&
      document.activeElement !== document.body &&
      document.activeElement !== document.documentElement
    )
      return;
    if (saved.element.isConnected && !(saved.element as HTMLButtonElement).disabled) {
      saved.element.focus();
      return;
    }
    if (saved.inSceneRoot && mainRef.current) {
      const replacement = mainRef.current.querySelector<HTMLElement>(
        sceneStatus === "fallback" ? "#scene-root button:not(:disabled)" : "#scene-root canvas",
      );
      replacement?.focus();
    }
  }, [startingUp, sceneStatus]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title =
      lang === "vi"
        ? `${SITE_CONFIG.homeLabel.vi} — ${SITE_CONFIG.name}`
        : `${SITE_CONFIG.homeLabel.en} — ${SITE_CONFIG.name}`;
  }, [lang]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <>
      <main
        ref={mainRef}
        className="fixed inset-0 overflow-hidden overscroll-none"
        data-view-mode={viewMode}
        inert={startingUp}
        onFocusCapture={(event) => {
          if (!startingUp && event.target instanceof HTMLElement) {
            lastFocusedRef.current = {
              element: event.target,
              inSceneRoot: Boolean(event.target.closest("#scene-root")),
            };
          }
        }}
        onBlurCapture={(event) => {
          if (startingUp || mainRef.current?.inert) return;
          if (event.relatedTarget instanceof Node && mainRef.current?.contains(event.relatedTarget))
            return;
          const target = event.target;
          if (
            target instanceof HTMLElement &&
            (!target.isConnected || (target as HTMLButtonElement).disabled)
          )
            return;
          lastFocusedRef.current = null;
        }}
      >
        <SceneViewport />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            paddingTop: "max(1rem, env(safe-area-inset-top))",
            paddingLeft: "max(1rem, env(safe-area-inset-left))",
            paddingRight: "max(1rem, env(safe-area-inset-right))",
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <TopInfo />
            <TopActions />
          </div>

          <ScaleBar />
          <PovControls worldSource="home" />

          {/* Right vertical camera controls (Diorama, Mặt bằng, Đi bộ, Ngồi sau xe ôm, zoom, reset, compass) */}
          <div className="h6-map-controls-anchor absolute right-[max(1rem,env(safe-area-inset-right))] top-1/2 z-30 -translate-y-1/2">
            <MapControls />
          </div>

          {/* Centered floating dock at the bottom */}
          <div className="h6-dock-anchor pointer-events-none fixed inset-x-0 bottom-4 z-20 flex items-end justify-center gap-1.5 px-4">
            <Dock />
            <SceneExtras />
          </div>
        </div>
      </main>
      {/* Outside the inert shell, so assistive technology still announces the progress. */}
      <Splash />
    </>
  );
}
