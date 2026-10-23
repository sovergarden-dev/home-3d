import { describe, expect, it } from "vitest";
import { readImageDimensions } from "@/memories/imagePipeline";
function webp(kind: string) {
  const bytes = new Uint8Array(48);
  bytes.set(new TextEncoder().encode("RIFF"));
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  bytes.set(new TextEncoder().encode(kind), 12);
  return bytes;
}
describe("P10 WebP preflight uses codec header offsets, not compressed pixels", () => {
  it("VP8 reads immediately after the three-byte frame signature", () => {
    const bytes = webp("VP8 ");
    bytes.set([0x9d, 1, 0x2a], 23);
    const view = new DataView(bytes.buffer);
    view.setUint16(26, 80, true);
    view.setUint16(28, 40, true);
    bytes.fill(0xff, 30);
    expect(readImageDimensions(bytes, "image/webp")).toEqual({ width: 80, height: 40 });
  });
  it("VP8L reads the signature at chunk payload start and its packed dimensions", () => {
    const bytes = webp("VP8L");
    bytes[20] = 0x2f;
    new DataView(bytes.buffer).setUint32(21, (80 - 1) | ((40 - 1) << 14), true);
    expect(readImageDimensions(bytes, "image/webp")).toEqual({ width: 80, height: 40 });
  });
  it("VP8X retains its 24-bit little endian canvas dimensions", () => {
    const bytes = webp("VP8X");
    bytes[24] = 79;
    bytes[27] = 39;
    expect(readImageDimensions(bytes, "image/webp")).toEqual({ width: 80, height: 40 });
  });
  it("does not invent dimensions from a truncated frame signature", () => {
    const bytes = webp("VP8 ");
    bytes.set([0x9d, 1, 0x2a], 23);
    expect(readImageDimensions(bytes.slice(0, 26), "image/webp")).toEqual({ width: 0, height: 0 });
  });
});
