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
    temporaryLotIllustration: string;
  },
  centerConfirmation?: unknown,
  showTemporaryLotIllustration = false,
) {
  const isOwnerWorld = mode === "home" || mode === "private";
  const pointStatus = isOwnerWorld ? ownerPointStatus(centerConfirmation) : undefined;
  const markerLabels = {
    title: !isOwnerWorld
      ? labels.home
      : pointStatus === "confirmed"
        ? labels.confirmedLocation
        : pointStatus === "provisionally-accepted"
          ? labels.provisionallyAcceptedCenter
          : labels.referencePoint,
    description: isOwnerWorld ? labels.unmeasuredBoundary : labels.emptyLot,
  };
  if (mode === "private" && showTemporaryLotIllustration) {
    return { ...markerLabels, illustration: labels.temporaryLotIllustration };
  }
  return markerLabels;
}
