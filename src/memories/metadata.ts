const JPEG = [0xff, 0xd8, 0xff] as const;
function fail(message = "UNRECOGNIZED_IMAGE_FORMAT"): never {
  throw new Error(message);
}
function isJpeg(b: Uint8Array) {
  return b.length >= 3 && b[0] === JPEG[0] && b[1] === JPEG[1] && b[2] === JPEG[2];
}
function isPng(b: Uint8Array) {
  return (
    b.length >= 8 &&
    b.slice(0, 8).every((v, i) => v === ([137, 80, 78, 71, 13, 10, 26, 10][i] ?? -1))
  );
}
function isWebp(b: Uint8Array) {
  return (
    b.length >= 12 &&
    String.fromCharCode(...b.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...b.slice(8, 12)) === "WEBP"
  );
}
function u32(b: Uint8Array, o: number) {
  return (
    (b[o] ?? 0) * 0x1000000 + (b[o + 1] ?? 0) * 0x10000 + (b[o + 2] ?? 0) * 0x100 + (b[o + 3] ?? 0)
  );
}

/** Reject metadata-bearing or malformed encoded image bytes. */
export function assertNoMetadata(bytes: Uint8Array): void {
  if (isJpeg(bytes)) {
    let p = 2;
    while (p < bytes.length) {
      if (bytes[p++] !== 0xff) continue;
      while (p < bytes.length && bytes[p] === 0xff) p++;
      const marker = bytes[p++];
      if (marker === undefined) fail("MALFORMED_JPEG");
      if (marker === 0xd9 || marker === 0xda) return;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (p + 2 > bytes.length) fail("MALFORMED_JPEG");
      const length = ((bytes[p] ?? 0) << 8) | (bytes[p + 1] ?? 0);
      if (length < 2 || p + length > bytes.length) fail("MALFORMED_JPEG");
      if (marker === 0xe1 || marker === 0xed) fail("IMAGE_METADATA_PRESENT");
      p += length;
    }
    fail("MALFORMED_JPEG");
  }
  if (isPng(bytes)) {
    let p = 8,
      end = false;
    while (p + 12 <= bytes.length) {
      const length = u32(bytes, p);
      if (length > bytes.length - p - 12) fail("MALFORMED_PNG");
      const type = String.fromCharCode(...bytes.slice(p + 4, p + 8));
      if (["eXIf", "tEXt", "iTXt", "zTXt"].includes(type)) fail("IMAGE_METADATA_PRESENT");
      p += 12 + length;
      if (type === "IEND") {
        end = true;
        break;
      }
    }
    if (!end || p !== bytes.length) fail("MALFORMED_PNG");
    return;
  }
  if (isWebp(bytes)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (view.getUint32(4, true) + 8 !== bytes.length) fail("MALFORMED_WEBP");
    let p = 12;
    while (p < bytes.length) {
      if (p + 8 > bytes.length) fail("MALFORMED_WEBP");
      const type = String.fromCharCode(...bytes.slice(p, p + 4));
      const length = view.getUint32(p + 4, true);
      if (length > bytes.length - p - 8) fail("MALFORMED_WEBP");
      if (type === "EXIF" || type === "XMP ") fail("IMAGE_METADATA_PRESENT");
      p += 8 + length + (length & 1);
    }
    if (p !== bytes.length) fail("MALFORMED_WEBP");
    return;
  }
  fail();
}
export function isSupportedImageMime(mime: string): boolean {
  return [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
    "image/heic",
    "image/heif",
  ].includes(mime.toLowerCase());
}
