import { assertNoMetadata } from "./metadata";
export interface PostcardOptions {
  ward: string;
  date: string;
  minutes: number;
  mobile?: boolean;
  signal?: AbortSignal;
}
export interface PostcardResult {
  blob: Blob;
  width: number;
  height: number;
  degraded: boolean;
}
type Capture = (width: number, height: number) => Promise<Blob> | Blob;
let capture: Capture | null = null;
export function bindPostcardCapture(callback: Capture | null) {
  capture = callback;
}
function abort(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}
export function isAddressLike(value: string) {
  return /\d{1,5}\s|\b(street|st\.?|road|rd\.?|avenue|ave\.?|lane|ln\.?|đường|phố|ngõ|ngách|hẻm|số)\b/i.test(
    value,
  );
}
export function wardWarning(ward: string) {
  return isAddressLike(ward.trim()) ? "WARD_LOOKS_LIKE_ADDRESS" : null;
}
function safeWard(ward: string) {
  const value = ward.trim();
  if (value.length > 40) throw new Error("INVALID_WARD");
  return value;
}
function timeLabel(minutes: number) {
  const m = Math.max(0, Math.floor(minutes));
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
async function decode(blob: Blob) {
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  if (typeof Image === "undefined" || typeof URL === "undefined")
    throw new Error("SCENE_DECODE_UNAVAILABLE");
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("SCENE_DECODE_FAILED"));
      i.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
async function compose(
  scene: Blob,
  width: number,
  height: number,
  o: PostcardOptions,
  ward: string,
) {
  if (typeof document === "undefined") throw new Error("CANVAS_UNAVAILABLE");
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  try {
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
    ctx.fillStyle = "#f3efe6";
    ctx.fillRect(0, 0, width, height);
    const image = await decode(scene);
    try {
      const pad = Math.round(width * 0.04),
        footer = Math.round(height * 0.16);
      const scale = Math.min(
        (width - pad * 2) / image.width,
        (height - footer - pad * 2) / image.height,
      );
      const w = Math.max(1, Math.round(image.width * scale)),
        h = Math.max(1, Math.round(image.height * scale));
      ctx.drawImage(image, Math.round((width - w) / 2), pad, w, h);
    } finally {
      if ("close" in image) image.close();
    }
    ctx.strokeStyle = "#27342e";
    ctx.lineWidth = Math.max(4, width / 320);
    ctx.strokeRect(24, 24, width - 48, height - 48);
    ctx.fillStyle = "#27342e";
    const size = Math.max(24, width / 34);
    ctx.font = `bold ${size}px sans-serif`;
    ctx.fillText("Phố Nhà Mình · ảnh dựng 3D mô phỏng", 64, height - 105);
    ctx.font = `${Math.max(20, width / 52)}px sans-serif`;
    ctx.fillText(`${ward} · ${o.date} · ${timeLabel(o.minutes)}`, 64, height - 58);
    const out = await new Promise<Blob>((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error("ENCODE_FAILED"))), "image/png"),
    );
    assertNoMetadata(new Uint8Array(await out.arrayBuffer()));
    return out;
  } finally {
    c.width = 0;
    c.height = 0;
  }
}
export async function createPostcard(options: PostcardOptions): Promise<PostcardResult> {
  const ward = safeWard(options.ward);
  if (!Number.isFinite(options.minutes) || options.minutes < 0) throw new Error("INVALID_MINUTES");
  if (!capture) throw new Error("CAPTURE_UNAVAILABLE");
  abort(options.signal);
  const attempts = options.mobile ? [2048, 1080] : [3840, 2048, 1080];
  let degraded = false;
  let last: unknown;
  for (let i = 0; i < attempts.length; i++) {
    const width = attempts[i]!,
      height = Math.round((width * 9) / 16);
    try {
      abort(options.signal);
      const scene = await capture(width, height);
      if (!(scene instanceof Blob) || scene.size <= 0) throw new Error("CAPTURE_INVALID");
      const blob = await compose(scene, width, height, options, ward);
      abort(options.signal);
      if (i > 0) degraded = true;
      return { blob, width, height, degraded };
    } catch (e) {
      last = e;
      if (options.signal?.aborted) throw e;
      if (i === attempts.length - 1) throw e;
      degraded = true;
    }
  }
  throw last instanceof Error ? last : new Error("POSTCARD_FAILED");
}
export async function shareOrDownload(
  result: PostcardResult,
  filename = "pho-nha-minh-postcard.png",
  share = true,
): Promise<"shared" | "downloaded"> {
  if (
    share &&
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    typeof File !== "undefined"
  ) {
    const file = new File([result.blob], filename, { type: result.blob.type || "image/png" });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Phố Nhà Mình" });
      return "shared";
    }
  }
  if (typeof document === "undefined" || typeof URL === "undefined")
    throw new Error("DOWNLOAD_UNAVAILABLE");
  const url = URL.createObjectURL(result.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "downloaded";
}
