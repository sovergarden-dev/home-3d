import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { SceneViewport } from "@/components/overlay/SceneViewport";
import { TopInfo } from "@/components/overlay/TopInfo";
import { TopActions } from "@/components/overlay/TopActions";
import { MapControls } from "@/components/overlay/MapControls";
import { Dock, SHEET_PEEK } from "@/components/overlay/Dock";
import { Splash } from "@/components/overlay/Splash";
import { useClock } from "@/components/overlay/useClock";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppStore } from "@/state/appStore";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Phố Nhà Mình — Bản đồ 3D khu phố" },
      { name: "description", content: "Bản đồ 3D tương tác của khu phố quanh nhà: đổi giờ, thời tiết và ngày lễ." },
      { property: "og:title", content: "Phố Nhà Mình — Bản đồ 3D khu phố" },
      { property: "og:description", content: "Phố nhà mình, một chút thôi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Home,
});

function Home() {
  useClock();
  const mobile = useIsMobile();
  const lang = useAppStore((s) => s.language);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  return (
    <main className="fixed inset-0 overflow-hidden overscroll-none">
      <SceneViewport />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          paddingTop: "max(1rem, env(safe-area-inset-top))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0 justify-self-start"><TopInfo /></div>
          <TopActions />
        </div>

        {mobile ? (
          <div className="absolute right-[max(1rem,env(safe-area-inset-right))]" style={{ bottom: `calc(${SHEET_PEEK} + env(safe-area-inset-bottom) + 0.75rem)` }}>
            <MapControls />
          </div>
        ) : (
          <>
            <div className="absolute right-[max(1rem,env(safe-area-inset-right))] top-1/2 -translate-y-1/2"><MapControls /></div>
            <div className="absolute inset-x-0 bottom-[max(1rem,env(safe-area-inset-bottom))] flex justify-center"><Dock mobile={false} /></div>
          </>
        )}
      </div>
      {mobile && <Dock mobile />}
      <Splash />
    </main>
  );
}
