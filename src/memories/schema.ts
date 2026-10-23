import { z } from "zod";

export const MAX_DOCUMENT_BYTES = 64 * 1024 * 1024;
const finite = z.number().finite();
const tuple3 = z.tuple([finite, finite, finite]);
const strictObject = <T extends z.ZodRawShape>(shape: T) => z.object(shape).strict();
const imageDataUrl = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]*={0,2}$/;
const audioDataUrl = /^data:audio\/(?:wav|x-wav|ogg|mp4|mpeg|webm);base64,[A-Za-z0-9+/]*={0,2}$/;
const isoDate = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split("-").map(Number);
  const year = parts[0] as number;
  const month = parts[1] as number;
  const day = parts[2] as number;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}, "Invalid calendar date");

export const CameraPoseSchema = strictObject({
  mode: z.enum(["diorama", "topdown"]),
  target: tuple3,
  yaw: finite.min(-Math.PI * 2).max(Math.PI * 2),
  pitch: finite.min(0.08).max(Math.PI / 2 - 0.02),
  distance: finite.min(4).max(800),
  zoom: finite.min(0.1).max(8),
});
export type CameraPose = z.infer<typeof CameraPoseSchema>;

export const PhotoSchema = strictObject({
  id: z.string().min(1).max(128),
  dataUrl: z.string().regex(imageDataUrl),
  thumbnail: z.string().regex(imageDataUrl),
  placeholder: z.string().regex(imageDataUrl).max(1024),
  width: z.number().int().finite().min(1).max(32768),
  height: z.number().int().finite().min(1).max(32768),
  reviewed: z.boolean(),
});
export type Photo = z.infer<typeof PhotoSchema>;
const audioSchema = strictObject({
  dataUrl: z.string().regex(audioDataUrl).max(2_800_000),
  duration: finite.min(0).max(60),
  mime: z.enum(["audio/wav", "audio/x-wav", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/webm"]),
}).refine(
  (audio) => audio.dataUrl.startsWith(`data:${audio.mime};base64,`),
  "Audio MIME does not match data URL",
);
export const AudioSchema = audioSchema;
export type Audio = z.infer<typeof audioSchema>;
export const MemorySchema = strictObject({
  id: z.string().uuid(),
  title: z.string().max(80),
  body: z.string().max(2000),
  position: tuple3,
  camera: CameraPoseSchema,
  date: isoDate,
  time: z.number().int().min(0).max(1439).optional(),
  preset: z.enum(["everyday", "family", "milestone"]),
  tags: z.array(z.string().max(20)).max(5),
  photos: z.array(PhotoSchema).max(6),
  audio: audioSchema.optional(),
  visibility: z.enum(["private", "public"]),
});
export type Memory = z.infer<typeof MemorySchema>;
export const JournalEntrySchema = strictObject({
  id: z.string().uuid(),
  date: isoDate,
  stage: z.enum(["land", "foundation", "frame", "walls", "roof", "interior", "home"]),
  body: z.string().max(2000),
  photos: z.array(PhotoSchema).max(6),
});
export type JournalEntry = z.infer<typeof JournalEntrySchema>;
export const DocumentSchema = strictObject({
  schemaVersion: z.literal(1),
  memories: z.array(MemorySchema).max(300),
  journal: z.array(JournalEntrySchema).max(300),
});
export type MemoryDocument = z.infer<typeof DocumentSchema>;

export function parseMemoryDocument(value: unknown): MemoryDocument {
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  const result = DocumentSchema.parse(parsed);
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > MAX_DOCUMENT_BYTES)
    throw new Error("DOCUMENT_TOO_LARGE");
  return result;
}
export function publicDocument(document: MemoryDocument): MemoryDocument {
  return {
    schemaVersion: 1,
    memories: document.memories
      .filter(
        (memory) =>
          memory.visibility === "public" && memory.photos.every((photo) => photo.reviewed),
      )
      .map((memory) => {
        const { audio: _privateAudio, ...publicMemory } = memory;
        return {
          ...publicMemory,
          photos: memory.photos.filter((photo) => photo.reviewed),
        };
      }),
    journal: [],
  };
}
export function serializeDocument(document: MemoryDocument, publicOnly = false): string {
  const value = publicOnly ? publicDocument(document) : document;
  const text = JSON.stringify(value);
  if (new TextEncoder().encode(text).byteLength > MAX_DOCUMENT_BYTES)
    throw new Error("DOCUMENT_TOO_LARGE");
  return text;
}
