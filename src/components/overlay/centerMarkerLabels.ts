import type { WorldSessionSnapshot } from "@/world/privateWorldSession";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ownerPointStatus(value: unknown): "confirmed" | "provisionally-accepted" | undefined {
  if (
    !isRecord(value) ||
    (value["status"] !== "confirmed" && value["status"] !== "provisionally-accepted")
  ) {
    return undefined;
  }
  const provenance = value["provenance"];
  const hasOwnerProvenance =
    isRecord(provenance) &&
    provenance["source"] === "owner" &&
    provenance["method"] === "explicit-user-confirmation";
  return hasOwnerProvenance ? value["status"] : undefined;
}

export function centerMarkerLabels(
  mode: WorldSessionSnapshot["mode"],
  labels: {
    home: string;
    confirmedLocation: string;
    provisionallyAcceptedCenter: string;
    referencePoint: string;
    unmeasuredBoundary: string;
    emptyLot: string;
  },
  centerConfirmation?: unknown,
) {
  const isPrivateWorld = mode === "private";
  const pointStatus = isPrivateWorld ? ownerPointStatus(centerConfirmation) : undefined;
  return {
    title: !isPrivateWorld
      ? labels.home
      : pointStatus === "confirmed"
        ? labels.confirmedLocation
        : pointStatus === "provisionally-accepted"
          ? labels.provisionallyAcceptedCenter
          : labels.referencePoint,
    description: isPrivateWorld ? labels.unmeasuredBoundary : labels.emptyLot,
  };
}
