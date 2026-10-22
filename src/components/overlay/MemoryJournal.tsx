import { memoryId } from "@/memories/id";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ImagePlus, Pencil, Plus, Save, Trash2, X } from "lucide-react";
import { useAppStore } from "@/state/appStore";
import { p10Extras } from "@/i18n/p10Extras";
import { memorySession, type MemorySessionSnapshot } from "@/memories/session";
import { processPhoto } from "@/memories/imagePipeline";
import type { JournalEntry, Photo } from "@/memories/schema";
import { worldDataProvider } from "@/world/privateWorldSession";

const stages: JournalEntry["stage"][] = [
  "land",
  "foundation",
  "frame",
  "walls",
  "roof",
  "interior",
  "home",
];
const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const newId = memoryId;
const buttonClass =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 text-sm hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50";
const fieldClass =
  "mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3 text-sm";

type JournalTranslations = {
  title: string;
  intro: string;
  unavailable: string;
  privateWorldHint: string;
  guestHint: string;
  add: string;
  edit: string;
  delete: string;
  save: string;
  cancel: string;
  date: string;
  stage: string;
  body: string;
  bodyPlaceholder: string;
  photo: string;
  addPhoto: string;
  noEntries: string;
  stages: Record<JournalEntry["stage"], string>;
  compare: string;
  compareHint: string;
  before: string;
  after: string;
  reveal: string;
  uploadError: string;
  saveError: string;
  deleteError: string;
  imageLabel: string;
};

function safeError(t: JournalTranslations, error: unknown, fallback: string) {
  const code = error instanceof Error ? error.message : "";
  if (
    code === "PHOTO_TOO_LARGE" ||
    code === "UNSUPPORTED_IMAGE_TYPE" ||
    code === "IMAGE_DIMENSIONS_INVALID"
  )
    return t.uploadError;
  return fallback;
}

export interface MemoryJournalProps {
  memorySnapshot?: MemorySessionSnapshot;
}

export function MemoryJournal({ memorySnapshot }: MemoryJournalProps = {}) {
  const language = useAppStore((s) => s.language);
  const t = p10Extras[language].journal;
  const sessionSnapshot = useSyncExternalStore(
    memorySession.subscribe,
    memorySession.getSnapshot,
    memorySession.getSnapshot,
  );
  const snapshot = memorySnapshot ?? sessionSnapshot;
  const world = useSyncExternalStore(
    worldDataProvider.subscribe,
    worldDataProvider.getSnapshot,
    worldDataProvider.getSnapshot,
  );
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  useEffect(() => {
    const lifecycle = generation;
    lifecycle.current++;
    setEditing(null);
    setSelected([]);
    setBusy(false);
    setError("");
    return () => {
      lifecycle.current++;
    };
  }, [world.packageEpoch, world.loading, snapshot.guest]);

  useEffect(() => {
    memorySession.start();
    return () => memorySession.stop();
  }, []);
  const enabled =
    !world.loading &&
    (world.mode === "fixture" ||
      (world.mode === "private" && world.temporaryLotIllustrationSelected));
  const entries = useMemo(
    () =>
      snapshot.guest ? [] : [...snapshot.journal].sort((a, b) => a.date.localeCompare(b.date)),
    [snapshot.guest, snapshot.journal],
  );
  const photos = useMemo(
    () => entries.flatMap((entry) => entry.photos.map((photo) => ({ photo, entry }))),
    [entries],
  );
  useEffect(() => {
    setSelected((current) => {
      const valid = current.filter((id) => photos.some(({ photo }) => photo.id === id)).slice(0, 2);
      if (valid.length > 0 || photos.length < 2) return valid;
      return photos.slice(0, 2).map(({ photo }) => photo.id);
    });
  }, [photos]);

  const startNew = () => {
    setError("");
    setEditing({ id: newId(), date: today(), stage: "land", body: "", photos: [] });
  };
  const addPhotos = async (files: FileList | null) => {
    if (!files || !editing) return;
    const token = generation.current;
    setBusy(true);
    setError("");
    try {
      const room = Math.max(0, 6 - editing.photos.length);
      const added: Photo[] = [];
      for (const file of Array.from(files).slice(0, room)) added.push(await processPhoto(file));
      if (token === generation.current)
        setEditing({ ...editing, photos: [...editing.photos, ...added] });
    } catch (caught) {
      if (token === generation.current) setError(safeError(t, caught, t.uploadError));
    } finally {
      if (token === generation.current) setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const save = () => {
    if (!editing) return;
    setBusy(true);
    setError("");
    try {
      memorySession.saveJournal(editing);
      setEditing(null);
    } catch (caught) {
      setError(safeError(t, caught, t.saveError));
    } finally {
      setBusy(false);
    }
  };
  const remove = (id: string) => {
    setError("");
    try {
      memorySession.deleteJournal(id);
    } catch (caught) {
      setError(safeError(t, caught, t.deleteError));
    }
  };

  if (snapshot.guest) return null;
  if (!enabled)
    return (
      <section className="space-y-2" aria-label={t.title}>
        <h2 className="font-serif text-lg text-primary">{t.title}</h2>
        <p className="text-sm text-muted-foreground">
          {world.mode === "private" ? t.privateWorldHint : t.unavailable}
        </p>
      </section>
    );

  return (
    <section className="space-y-4" aria-label={t.title} data-testid="memory-journal">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="font-serif text-lg text-primary">{t.title}</h2>
          <p className="text-xs text-muted-foreground">{t.intro}</p>
        </div>
        <button type="button" className={buttonClass} disabled={!snapshot.ready} onClick={startNew}>
          <Plus className="h-4 w-4" />
          {t.add}
        </button>
      </div>
      {(error || snapshot.error) && (
        <p role="alert" className="text-sm text-destructive">
          {error || t.saveError}
        </p>
      )}
      {editing && (
        <form
          className="space-y-3 rounded-xl border border-border bg-secondary/40 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
          aria-label={t.title}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">
              {t.date}
              <input
                required
                type="date"
                className={fieldClass}
                value={editing.date}
                onChange={(event) => setEditing({ ...editing, date: event.target.value })}
              />
            </label>
            <label className="text-xs">
              {t.stage}
              <select
                className={fieldClass}
                value={editing.stage}
                onChange={(event) =>
                  setEditing({ ...editing, stage: event.target.value as JournalEntry["stage"] })
                }
              >
                {stages.map((stage) => (
                  <option key={stage} value={stage}>
                    {t.stages[stage]}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label className="block text-xs">
            {t.body}
            <textarea
              maxLength={2000}
              className="mt-1 min-h-24 w-full rounded-lg border border-border bg-background p-3 text-sm"
              placeholder={t.bodyPlaceholder}
              value={editing.body}
              onChange={(event) => setEditing({ ...editing, body: event.target.value })}
            />
          </label>
          <div>
            <div className="mb-2 text-xs">
              {t.photo} ({editing.photos.length}/6)
            </div>
            <div className="grid grid-cols-3 gap-2">
              {editing.photos.map((photo) => (
                <div
                  key={photo.id}
                  className="relative overflow-hidden rounded-lg border border-border"
                >
                  <img
                    src={photo.thumbnail}
                    alt={t.imageLabel}
                    className="aspect-square w-full object-cover"
                  />
                  <button
                    type="button"
                    className="absolute right-1 top-1 min-h-12 min-w-12 rounded-full bg-background/90 p-2"
                    aria-label={`${t.delete} ${t.imageLabel}`}
                    onClick={() =>
                      setEditing({
                        ...editing,
                        photos: editing.photos.filter((item) => item.id !== photo.id),
                      })
                    }
                  >
                    <X className="mx-auto h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              type="button"
              disabled={busy || editing.photos.length >= 6}
              className={`${buttonClass} mt-2`}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus className="h-4 w-4" />
              {t.addPhoto}
            </button>
            <input
              ref={fileRef}
              aria-label={t.addPhoto}
              hidden
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              onChange={(event) => void addPhotos(event.target.files)}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={buttonClass}>
              <Save className="h-4 w-4" />
              {t.save}
            </button>
            <button type="button" className={buttonClass} onClick={() => setEditing(null)}>
              <X className="h-4 w-4" />
              {t.cancel}
            </button>
          </div>
        </form>
      )}
      {entries.length === 0 && !editing && (
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          {t.noEntries}
        </p>
      )}
      <div className="space-y-3">
        {entries.map((entry) => (
          <article key={entry.id} className="rounded-xl border border-border bg-secondary/30 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-medium">{t.stages[entry.stage]}</h3>
                <p className="text-xs text-muted-foreground">{entry.date}</p>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="min-h-12 min-w-12 rounded-lg border border-border p-2"
                  aria-label={`${t.edit} ${t.stages[entry.stage]}`}
                  onClick={() => setEditing(entry)}
                >
                  <Pencil className="mx-auto h-4 w-4" />
                </button>
                <button
                  type="button"
                  className="min-h-12 min-w-12 rounded-lg border border-border p-2"
                  aria-label={`${t.delete} ${t.stages[entry.stage]}`}
                  onClick={() => remove(entry.id)}
                >
                  <Trash2 className="mx-auto h-4 w-4" />
                </button>
              </div>
            </div>
            {entry.body && <p className="mt-2 whitespace-pre-wrap text-sm">{entry.body}</p>}
            {entry.photos.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-2">
                {entry.photos.map((photo) => (
                  <label
                    key={photo.id}
                    className="relative block min-h-12 cursor-pointer rounded-lg border border-border p-1"
                  >
                    <img
                      src={photo.thumbnail}
                      alt={`${t.imageLabel}, ${t.stages[entry.stage]}`}
                      className="aspect-square w-full rounded object-cover"
                    />
                    <span className="flex min-h-12 items-center gap-2 px-1 text-xs">
                      <input
                        type="checkbox"
                        aria-label={`${t.compare}: ${t.stages[entry.stage]} ${entry.date}`}
                        checked={selected.includes(photo.id)}
                        disabled={!selected.includes(photo.id) && selected.length >= 2}
                        onChange={() =>
                          setSelected((current) =>
                            current.includes(photo.id)
                              ? current.filter((id) => id !== photo.id)
                              : [...current, photo.id].slice(-2),
                          )
                        }
                      />
                      {t.compare}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
      {selected.length === 2 && (
        <Compare
          photos={photos
            .filter(({ photo }) => selected.includes(photo.id))
            .map(({ photo }) => photo)}
          t={t}
        />
      )}
    </section>
  );
}

function Compare({ photos, t }: { photos: Photo[]; t: JournalTranslations }) {
  const [reveal, setReveal] = useState(50);
  const first = photos[0];
  const second = photos[1];
  if (!first || !second) return null;
  return (
    <section
      className="space-y-2 rounded-xl border border-border bg-secondary/30 p-3"
      aria-label={t.compare}
    >
      <h3 className="font-medium">{t.compare}</h3>
      <p className="text-xs text-muted-foreground">{t.compareHint}</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <span>{t.before}</span>
        <span>{t.after}</span>
      </div>
      <div
        className="relative mx-auto h-20 max-w-full overflow-hidden rounded-lg bg-background"
        style={{ aspectRatio: `${first.width} / ${first.height}` }}
      >
        <img
          src={first.dataUrl}
          alt={t.before}
          className="absolute inset-0 h-full w-full object-contain"
        />
        <div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: `inset(0 ${100 - reveal}% 0 0)` }}
        >
          <img src={second.dataUrl} alt={t.after} className="h-full w-full object-contain" />
        </div>
      </div>
      <label className="block text-xs">
        {t.reveal}
        <input
          aria-label={t.reveal}
          role="slider"
          type="range"
          min="0"
          max="100"
          value={reveal}
          onChange={(event) => setReveal(Number(event.target.value))}
          className="mt-1 min-h-12 w-full"
        />
      </label>
    </section>
  );
}

export default MemoryJournal;
