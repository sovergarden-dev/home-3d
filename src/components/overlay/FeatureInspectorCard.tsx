import { Building2, Route, X } from "lucide-react";
import { useT } from "@/i18n";
import { useAppStore } from "@/state/appStore";

export function FeatureInspectorCard() {
  const t = useT();
  const lang = useAppStore((s) => s.language);
  const selected = useAppStore((s) => s.selectedFeature);
  const setSelectedFeature = useAppStore((s) => s.setSelectedFeature);

  if (!selected) return null;

  const title = lang === "vi" ? selected.nameVi : selected.nameEn;
  const subtitle = lang === "vi" ? selected.subtitleVi : selected.subtitleEn;
  const Icon = selected.kind === "road" ? Route : Building2;
  const roofLabel = selected.roofType
    ? (t.inspector.roofTypes[selected.roofType as keyof typeof t.inspector.roofTypes] ??
      selected.roofType)
    : null;
  const roadClassLabel = selected.roadClass
    ? (t.inspector.roadClasses[selected.roadClass as keyof typeof t.inspector.roadClasses] ??
      selected.roadClass)
    : null;

  return (
    <div
      role="region"
      aria-label={t.inspector.title}
      data-testid="feature-inspector-card"
      className="h6-feature-inspector glass pointer-events-auto fixed bottom-32 left-4 z-30 w-72 max-w-[calc(100vw-8.5rem)] rounded-2xl p-3.5 shadow-lg md:bottom-20 md:max-w-xs"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2">
          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-sm font-semibold leading-snug text-primary">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
        <button
          type="button"
          data-testid="feature-inspector-close"
          aria-label={t.inspector.close}
          title={t.inspector.close}
          onClick={() => setSelectedFeature(null)}
          className="ctl -mr-1.5 -mt-1.5 text-foreground hover:bg-secondary"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <dl className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {selected.kind === "building" ? (
          <>
            {typeof selected.heightMetres === "number" && (
              <div>
                <dt className="text-muted-foreground">{t.inspector.height}</dt>
                <dd className="font-medium text-foreground">~{selected.heightMetres} m</dd>
              </div>
            )}
            {typeof selected.levels === "number" && (
              <div>
                <dt className="text-muted-foreground">{t.inspector.levels}</dt>
                <dd className="font-medium text-foreground">{selected.levels}</dd>
              </div>
            )}
            {roofLabel && (
              <div>
                <dt className="text-muted-foreground">{t.inspector.roof}</dt>
                <dd className="font-medium text-foreground">{roofLabel}</dd>
              </div>
            )}
          </>
        ) : (
          <>
            {roadClassLabel && (
              <div>
                <dt className="text-muted-foreground">{t.inspector.roadClass}</dt>
                <dd className="font-medium text-foreground">{roadClassLabel}</dd>
              </div>
            )}
            {typeof selected.widthMetres === "number" && (
              <div>
                <dt className="text-muted-foreground">{t.inspector.width}</dt>
                <dd className="font-medium text-foreground">~{selected.widthMetres} m</dd>
              </div>
            )}
          </>
        )}
        <div>
          <dt className="text-muted-foreground">{t.inspector.source}</dt>
          <dd className="font-medium text-foreground">
            {selected.estimated
              ? t.inspector.estimated
              : (selected.provenanceSource ?? t.inspector.sourceDefault)}
          </dd>
        </div>
      </dl>
    </div>
  );
}
