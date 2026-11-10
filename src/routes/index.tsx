import { createFileRoute } from "@tanstack/react-router";
import { SITE_CONFIG } from "@/config/site";
import { useEffect } from "react";
import { SceneViewport } from "@/components/overlay/SceneViewport";
import { TopInfo } from "@/components/overlay/TopInfo";
import { TopActions } from "@/components/overlay/TopActions";
import { MapControls } from "@/components/overlay/MapControls";
import { ScaleBar } from "@/components/overlay/ScaleBar";
import { Dock } from "@/components/overlay/Dock";
import { Splash } from "@/components/overlay/Splash";
import { useClock } from "@/components/overlay/useClock";
import { useAppStore } from "@/state/appStore";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${SITE_CONFIG.name} — Bản đồ 3D khu phố` },
      {
        name: "description",
        content: `${SITE_CONFIG.name}: sa bàn 3D khu phố quanh nhà, đổi buổi trong ngày và thời tiết.`,
      },
      { property: "og:title", content: `${SITE_CONFIG.name} — Bản đồ 3D khu phố` },
      { property: "og:description", content: `${SITE_CONFIG.name}, một chút thôi.` },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  useClock();
  const lang = useAppStore((s) => s.language);
  const viewMode = useAppStore((s) => s.viewMode);
  // While the splash covers startup, keyboard focus must not reach the controls behind it either.
  const startingUp = useAppStore((s) => s.loadingProgress < 1);

  useEffect(() => {
    document.documentElement.lang = lang;
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
        className="fixed inset-0 overflow-hidden overscroll-none"
        data-view-mode={viewMode}
        inert={startingUp}
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

          {/* Right vertical camera controls (Diorama, Mặt bằng, zoom, reset, compass) */}
          <div className="h6-map-controls-anchor absolute right-[max(1rem,env(safe-area-inset-right))] top-1/2 z-30 -translate-y-1/2">
            <MapControls />
          </div>

          {/* Centered floating dock at the bottom */}
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center px-4">
            <Dock />
          </div>
        </div>
      </main>
      {/* Outside the inert shell, so assistive technology still announces the progress. */}
      <Splash />
    </>
  );
}
