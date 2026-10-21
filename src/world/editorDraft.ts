import type { Building, BuildingPart, RoadSegment, RoofType } from "./schema";

export type NumericDraft = string;
export type NumericState = "empty" | "zero" | "valid" | "nan" | "negative" | "out-of-range";

export interface NumericRule {
  min?: number;
  max?: number;
  integer?: boolean;
}

export function classifyNumericDraft(value: NumericDraft, rule: NumericRule = {}): NumericState {
  if (value.trim() === "") return "empty";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "nan";
  if (parsed < 0) return "negative";
  if (rule.integer && !Number.isInteger(parsed)) return "out-of-range";
  if (rule.min !== undefined && parsed < rule.min) return "out-of-range";
  if (rule.max !== undefined && parsed > rule.max) return "out-of-range";
  return parsed === 0 ? "zero" : "valid";
}

export function parseNumericDraft(value: NumericDraft, rule: NumericRule = {}): number | undefined {
  const state = classifyNumericDraft(value, rule);
  if (state !== "valid" && state !== "zero") return undefined;
  return Number(value);
}

export function fieldChanged<T extends object, K extends keyof T>(
  source: T,
  field: K,
  value: T[K],
): Partial<T> {
  return Object.is(source[field], value) ? {} : ({ [field]: value } as unknown as Partial<T>);
}

export function buildingPatch(
  source: Building,
  values: { wallHeight?: number; levels?: number; roofType?: RoofType },
) {
  return {
    ...fieldChanged(source, "wallHeight", values.wallHeight ?? source.wallHeight),
    ...fieldChanged(source, "levels", values.levels ?? source.levels),
    ...fieldChanged(source, "roofType", values.roofType ?? source.roofType),
  };
}

export function partPatch(
  source: BuildingPart,
  values: { wallHeight?: number; levels?: number; roofType?: RoofType },
) {
  return {
    ...(values.wallHeight === undefined
      ? {}
      : fieldChanged(source, "wallHeight", values.wallHeight)),
    ...fieldChanged(source, "levels", values.levels ?? source.levels),
    ...fieldChanged(source, "roofType", values.roofType ?? source.roofType),
  };
}

export function roadWidthPatch(source: RoadSegment, width: number) {
  return fieldChanged(source, "carriagewayWidth", width);
}
