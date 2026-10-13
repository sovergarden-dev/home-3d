import { ClientOnly } from "@tanstack/react-router";
import { useT } from "@/i18n";

/** Placeholder for the future 3D engine. Mount the canvas inside #scene-root. */
function ViewportInner() {
  const t = useT();
  return (
    <div
      id="scene-root"
      className="absolute inset-0 touch-none select-none overflow-hidden"
      style={{ background: "var(--gradient-scene)" }}
      aria-label={t.viewportPlaceholder}
      role="img"
    >
      <div className="scene-grid absolute inset-0" />
      <div className="absolute inset-0 grid place-items-center">
        <p className="font-serif text-lg italic text-muted-foreground">{t.viewportPlaceholder}</p>
      </div>
    </div>
  );
}

export function SceneViewport() {
  return (
    <ClientOnly fallback={<div className="absolute inset-0" style={{ background: "var(--gradient-scene)" }} />}>
      <ViewportInner />
    </ClientOnly>
  );
}
