import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import { SITE_CONFIG } from "@/config/site";
import { useT } from "@/i18n";
import { useAppStore } from "@/state/appStore";

export const Route = createFileRoute("/gioi-thieu")({
  head: () => ({
    meta: [
      { title: `Giới thiệu — ${SITE_CONFIG.name}` },
      {
        name: "description",
        content: `Câu chuyện đằng sau ${SITE_CONFIG.name}, sa bàn 3D nhỏ của khu phố quanh nhà.`,
      },
      { property: "og:title", content: `Giới thiệu — ${SITE_CONFIG.name}` },
      { property: "og:description", content: "Câu chuyện đằng sau sa bàn 3D khu phố quanh nhà." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: About,
});

function About() {
  const t = useT();
  const lang = useAppStore((s) => s.language);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = `${t.about} — ${SITE_CONFIG.name}`;
  }, [lang, t.about]);

  return (
    <main className="min-h-dvh px-6 py-16" style={{ background: "var(--gradient-scene)" }}>
      <article className="glass mx-auto max-w-xl p-8">
        <Link
          to="/"
          data-testid="about-back-home"
          className="ctl -ml-2 px-2 text-sm text-primary hover:bg-secondary"
        >
          <ArrowLeft className="h-4 w-4" /> {t.backHome}
        </Link>
        <h1 className="mt-4 font-serif text-4xl italic text-primary">{t.aboutTitle}</h1>
        <p className="mt-2 font-serif italic text-primary">{t.tagline}</p>
        {t.aboutBody.map((p) => (
          <p key={p} className="mt-4 leading-relaxed text-foreground">
            {p}
          </p>
        ))}
        <section className="mt-8 border-t border-border pt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t.aboutShortcutsTitle}
          </h2>
          <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {t.aboutShortcuts.map(({ keys, action }) => (
              <div
                key={keys}
                className="flex items-center justify-between gap-3 rounded-lg bg-secondary px-3 py-2"
              >
                <dt className="font-mono text-xs font-semibold text-primary">{keys}</dt>
                <dd className="text-right text-xs text-foreground">{action}</dd>
              </div>
            ))}
          </dl>
        </section>
      </article>
    </main>
  );
}
