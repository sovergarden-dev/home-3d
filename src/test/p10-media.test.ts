import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Blob as NodeBlob } from "node:buffer";
import { assertNoMetadata } from "@/memories/metadata";
import {
  getImagePipelineDiagnostics,
  processPhoto,
  resetImagePipelineDiagnostics,
} from "@/memories/imagePipeline";
import {
  bindPostcardCapture,
  createPostcard,
  isAddressLike,
  shareOrDownload,
  wardWarning,
} from "@/memories/postcard";

const text = (value: string) => new TextEncoder().encode(value);
const raw = (...values: number[]) => new Uint8Array(values);
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};
const be16 = (n: number) => new Uint8Array([(n >>> 8) & 255, n & 255]);
const be32 = (n: number) =>
  new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
const le32 = (n: number) =>
  new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);

function jpeg(...segments: Uint8Array[]) {
  return concat(raw(0xff, 0xd8, 0xff), ...segments, raw(0xff, 0xd9));
}
function jpegSegment(marker: number, payload: Uint8Array) {
  return concat(new Uint8Array([0xff, marker]), be16(payload.length + 2), payload);
}
function pngChunk(type: string, payload: Uint8Array) {
  return concat(be32(payload.length), text(type), payload, new Uint8Array(4));
}
function png(...chunks: Uint8Array[]) {
  return concat(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks);
}
function webpChunk(type: string, payload: Uint8Array) {
  return concat(
    text(type),
    le32(payload.length),
    payload,
    payload.length % 2 ? new Uint8Array([0]) : new Uint8Array(),
  );
}
function webp(...chunks: Uint8Array[]) {
  const body = concat(text("WEBP"), ...chunks);
  return concat(text("RIFF"), le32(body.length), body);
}
function cleanPng(width = 1, height = 1) {
  return png(
    pngChunk("IHDR", concat(be32(width), be32(height), new Uint8Array([8, 2, 0, 0, 0]))),
    pngChunk("IDAT", new Uint8Array([0])),
    pngChunk("IEND", new Uint8Array()),
  );
}
function asBlob(bytes: Uint8Array, type: string) {
  return new NodeBlob([bytes], { type }) as unknown as Blob;
}

function installCanvas() {
  const contexts: Array<{ drawImage: ReturnType<typeof vi.fn> }> = [];
  const canvases: Array<{
    width: number;
    height: number;
    getContext: ReturnType<typeof vi.fn>;
    toBlob: ReturnType<typeof vi.fn>;
  }> = [];
  vi.stubGlobal("OffscreenCanvas", undefined);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    if (tag !== "canvas") return document.createElementNS("http://www.w3.org/1999/xhtml", tag);
    const context = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      measureText: vi.fn(() => ({
        width: 120,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: 120,
        actualBoundingBoxAscent: 20,
        actualBoundingBoxDescent: 4,
      })),
      imageSmoothingEnabled: true,
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((callback: (blob: Blob) => void) => callback(asBlob(cleanPng(), "image/png"))),
    };
    contexts.push(context);
    canvases.push(canvas);
    return canvas as unknown as HTMLCanvasElement;
  });
  return { contexts, canvases };
}

describe("assertNoMetadata", () => {
  it("accepts a well-formed JPEG with a clean APP0 segment", () => {
    expect(() => assertNoMetadata(jpeg(jpegSegment(0xe0, text("JFIF\0"))))).not.toThrow();
  });

  it("rejects JPEG APP1 Exif GPS sentinel and APP13 payloads", () => {
    const exifGps = concat(text("Exif\0\0"), text("GPS\0SENTINEL"));
    expect(() => assertNoMetadata(jpeg(jpegSegment(0xe1, exifGps)))).toThrow(
      "IMAGE_METADATA_PRESENT",
    );
    expect(() => assertNoMetadata(jpeg(jpegSegment(0xed, text("IPTC"))))).toThrow(
      "IMAGE_METADATA_PRESENT",
    );
    expect(() => assertNoMetadata(jpeg(jpegSegment(0xed, text("PHOTOSHOP"))))).toThrow(
      "IMAGE_METADATA_PRESENT",
    );
  });

  it("accepts PNG with IHDR, IDAT, and IEND only", () => {
    expect(() => assertNoMetadata(cleanPng())).not.toThrow();
  });

  it.each(["eXIf", "tEXt", "iTXt", "zTXt"])("rejects PNG %s metadata chunk", (type) => {
    const bytes = png(
      pngChunk("IHDR", concat(be32(1), be32(1), new Uint8Array([8, 2, 0, 0, 0]))),
      pngChunk(type, text("sentinel")),
      pngChunk("IDAT", new Uint8Array([0])),
      pngChunk("IEND", new Uint8Array()),
    );
    expect(() => assertNoMetadata(bytes)).toThrow("IMAGE_METADATA_PRESENT");
  });

  it("rejects WebP RIFF VP8 plus EXIF or XMP chunks", () => {
    const vp8 = webpChunk("VP8 ", new Uint8Array([1, 2, 3, 4]));
    expect(() => assertNoMetadata(webp(vp8, webpChunk("EXIF", text("GPS SENTINEL"))))).toThrow(
      "IMAGE_METADATA_PRESENT",
    );
    expect(() => assertNoMetadata(webp(vp8, webpChunk("XMP ", text("sentinel"))))).toThrow(
      "IMAGE_METADATA_PRESENT",
    );
  });

  it("rejects malformed JPEG, PNG, and WebP boundaries", () => {
    expect(() => assertNoMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 8, 1]))).toThrow(
      "MALFORMED_JPEG",
    );
    expect(() =>
      assertNoMetadata(
        concat(
          new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
          be32(20),
          text("IHDR"),
          new Uint8Array([0]),
        ),
      ),
    ).toThrow("MALFORMED_PNG");
    expect(() =>
      assertNoMetadata(
        concat(text("RIFF"), le32(4), text("WEBP"), text("VP8 "), le32(10), new Uint8Array([1])),
      ),
    ).toThrow("MALFORMED_WEBP");
    expect(() =>
      assertNoMetadata(concat(text("RIFF"), le32(4), text("WEBP"), new Uint8Array([1]))),
    ).toThrow("MALFORMED_WEBP");
  });
});

describe("processPhoto", () => {
  beforeEach(() => {
    resetImagePipelineDiagnostics();
    vi.stubGlobal("Blob", NodeBlob);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("rejects size bombs and unsupported media before decoding", async () => {
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    await expect(
      processPhoto(new Blob([new Uint8Array(25 * 1024 * 1024 + 1)], { type: "image/png" })),
    ).rejects.toThrow("PHOTO_TOO_LARGE");
    await expect(
      processPhoto(new Blob([new Uint8Array([1])], { type: "image/gif" })),
    ).rejects.toThrow("UNSUPPORTED_IMAGE_TYPE");
    expect(decode).not.toHaveBeenCalled();
  });

  it("closes a decoded bitmap when decoded dimensions exceed 40MP", async () => {
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 7000, height: 6000, close })),
    );
    await expect(processPhoto(asBlob(cleanPng(), "image/png"))).rejects.toThrow(
      "IMAGE_DIMENSIONS_INVALID",
    );
    expect(close).toHaveBeenCalledOnce();
    expect(getImagePipelineDiagnostics()).toMatchObject({ bitmapCreated: 1, bitmapClosed: 1 });
  });

  it("falls back when Firefox returns a zero-dimension ImageBitmap", async () => {
    installCanvas();
    vi.stubGlobal("FileReader", undefined);
    const close = vi.fn();
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(async () => ({ width: 0, height: 0, close })),
    );
    vi.stubGlobal(
      "Image",
      class {
        width = 3;
        height = 2;
        naturalWidth = 0;
        naturalHeight = 0;
        onload = () => {};
        onerror = () => {};
        set src(_: string) {
          queueMicrotask(() => this.onload());
        }
      },
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fallback");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});

    const result = await processPhoto(asBlob(cleanPng(), "image/png"));

    expect(result).toMatchObject({ width: 3, height: 2 });
    expect(close).toHaveBeenCalledOnce();
    expect(getImagePipelineDiagnostics()).toMatchObject({
      bitmapCreated: 1,
      bitmapClosed: 1,
      urlsCreated: 1,
      urlsRevoked: 1,
    });
  });
});

describe("postcard capture and sharing", () => {
  beforeEach(() => {
    vi.stubGlobal("Blob", NodeBlob);
    bindPostcardCapture(null);
    vi.useFakeTimers();
  });
  afterEach(() => {
    bindPostcardCapture(null);
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requires a bound capture callback and honors a pre-aborted signal", async () => {
    await expect(
      createPostcard({ ward: "Ward 1", date: "2026-01-01", minutes: 60 }),
    ).rejects.toThrow("CAPTURE_UNAVAILABLE");
    bindPostcardCapture(vi.fn());
    const controller = new AbortController();
    controller.abort();
    await expect(
      createPostcard({
        ward: "Ward 1",
        date: "2026-01-01",
        minutes: 60,
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("soft-detects address-like ward names", () => {
    expect(isAddressLike("12 Nguyen Trai")).toBe(true);
    expect(isAddressLike("Oak Avenue")).toBe(true);
    expect(isAddressLike("đường Láng")).toBe(true);
    expect(isAddressLike("PHỐ HUẾ")).toBe(true);
    expect(isAddressLike("ngõ 12")).toBe(true);
    expect(isAddressLike("số nhà 7")).toBe(true);
    expect(isAddressLike("HẺM 4 / NGÁCH 2")).toBe(true);
    expect(isAddressLike("Phường Dịch Vọng")).toBe(false);
    expect(isAddressLike("Đống Đa")).toBe(false);
    expect(isAddressLike("Ward 7")).toBe(false);
    expect(wardWarning("12 Nguyen Trai")).toBe("WARD_LOOKS_LIKE_ADDRESS");
    expect(wardWarning("Ward 7")).toBeNull();
  });

  it("uses the desktop 3840x2160 capture target", async () => {
    installCanvas();
    const image = { width: 1280, height: 720, close: vi.fn() };
    vi.stubGlobal(
      "Image",
      class {
        onload = () => {};
        onerror = () => {};
        set src(_: string) {
          queueMicrotask(() => this.onload());
        }
        naturalWidth = image.width;
        naturalHeight = image.height;
      },
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:scene");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const capture = vi.fn(async (width: number, height: number) => {
      expect([width, height]).toEqual([3532, 1506]);
      return asBlob(cleanPng(), "image/png");
    });
    bindPostcardCapture(capture);
    const result = await createPostcard({ ward: "Ward 7", date: "2026-01-01", minutes: 60 });
    expect(result).toMatchObject({ width: 3840, height: 2160, degraded: false });
    expect(capture).toHaveBeenCalledOnce();
  });

  it("uses the 2048x1152 mobile capture target", async () => {
    installCanvas();
    vi.stubGlobal(
      "Image",
      class {
        onload = () => {};
        onerror = () => {};
        set src(_: string) {
          queueMicrotask(() => this.onload());
        }
        naturalWidth = 1280;
        naturalHeight = 720;
      },
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:scene");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const capture = vi.fn(async (width: number, height: number) => {
      expect([width, height]).toEqual([1884, 804]);
      return asBlob(cleanPng(), "image/png");
    });
    bindPostcardCapture(capture);
    const result = await createPostcard({
      ward: "Ward 7",
      date: "2026-01-01",
      minutes: 60,
      mobile: true,
    });
    expect(result).toMatchObject({ width: 2048, height: 1152, degraded: false });
  });

  it("falls back with a long side no larger than the degraded target after capture failure", async () => {
    installCanvas();
    vi.stubGlobal(
      "Image",
      class {
        onload = () => {};
        onerror = () => {};
        set src(_: string) {
          queueMicrotask(() => this.onload());
        }
        naturalWidth = 1280;
        naturalHeight = 720;
      },
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:scene");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const capture = vi.fn(async (width: number, height: number) => {
      if (width === 3532) throw new Error("GPU_LIMIT");
      expect(Math.max(width, height)).toBeLessThanOrEqual(2048);
      return asBlob(cleanPng(), "image/png");
    });
    bindPostcardCapture(capture);
    const result = await createPostcard({ ward: "Ward 7", date: "2026-01-01", minutes: 60 });
    expect(result.degraded).toBe(true);
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(2048);
    expect(capture.mock.calls).toEqual([
      [3532, 1506],
      [1884, 804],
    ]);
  });

  it("downloads when canShare is false and eventually revokes the object URL", async () => {
    const click = vi.fn();
    vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
      tag === "a"
        ? ({ click, href: "", download: "" } as unknown as HTMLAnchorElement)
        : document.createElementNS("http://www.w3.org/1999/xhtml", tag),
    );
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:download");
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.stubGlobal("navigator", { canShare: () => false, share: vi.fn() });
    const result = await shareOrDownload({
      blob: asBlob(cleanPng(), "image/png"),
      width: 1,
      height: 1,
      degraded: false,
    });
    expect(result).toBe("downloaded");
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(revoke).toHaveBeenCalledWith("blob:download");
  });
});
