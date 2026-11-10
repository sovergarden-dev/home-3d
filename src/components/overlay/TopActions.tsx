import type { Language } from "@/state/appStore";
import { Link } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useAppStore } from "@/state/appStore";
import { useT } from "@/i18n";

export function TopActions() {
  const t = useT();
  const lang = useAppStore((s) => s.language);
  const setLanguage = useAppStore((s) => s.setLanguage);

  return (
    <div className="h6-top-actions pointer-events-auto flex items-center justify-end">
      <div role="radiogroup" aria-label={t.language} className="glass flex rounded-xl p-1">
        {(["vi", "en"] as Language[]).map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={lang === l}
            onClick={() => setLanguage(l)}
            className="ctl min-w-[40px] px-2 text-xs uppercase aria-checked:bg-primary aria-checked:text-primary-foreground"
          >
            {l}
          </button>
        ))}
      </div>
      <Link
        to="/gioi-thieu"
        aria-label={t.about}
        title={t.about}
        className="ctl glass ml-2 text-foreground hover:bg-secondary"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
