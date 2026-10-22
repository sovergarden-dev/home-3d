import { memoryId } from "@/memories/id";
import { assertNoMetadata, isSupportedImageMime } from "./metadata";
export interface Photo {
  id: string;
  dataUrl: string;
  thumbnail: string;
  placeholder: string;
  width: number;
  height: number;
  reviewed: boolean;
}
export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
const MAX_BYTES = 25 * 1024 * 1024,
  MAX_PIXELS = 40_000_000;
export interface ImagePipelineDiagnostics {
  bitmapCreated: number;
  bitmapClosed: number;
  urlsCreated: number;
  urlsRevoked: number;
  canvasesCreated: number;
  canvasesCleared: number;
}
const diagnostics: ImagePipelineDiagnostics = {
  bitmapCreated: 0,
  bitmapClosed: 0,
  urlsCreated: 0,
  urlsRevoked: 0,
  canvasesCreated: 0,
  canvasesCleared: 0,
};
export function getImagePipelineDiagnostics(): ImagePipelineDiagnostics {
  return { ...diagnostics };
}
export function resetImagePipelineDiagnostics() {
  for (const k of Object.keys(diagnostics) as (keyof ImagePipelineDiagnostics)[])
    diagnostics[k] = 0;
}
function u32(b: Uint8Array, o: number) {
  return (
    (b[o] ?? 0) * 0x1000000 + (b[o + 1] ?? 0) * 0x10000 + (b[o + 2] ?? 0) * 0x100 + (b[o + 3] ?? 0)
  );
}
export function readImageDimensions(b: Uint8Array, mime: string) {
  if (mime === "image/png" && b.length >= 24) return { width: u32(b, 16), height: u32(b, 20) };
  if (mime === "image/webp" && b.length >= 30) {
    const kind = String.fromCharCode(...b.slice(12, 16));
    if (kind === "VP8X")
      return {
        width: 1 + (b[24] ?? 0) + ((b[25] ?? 0) << 8) + ((b[26] ?? 0) << 16),
        height: 1 + (b[27] ?? 0) + ((b[28] ?? 0) << 8) + ((b[29] ?? 0) << 16),
      };
    if (kind === "VP8 ") {
      let p = 20;
      while (p + 7 <= b.length && !(b[p] === 0x9d && b[p + 1] === 1 && b[p + 2] === 0x2a)) p++;
      if (p + 7 <= b.length)
        return {
          width: ((b[p + 3] ?? 0) | ((b[p + 4] ?? 0) << 8)) & 0x3fff,
          height: ((b[p + 5] ?? 0) | ((b[p + 6] ?? 0) << 8)) & 0x3fff,
        };
    }
    if (kind === "VP8L" && b.length >= 25 && b[20] === 0x2f)
      return {
        width: 1 + ((b[21] ?? 0) | (((b[22] ?? 0) & 0x3f) << 8)),
        height: 1 + (((b[22] ?? 0) >> 6) | ((b[23] ?? 0) << 2) | (((b[24] ?? 0) & 0x0f) << 10)),
      };
  }
  if (mime === "image/jpeg") {
    let p = 2;
    while (p + 9 < b.length) {
      if ((b[p++] ?? 0) !== 0xff) continue;
      const m = b[p++] ?? 0;
      if (m === 0xda || m === 0xd9) break;
      if (m === 0 || m === 0xff) continue;
      if (p + 2 > b.length) break;
      const n = ((b[p] ?? 0) << 8) | (b[p + 1] ?? 0);
      if (n < 2 || p + n > b.length) break;
      if (
        (m >= 0xc0 && m <= 0xc3) ||
        (m >= 0xc5 && m <= 0xc7) ||
        (m >= 0xc9 && m <= 0xcb) ||
        (m >= 0xcd && m <= 0xcf)
      )
        return {
          width: ((b[p + 5] ?? 0) << 8) | (b[p + 6] ?? 0),
          height: ((b[p + 3] ?? 0) << 8) | (b[p + 4] ?? 0),
        };
      p += n;
    }
  }
  return { width: 0, height: 0 };
}
function canvasElement(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  diagnostics.canvasesCreated++;
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
function clearCanvas(c: HTMLCanvasElement | OffscreenCanvas) {
  c.width = 0;
  c.height = 0;
  diagnostics.canvasesCleared++;
}
async function canvasBlob(
  c: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality = 0.9,
): Promise<Blob> {
  if ("convertToBlob" in c) return c.convertToBlob({ type, quality });
  return new Promise((res, rej) =>
    (c as HTMLCanvasElement).toBlob(
      (b) => (b ? res(b) : rej(new Error("ENCODE_FAILED"))),
      type,
      quality,
    ),
  );
}
async function bytesOf(b: Blob) {
  return new Uint8Array(await b.arrayBuffer());
}
async function decode(blob: Blob, fallback = { width: 0, height: 0 }) {
  const mime = blob.type.toLowerCase();
  if (typeof createImageBitmap === "function") {
    try {
      const source = await createImageBitmap(blob, { imageOrientation: "from-image" });
      diagnostics.bitmapCreated++;
      if (source.width > 0 && source.height > 0)
        return { source, width: source.width, height: source.height, revoke: undefined };
      source.close();
      diagnostics.bitmapClosed++;
    } catch (e) {
      if (["image/avif", "image/heic", "image/heif"].includes(mime))
        throw new Error("NATIVE_DECODE_REQUIRED");
    }
  }
  if (
    ["image/avif", "image/heic", "image/heif"].includes(mime) ||
    typeof Image === "undefined" ||
    typeof URL === "undefined"
  )
    throw new Error("IMAGE_DECODE_UNAVAILABLE");
  const url = URL.createObjectURL(blob);
  diagnostics.urlsCreated++;
  try {
    const source = await new Promise<HTMLImageElement>((res, rej) => {
      const image = new Image();
      image.onload = async () => {
        try {
          await image.decode?.();
        } catch {
          // The load event is still sufficient for browsers without decode().
        }
        res(image);
      };
      image.onerror = () => rej(new Error("IMAGE_DECODE_FAILED"));
      image.src = url;
    });
    return {
      source,
      width: source.naturalWidth || source.width || fallback.width,
      height: source.naturalHeight || source.height || fallback.height,
      revoke: () => {
        URL.revokeObjectURL(url);
        diagnostics.urlsRevoked++;
      },
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    diagnostics.urlsRevoked++;
    throw e;
  }
}
async function encoded(c: HTMLCanvasElement | OffscreenCanvas) {
  let type = "image/webp",
    blob = await canvasBlob(c, type);
  if (blob.type !== type || !blob.size) {
    type = "image/jpeg";
    blob = await canvasBlob(c, type, 0.88);
  }
  const bytes = await bytesOf(blob);
  assertNoMetadata(bytes);
  return { blob, bytes };
}
async function dataUrl(blob: Blob, bytes?: Uint8Array) {
  if (typeof FileReader !== "undefined")
    return new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () =>
        typeof r.result === "string" ? res(r.result) : rej(new Error("READ_FAILED"));
      r.onerror = () => rej(r.error ?? new Error("READ_FAILED"));
      r.readAsDataURL(blob);
    });
  const b = bytes ?? (await bytesOf(blob));
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return `data:${blob.type};base64,${btoa(s)}`;
}
async function placeholderFrom(c: HTMLCanvasElement | OffscreenCanvas, w: number, h: number) {
  const p = canvasElement(8, 8);
  try {
    const ctx = p.getContext("2d");
    if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
    ctx.filter = "blur(2px)";
    ctx.drawImage(c, 0, 0, 8, 8);
    let out = await canvasBlob(p, "image/webp", 0.35);
    if (out.size >= 1024) out = await canvasBlob(p, "image/jpeg", 0.2);
    if (out.size >= 1024) throw new Error("PLACEHOLDER_TOO_LARGE");
    return await dataUrl(out);
  } finally {
    clearCanvas(p);
  }
}
export async function processPhoto(blob: Blob, rects: PixelRect[] = []): Promise<Photo> {
  if (blob.size <= 0 || blob.size > MAX_BYTES) throw new Error("PHOTO_TOO_LARGE");
  const mime = blob.type.toLowerCase();
  if (!isSupportedImageMime(mime)) throw new Error("UNSUPPORTED_IMAGE_TYPE");
  const sourceBytes = await bytesOf(blob);
  const header = readImageDimensions(sourceBytes, mime);
  if (
    !["image/avif", "image/heic", "image/heif"].includes(mime) &&
    header.width > 0 &&
    header.height > 0 &&
    header.width * header.height > MAX_PIXELS
  )
    throw new Error("IMAGE_DIMENSIONS_INVALID");
  const decoded = await decode(blob, header);
  let mainCanvas: HTMLCanvasElement | OffscreenCanvas | undefined,
    thumbCanvas: HTMLCanvasElement | OffscreenCanvas | undefined;
  try {
    const { width, height } = decoded;
    if (width <= 0 || height <= 0 || width * height > MAX_PIXELS)
      throw new Error("IMAGE_DIMENSIONS_INVALID");
    const scale = Math.min(1, 1600 / Math.max(width, height)),
      outW = Math.max(1, Math.round(width * scale)),
      outH = Math.max(1, Math.round(height * scale));
    mainCanvas = canvasElement(outW, outH);
    const ctx = mainCanvas.getContext("2d");
    if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
    ctx.drawImage(decoded.source, 0, 0, outW, outH);
    for (const r of rects) {
      if (![r.x, r.y, r.width, r.height].every(Number.isFinite)) continue;
      const x = Math.max(0, Math.min(outW, Math.floor(r.x * outW))),
        y = Math.max(0, Math.min(outH, Math.floor(r.y * outH))),
        right = Math.max(x, Math.min(outW, Math.ceil((r.x + r.width) * outW))),
        bottom = Math.max(y, Math.min(outH, Math.ceil((r.y + r.height) * outH))),
        w = right - x,
        h = bottom - y;
      if (!w || !h) continue;
      const tiny = canvasElement(Math.max(1, Math.ceil(w / 12)), Math.max(1, Math.ceil(h / 12)));
      try {
        const tc = tiny.getContext("2d");
        if (!tc) continue;
        tc.imageSmoothingEnabled = false;
        tc.drawImage(mainCanvas, x, y, w, h, 0, 0, tiny.width, tiny.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tiny, 0, 0, tiny.width, tiny.height, x, y, w, h);
      } finally {
        clearCanvas(tiny);
      }
    }
    const main = await encoded(mainCanvas);
    thumbCanvas = canvasElement(
      Math.max(1, Math.round(outW * Math.min(1, 320 / Math.max(outW, outH)))),
      Math.max(1, Math.round(outH * Math.min(1, 320 / Math.max(outW, outH)))),
    );
    const tc = thumbCanvas.getContext("2d");
    if (!tc) throw new Error("CANVAS_UNAVAILABLE");
    tc.drawImage(mainCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
    const thumb = await encoded(thumbCanvas);
    return {
      id: memoryId(),
      dataUrl: await dataUrl(main.blob, main.bytes),
      thumbnail: await dataUrl(thumb.blob, thumb.bytes),
      placeholder: await placeholderFrom(mainCanvas, outW, outH),
      width: outW,
      height: outH,
      reviewed: false,
    };
  } finally {
    if (mainCanvas) clearCanvas(mainCanvas);
    if (thumbCanvas) clearCanvas(thumbCanvas);
    decoded.revoke?.();
    if ("close" in decoded.source) {
      decoded.source.close();
      diagnostics.bitmapClosed++;
    }
  }
}
