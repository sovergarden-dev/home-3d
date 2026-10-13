import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useT } from "@/i18n";

export const Route = createFileRoute("/gioi-thieu")({
  head: () => ({
    meta: [
      { title: "Giới thiệu — Phố Nhà Mình" },
      { name: "description", content: "Câu chuyện đằng sau Phố Nhà Mình, tấm bản đồ 3D nhỏ của khu phố quanh nhà." },
      { property: "og:title", content: "Giới thiệu — Phố Nhà Mình" },
      { property: "og:description", content: "Câu chuyện đằng sau tấm bản đồ khu phố quanh nhà." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: About,
});

function About() {
  const t = useT();
  return (
    <main className="min-h-dvh px-6 py-16" style={{ background: "var(--gradient-scene)" }}>
      <article className="glass mx-auto max-w-xl p-8">
        <Link to="/" className="ctl -ml-2 px-2 text-sm text-primary hover:bg-secondary">
          <ArrowLeft className="h-4 w-4" /> {t.backHome}
        </Link>
        <h1 className="mt-4 font-serif text-4xl italic text-primary">{t.aboutTitle}</h1>
        <p className="mt-2 font-serif italic text-accent">{t.tagline}</p>
        {t.aboutBody.map((p) => <p key={p} className="mt-4 leading-relaxed text-foreground">{p}</p>)}
      </article>
    </main>
  );
}
