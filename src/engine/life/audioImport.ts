import type { AudioImportResult, AudioManifest } from "./audioTypes";

export const DEFAULT_AUDIO_IMPORT_MAX_BYTES = 1_000_000;
const AUDIO_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/webm",
]);

async function readBytes(file: File): Promise<ArrayBuffer> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer();
  return new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("FILE_READ_FAILED"));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("FILE_READ_FAILED"));
    };
    reader.readAsArrayBuffer(file);
  });
}

function supported(file: File): boolean {
  if (AUDIO_TYPES.has(file.type.toLowerCase())) return true;
  return /\.(wav|ogg|mp3|m4a|webm)$/i.test(file.name);
}

function expectedManifest(value: unknown): {
  name?: string;
  size?: number;
  type?: string;
  sha256?: string;
} | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const result: { name?: string; size?: number; type?: string; sha256?: string } = {};
  if (typeof candidate["name"] === "string") result.name = candidate["name"];
  if (typeof candidate["size"] === "number") result.size = candidate["size"];
  if (typeof candidate["type"] === "string") result.type = candidate["type"];
  if (typeof candidate["sha256"] === "string") result.sha256 = candidate["sha256"].toLowerCase();
  return result;
}

export async function importLocalAudioFile(
  file: File,
  maxBytes = DEFAULT_AUDIO_IMPORT_MAX_BYTES,
  suppliedManifest?: unknown,
): Promise<AudioImportResult> {
  if (!supported(file)) return { ok: false, status: "fallback", reason: "unsupported-type" };
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > maxBytes) {
    return { ok: false, status: "fallback", reason: "too-large" };
  }
  try {
    const data = await readBytes(file);
    const cryptoApi = globalThis.crypto;
    if (!cryptoApi?.subtle) return { ok: false, status: "fallback", reason: "hash-unavailable" };
    // Hash a byte view: some runtimes reject an ArrayBuffer created in another realm.
    const digest = await cryptoApi.subtle.digest("SHA-256", new Uint8Array(data));
    const sha256 = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const manifest: AudioManifest = {
      name: file.name,
      size: file.size,
      type: file.type || "application/octet-stream",
      sha256,
    };
    const expected = expectedManifest(suppliedManifest);
    if (
      expected &&
      ((expected.name !== undefined && expected.name !== manifest.name) ||
        expected.size !== manifest.size ||
        expected.type?.toLowerCase() !== manifest.type.toLowerCase() ||
        expected.sha256 !== manifest.sha256)
    ) {
      return { ok: false, status: "fallback", reason: "manifest-mismatch" };
    }
    return { ok: true, status: "imported", manifest };
  } catch {
    return { ok: false, status: "fallback", reason: "read-error" };
  }
}
