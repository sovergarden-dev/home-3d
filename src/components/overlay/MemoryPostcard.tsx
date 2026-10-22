import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Download, Share2, X } from "lucide-react";
import { useAppStore } from "@/state/appStore";
import { p10Extras } from "@/i18n/p10Extras";
import {
  createPostcard,
  isAddressLike,
  shareOrDownload,
  type PostcardResult,
} from "@/memories/postcard";
import { worldDataProvider } from "@/world/privateWorldSession";
import { memorySession } from "@/memories/session";

const buttonClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";
const fieldClass =
  "mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3 text-sm";

export interface MemoryPostcardProps {
  guest?: boolean;
}

export function MemoryPostcard({ guest }: MemoryPostcardProps = {}) {
  const language = useAppStore((s) => s.language);
  const selectedDate = useAppStore((s) => s.selectedDate);
  const minutes = useAppStore((s) => s.timeOfDayMinutes);
  const t = p10Extras[language].postcard;
  const world = useSyncExternalStore(
    worldDataProvider.subscribe,
    worldDataProvider.getSnapshot,
    worldDataProvider.getSnapshot,
  );
  const session = useSyncExternalStore(
    memorySession.subscribe,
    memorySession.getSnapshot,
    memorySession.getSnapshot,
  );
  const isGuest = guest ?? session.guest;
  const enabled =
    !world.loading &&
    (world.mode === "fixture" ||
      (world.mode === "private" && world.temporaryLotIllustrationSelected));
  const [ward, setWard] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<PostcardResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const identityRef = useRef(`${world.mode}:${world.packageEpoch}:${world.loading}:${isGuest}`);

  useEffect(() => {
    const url = result ? URL.createObjectURL(result.blob) : null;
    setPreviewUrl(url);
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [result]);
  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );
  useEffect(() => {
    const identity = `${world.mode}:${world.packageEpoch}:${world.loading}:${isGuest}`;
    if (identity === identityRef.current) return;
    identityRef.current = identity;
    abortRef.current?.abort();
    setBusy(false);
    setResult(null);
    setError("");
    setNotice("");
    setWard("");
  }, [world.mode, world.packageEpoch, world.loading, isGuest]);

  const create = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const postcard = await createPostcard({
        ward: ward.trim(),
        date: selectedDate,
        minutes,
        mobile: typeof window !== "undefined" && window.innerWidth < 768,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setResult(postcard);
    } catch {
      if (!controller.signal.aborted) setError(t.error);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setBusy(false);
      }
    }
  };
  const cancel = () => {
    abortRef.current?.abort();
    setBusy(false);
  };
  const share = async () => {
    if (!result) return;
    try {
      const outcome = await shareOrDownload(result);
      setNotice(outcome === "shared" ? t.resultShared : t.resultDownloaded);
    } catch {
      setError(t.error);
    }
  };
  const wardWarning = ward.length > 0 && isAddressLike(ward);

  if (isGuest)
    return (
      <section className="space-y-2" aria-label={t.title}>
        <h2 className="font-serif text-lg text-primary">{t.title}</h2>
        <p className="text-sm text-muted-foreground">{t.unavailable}</p>
      </section>
    );
  if (!enabled)
    return (
      <section className="space-y-2" aria-label={t.title}>
        <h2 className="font-serif text-lg text-primary">{t.title}</h2>
        <p className="text-sm text-muted-foreground">{t.unavailable}</p>
      </section>
    );
  return (
    <section className="space-y-3" aria-label={t.title}>
      <div>
        <h2 className="font-serif text-lg text-primary">{t.title}</h2>
        <p className="text-xs text-muted-foreground">{t.intro}</p>
      </div>
      <label className="block text-xs">
        {t.ward}
        <input
          maxLength={40}
          className={fieldClass}
          value={ward}
          placeholder={t.wardPlaceholder}
          onChange={(event) => setWard(event.target.value)}
        />
      </label>
      {wardWarning && (
        <p className="text-xs text-amber-700" role="status">
          {t.addressWarning}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !session.ready}
          className={buttonClass}
          onClick={() => void create()}
        >
          {busy ? t.creating : t.create}
        </button>
        {busy && (
          <button type="button" className={buttonClass} onClick={cancel}>
            <X className="h-4 w-4" />
            {t.cancel}
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {result && previewUrl && (
        <div className="space-y-2 rounded-xl border border-border bg-secondary/30 p-3">
          <img
            src={previewUrl}
            alt={t.previewAlt}
            className="max-h-[70vh] w-full rounded-lg object-contain"
          />
          {result.degraded && <p className="text-xs text-muted-foreground">{t.degraded}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass} onClick={() => void share()}>
              <Share2 className="h-4 w-4" />
              {t.share}
            </button>
            <button
              type="button"
              className={buttonClass}
              onClick={() =>
                void shareOrDownload(result, "pho-nha-minh-postcard.png", false)
                  .then((outcome) =>
                    setNotice(outcome === "shared" ? t.resultShared : t.resultDownloaded),
                  )
                  .catch(() => setError(t.error))
              }
            >
              <Download className="h-4 w-4" />
              {t.download}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export default MemoryPostcard;
