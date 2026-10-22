import { memoryId } from "@/memories/id";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  Download,
  ImagePlus,
  Music,
  Play,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Undo2,
} from "lucide-react";
import { formatMinutes, useT } from "@/i18n";
import { p10UI } from "@/i18n/p10UI";
import { useAppStore } from "@/state/appStore";
import { vietnamDateTime } from "@/atmosphere/clock";
import { worldDataProvider } from "@/world/privateWorldSession";
import { momentUrl } from "@/memories/moments";
import { processPhoto, type PixelRect } from "@/memories/imagePipeline";
import { processAudio, playMemoryAudio, stopMemoryAudio } from "@/memories/audio";
import { memorySession } from "@/memories/session";
import { memoryCamera } from "@/memories/bridge";
import { MAX_DOCUMENT_BYTES, type Memory, type Photo } from "@/memories/schema";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { MemoryJournal } from "./MemoryJournal";
import { MemoryPostcard } from "./MemoryPostcard";

function Button({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`ctl min-h-12 min-w-12 gap-2 px-3 text-sm ${className}`}
    >
      {children}
    </button>
  );
}
const field = "min-h-12 w-full rounded-lg border border-border bg-background px-3 text-sm";
function downloadText(text: string, filename: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function RedactionPhoto({
  photo,
  onChange,
  onRemove,
  disabled,
}: {
  photo: Photo;
  onChange: (p: Photo) => void;
  onRemove: () => void;
  disabled: boolean;
}) {
  const t = useT();
  const lang = useAppStore((s) => s.language);
  const u = p10UI[lang];
  const [rect, setRect] = useState<PixelRect>({ x: 0.2, y: 0.2, width: 0.4, height: 0.4 });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function point(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  }
  async function redact() {
    setProcessing(true);
    setError(false);
    try {
      const encoded = photo.dataUrl.split(",")[1]!;
      const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      const mime = photo.dataUrl.slice(5, photo.dataUrl.indexOf(";"));
      const processed = await processPhoto(new Blob([bytes], { type: mime }), [rect]);
      if (alive.current) onChange({ ...processed, id: photo.id, reviewed: false });
    } catch {
      if (alive.current) setError(true);
    } finally {
      if (alive.current) setProcessing(false);
    }
  }
  return (
    <div className="space-y-2 rounded-lg border border-border p-2">
      <div
        className="relative touch-none overflow-hidden rounded-lg"
        style={{ width: `${(photo.width / photo.height) * 240}px`, maxWidth: "100%" }}
        onPointerDown={(e) => {
          if (disabled) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          start.current = point(e);
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const p = point(e);
          setRect({
            x: Math.min(p.x, start.current.x),
            y: Math.min(p.y, start.current.y),
            width: Math.abs(p.x - start.current.x),
            height: Math.abs(p.y - start.current.y),
          });
        }}
        onPointerUp={() => {
          start.current = null;
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
      >
        <img
          src={photo.dataUrl}
          alt={u.photo}
          className="max-h-60 w-full object-contain"
          draggable={false}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute border-2 border-accent bg-accent/20"
          style={{
            left: `${rect.x * 100}%`,
            top: `${rect.y * 100}%`,
            width: `${rect.width * 100}%`,
            height: `${rect.height * 100}%`,
          }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        {(["x", "y", "width", "height"] as const).map((key) => (
          <label key={key} className="text-xs">
            {u[key]}
            <input
              className={field}
              type="number"
              min={0}
              max={100}
              value={Math.round(rect[key] * 100)}
              onChange={(e) =>
                setRect({
                  ...rect,
                  [key]: Math.max(0, Math.min(100, Number(e.target.value))) / 100,
                })
              }
            />
          </label>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={disabled || processing || rect.width <= 0 || rect.height <= 0}
          onClick={() => void redact()}
        >
          {u.redact}
        </Button>
        <Button disabled={disabled || processing} onClick={onRemove}>
          {u.removePhoto}
        </Button>
      </div>
      <label className="flex min-h-12 items-center gap-2 text-xs">
        <input
          type="checkbox"
          disabled={disabled || processing}
          checked={photo.reviewed}
          onChange={(e) => onChange({ ...photo, reviewed: e.target.checked })}
        />
        {t.memories.reviewRequired}
      </label>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {u.imageError}
        </p>
      )}
    </div>
  );
}
function MomentGallery() {
  const t = useT();
  const moments = useAppStore((s) => s.moments);
  const clear = useAppStore((s) => s.clearMoments);
  const [images, setImages] = useState<Map<number, string>>(() => new Map());
  useEffect(() => {
    let invalidated = false;
    const next = new Map<number, string>();
    setImages(next);
    void Promise.all(
      moments.map(async (moment) => {
        const source = momentUrl(moment.id);
        if (!source) return;
        try {
          const response = await fetch(source);
          if (!response.ok) throw new Error("MOMENT_READ_FAILED");
          const blob = await response.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error ?? new Error("MOMENT_READ_FAILED"));
            reader.readAsDataURL(blob);
          });
          if (!invalidated) next.set(moment.id, dataUrl);
        } catch {
          // A moment can be cleared while its data URL is being derived.
        }
      }),
    ).then(() => {
      if (!invalidated) setImages(new Map(next));
    });
    return () => {
      invalidated = true;
    };
  }, [moments]);
  if (!moments.length)
    return (
      <div className="flex flex-col items-center py-4 text-center">
        <Sparkles className="h-6 w-6 text-accent" aria-hidden />
        <p className="mt-2 font-serif text-lg italic text-primary">{t.memoriesEmptyTitle}</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{t.memoriesEmptyBody}</p>
        <p className="mt-2 max-w-xs text-xs text-muted-foreground">{t.momentsNote}</p>
      </div>
    );
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{t.momentsNote}</p>
      <div className="grid grid-cols-2 gap-2">
        {moments.map((m) => (
          <div key={m.id} className="overflow-hidden rounded-xl bg-secondary">
            {images.get(m.id) && (
              <>
                <img
                  src={images.get(m.id)}
                  alt={`${t.capture} · ${formatMinutes(m.minutes)}`}
                  className="aspect-video w-full object-cover"
                />
                <a
                  href={images.get(m.id)}
                  download={`pho-demo-${m.id}.png`}
                  className="ctl flex min-h-12 items-center justify-center gap-2"
                >
                  <Download className="h-4 w-4" />
                  {formatMinutes(m.minutes)}
                </a>
              </>
            )}
          </div>
        ))}
      </div>
      {moments.length > 0 && (
        <Button onClick={clear}>
          <Trash2 className="h-4 w-4" />
          {t.clearMoments}
        </Button>
      )}
    </div>
  );
}
export function MemoriesPanel() {
  const t = useT();
  const lang = useAppStore((s) => s.language);
  const u = p10UI[lang];
  const mode = useAppStore((s) => s.viewMode);
  const sceneReady = useAppStore((s) => s.sceneStatus === "ready");
  const snapshot = useSyncExternalStore(
    memorySession.subscribe,
    memorySession.getSnapshot,
    memorySession.getSnapshot,
  );
  const camera = useSyncExternalStore(
    memoryCamera.subscribe,
    memoryCamera.getSnapshot,
    memoryCamera.getSnapshot,
  );
  const world = useSyncExternalStore(
    worldDataProvider.subscribe,
    worldDataProvider.getSnapshot,
    worldDataProvider.getSnapshot,
  );
  const [editing, setEditing] = useState<Memory | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [undo, setUndo] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const audioUpload = useRef<HTMLInputElement>(null);
  const importFile = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setEditing(null);
    setBusy(false);
    setMessage("");
    setUndo(false);
    stopMemoryAudio();
  }, [world.packageEpoch, world.loading, snapshot.guest]);
  useEffect(
    () => () => {
      generation.current++;
      stopMemoryAudio();
    },
    [],
  );
  const visible = snapshot.memories.filter(
    (m) => !snapshot.guest || (m.visibility === "public" && m.photos.every((p) => p.reviewed)),
  );
  const tourAllowed = sceneReady && (mode === "diorama" || mode === "topdown");
  const selected = visible.find((m) => m.id === camera.memoryId);
  function newMemory() {
    const pose = memoryCamera.getPose();
    setMessage("");
    setEditing({
      id: memoryId(),
      title: "",
      body: "",
      position: [...pose.target],
      camera: { ...pose, target: [...pose.target] },
      date: vietnamDateTime().date,
      preset: "everyday",
      tags: [],
      photos: [],
      visibility: "private",
    });
  }
  async function addPhotos(files: FileList | null) {
    if (!editing || !files) return;
    const token = generation.current;
    const current = editing;
    setBusy(true);
    setMessage("");
    try {
      const photos: Photo[] = [];
      for (const file of Array.from(files).slice(0, 6 - current.photos.length))
        photos.push(await processPhoto(file));
      if (token === generation.current)
        setEditing({ ...current, photos: [...current.photos, ...photos] });
    } catch {
      if (token === generation.current) setMessage(u.imageError);
    } finally {
      if (token === generation.current) setBusy(false);
      if (upload.current) upload.current.value = "";
    }
  }
  async function addAudio(file?: File) {
    if (!editing || !file) return;
    const token = generation.current;
    const current = editing;
    setBusy(true);
    try {
      const audio = await processAudio(file);
      if (token === generation.current) setEditing({ ...current, audio });
    } catch {
      if (token === generation.current) setMessage(u.audioError);
    } finally {
      if (token === generation.current) setBusy(false);
      if (audioUpload.current) audioUpload.current.value = "";
    }
  }
  function save() {
    if (!editing) return;
    if (editing.visibility === "public" && editing.photos.some((p) => !p.reviewed)) {
      setMessage(u.reviewGate);
      return;
    }
    try {
      memorySession.saveMemory(editing);
      setEditing(null);
      setMessage("");
    } catch {
      setMessage(u.neutralError);
    }
  }
  async function importDocument(file?: File) {
    if (!file) return;
    setBusy(true);
    const token = generation.current;
    try {
      if (file.size > MAX_DOCUMENT_BYTES) throw new Error("LIMIT");
      await memorySession.importDocument(await file.text(), {
        isCancelled: () => token !== generation.current,
      });
      if (token === generation.current) setMessage(u.imported);
    } catch {
      if (token === generation.current) setMessage(u.neutralError);
    } finally {
      if (token === generation.current) setBusy(false);
      if (importFile.current) importFile.current.value = "";
    }
  }
  async function copy(id?: string) {
    try {
      await memoryCamera.copyLink({
        time: useAppStore.getState().timeOfDayMinutes,
        ...(id ? { id } : {}),
      });
      setMessage(u.copied);
    } catch {
      setMessage(u.linkError);
    }
  }
  return (
    <div className="space-y-4" data-testid="memories-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-lg text-primary">{t.memories.title}</h2>
        <Button
          onClick={newMemory}
          disabled={!snapshot.ready || snapshot.guest || !sceneReady || busy}
        >
          <Plus className="h-4 w-4" />
          {t.memories.add}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {snapshot.guest ? t.memories.guestNote : t.memories.privacyNote}
      </p>
      <label className="flex min-h-12 items-center gap-2 text-sm">
        <input
          type="checkbox"
          role="switch"
          checked={snapshot.guest}
          onChange={(e) => memorySession.setGuest(e.target.checked)}
        />
        {u.guest}
      </label>
      {!snapshot.ready && (
        <p role="status" className="text-xs">
          {u.readyError}
        </p>
      )}
      {snapshot.error && (
        <p role="alert" className="text-xs text-destructive">
          {snapshot.error === "CRYPTO_UNAVAILABLE_RAM_ONLY" ? u.storageUnavailable : u.storageError}
        </p>
      )}
      {message && (
        <p role="status" className="text-xs">
          {message}
        </p>
      )}
      {camera.error && (
        <p role="status" className="text-xs">
          {u.linkError}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!tourAllowed || !visible.length || !snapshot.ready}
          onClick={() =>
            memoryCamera.startTour([...visible].sort((a, b) => a.date.localeCompare(b.date)))
          }
        >
          {u.tour}
        </Button>
        <Button disabled={!tourAllowed} onClick={() => void copy()}>
          {u.copy}
        </Button>
      </div>
      {!tourAllowed && <p className="text-xs text-muted-foreground">{u.tourUnavailable}</p>}
      <p className="text-xs text-muted-foreground">{u.privateLink}</p>
      {camera.active && (
        <section
          className="space-y-2 rounded-xl border border-accent p-3"
          aria-label={u.tour}
          data-testid="memory-tour-card"
        >
          <p className="text-xs">
            {u.selected} · {camera.index + 1}/{visible.length}
          </p>
          <h3 className="font-medium">{selected?.title}</h3>
          <p className="whitespace-pre-wrap text-sm">{selected?.body}</p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={memoryCamera.previous}>{u.previous}</Button>
            <Button onClick={memoryCamera.next}>{u.next}</Button>
            <Button aria-pressed={camera.paused} onClick={memoryCamera.pause}>
              {u.pause}
            </Button>
            <Button onClick={memoryCamera.exit}>{u.exit}</Button>
          </div>
        </section>
      )}
      {!visible.length && snapshot.ready && (
        <p className="text-sm text-muted-foreground">{u.empty}</p>
      )}
      <div className="space-y-3">
        {visible.map((memory) => (
          <article
            key={memory.id}
            className="space-y-2 rounded-xl border border-border bg-secondary/40 p-3"
            data-testid="memory-card"
          >
            <button
              className="min-h-12 w-full text-left font-medium text-primary"
              disabled={!tourAllowed}
              onClick={() => memoryCamera.flyTo(memory)}
            >
              {memory.title || t.memories.untitled}
            </button>
            <p className="text-xs text-muted-foreground">
              {memory.date} · {t.memories[memory.preset]}
            </p>
            <p className="whitespace-pre-wrap break-words text-sm">{memory.body}</p>
            {memory.photos.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {memory.photos.map((photo) => (
                  <img
                    key={photo.id}
                    src={photo.thumbnail}
                    alt={u.photo}
                    className="aspect-video w-full rounded-lg object-cover"
                  />
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button
                disabled={!tourAllowed}
                aria-label={`${u.fly}: ${memory.title}`}
                onClick={() => memoryCamera.flyTo(memory)}
              >
                {u.fly}
              </Button>
              <Button
                disabled={!tourAllowed}
                onClick={() => {
                  memoryCamera.flyTo(memory);
                  void copy(memory.id);
                }}
              >
                {u.copy}
              </Button>
              {memory.audio && (
                <Button
                  onClick={() => {
                    void playMemoryAudio(memory.audio!).catch(() => setMessage(u.audioError));
                  }}
                >
                  <Play className="h-4 w-4" />
                  {t.memories.playAudio}
                </Button>
              )}
              {!snapshot.guest && (
                <>
                  <Button
                    onClick={() => {
                      setMessage("");
                      setEditing(structuredClone(memory));
                    }}
                  >
                    {t.memories.edit}
                  </Button>
                  <Button
                    aria-label={`${t.memories.delete}: ${memory.title}`}
                    onClick={() => {
                      memorySession.deleteMemory(memory.id);
                      setUndo(true);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                    {t.memories.delete}
                  </Button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      {undo && !snapshot.guest && (
        <Button
          onClick={() => {
            memorySession.undoDelete();
            setUndo(false);
          }}
        >
          <Undo2 className="h-4 w-4" />
          {u.undo}
        </Button>
      )}
      <MemoryJournal />
      <MemoryPostcard />
      {!snapshot.guest && (
        <details className="space-y-2">
          <summary className="min-h-12 cursor-pointer py-3 text-sm font-medium">
            {u.storage}
          </summary>
          <p className="text-xs text-muted-foreground">{u.storageNote}</p>
          <label className="flex min-h-12 items-center gap-2 text-sm">
            <input
              type="checkbox"
              role="switch"
              checked={snapshot.persistent}
              disabled={!snapshot.ready || busy}
              onChange={(e) => {
                void memorySession.setPersistent(e.target.checked);
              }}
            />
            {u.storage}
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={!snapshot.ready || busy}
              onClick={() => {
                try {
                  downloadText(memorySession.exportDocument(), "memories-private.json");
                } catch {
                  setMessage(u.neutralError);
                }
              }}
            >
              {u.export}
            </Button>
            <Button
              disabled={!snapshot.ready || busy}
              onClick={() => {
                try {
                  downloadText(memorySession.exportDocument(true), "memories-public.json");
                } catch {
                  setMessage(u.neutralError);
                }
              }}
            >
              {u.publicExport}
            </Button>
            <Button disabled={!snapshot.ready || busy} onClick={() => importFile.current?.click()}>
              {u.import}
            </Button>
            <input
              ref={importFile}
              aria-label={u.import}
              className="hidden"
              type="file"
              accept="application/json,.json"
              onChange={(e) => void importDocument(e.target.files?.[0])}
            />
            <Button
              disabled={!snapshot.ready || busy}
              onClick={() => {
                if (window.confirm(u.confirmClear)) void memorySession.clearAll();
              }}
            >
              {u.clear}
            </Button>
          </div>
        </details>
      )}
      {!snapshot.guest && (
        <details open>
          <summary className="min-h-12 cursor-pointer py-3 text-sm">
            {t.memories.quickMoments}
          </summary>
          <MomentGallery />
        </details>
      )}
      <Button onClick={stopMemoryAudio}>{t.memories.stopAudio}</Button>
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) {
            generation.current++;
            setEditing(null);
            setBusy(false);
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] w-[calc(100%-1rem)] overflow-y-auto rounded-xl p-4 [&>button]:min-h-12 [&>button]:min-w-12">
          <DialogTitle>{t.memories.editor}</DialogTitle>
          <DialogDescription>{u.atCamera}</DialogDescription>
          {editing && (
            <div className="space-y-3">
              <label className="block text-sm">
                {t.memories.titlePlaceholder}
                <input
                  autoFocus
                  aria-label={t.memories.titlePlaceholder}
                  className={field}
                  maxLength={80}
                  value={editing.title}
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                {t.memories.bodyPlaceholder}
                <textarea
                  aria-label={t.memories.bodyPlaceholder}
                  className={`${field} min-h-20 py-2`}
                  maxLength={2000}
                  value={editing.body}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">
                  {t.memories.date}
                  <input
                    className={field}
                    type="date"
                    value={editing.date}
                    onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                  />
                </label>
                <label className="text-sm">
                  {u.time}
                  <input
                    className={field}
                    type="time"
                    value={editing.time === undefined ? "" : formatMinutes(editing.time)}
                    onChange={(e) => {
                      const [h, m] = e.target.value.split(":").map(Number);
                      const next = { ...editing };
                      if (!e.target.value) delete next.time;
                      else next.time = h! * 60 + m!;
                      setEditing(next);
                    }}
                  />
                </label>
              </div>
              <label className="block text-sm">
                {t.memories.preset}
                <select
                  className={field}
                  value={editing.preset}
                  onChange={(e) =>
                    setEditing({ ...editing, preset: e.target.value as Memory["preset"] })
                  }
                >
                  {(["everyday", "family", "milestone"] as const).map((p) => (
                    <option key={p} value={p}>
                      {t.memories[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs">
                {u.tags}
                <input
                  className={field}
                  value={editing.tags.join(", ")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      tags: e.target.value
                        .split(",")
                        .slice(0, 5)
                        .map((tag) => tag.trim().slice(0, 20)),
                    })
                  }
                />
              </label>
              <label className="flex min-h-12 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.visibility === "public"}
                  onChange={(e) =>
                    setEditing({ ...editing, visibility: e.target.checked ? "public" : "private" })
                  }
                />
                {t.memories.public}
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={busy || editing.photos.length >= 6}
                  onClick={() => upload.current?.click()}
                >
                  <ImagePlus className="h-4 w-4" />
                  {t.memories.addPhoto}
                </Button>
                <input
                  ref={upload}
                  aria-label={t.memories.addPhoto}
                  className="hidden"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif"
                  multiple
                  onChange={(e) => void addPhotos(e.target.files)}
                />
                <Button disabled={busy} onClick={() => audioUpload.current?.click()}>
                  <Music className="h-4 w-4" />
                  {t.memories.addAudio}
                </Button>
                <input
                  ref={audioUpload}
                  aria-label={t.memories.addAudio}
                  className="hidden"
                  type="file"
                  accept="audio/*"
                  onChange={(e) => void addAudio(e.target.files?.[0])}
                />
                {editing.audio && (
                  <Button
                    onClick={() => {
                      const next = { ...editing };
                      delete next.audio;
                      setEditing(next);
                    }}
                  >
                    {u.deleteAudio}
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{u.noML}</p>
              {editing.photos.map((photo, index) => (
                <RedactionPhoto
                  key={photo.id}
                  photo={photo}
                  disabled={busy}
                  onChange={(next) =>
                    setEditing({
                      ...editing,
                      photos: editing.photos.map((p, i) => (i === index ? next : p)),
                    })
                  }
                  onRemove={() =>
                    setEditing({ ...editing, photos: editing.photos.filter((_, i) => i !== index) })
                  }
                />
              ))}
              {message && (
                <p role="alert" className="text-xs text-destructive">
                  {message}
                </p>
              )}
              <div className="flex gap-2">
                <Button disabled={busy} onClick={save}>
                  <Save className="h-4 w-4" />
                  {t.memories.save}
                </Button>
                <Button
                  onClick={() => {
                    generation.current++;
                    setEditing(null);
                    setBusy(false);
                  }}
                >
                  {t.localPreview.cancel}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
