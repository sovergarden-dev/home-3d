import type { WorldSessionSnapshot } from "@/world/privateWorldSession";

export function centerMarkerLabels(
  mode: WorldSessionSnapshot["mode"],
  labels: {
    home: string;
    confirmedLocation: string;
    unmeasuredBoundary: string;
    emptyLot: string;
  },
) {
  const isPrivateWorld = mode === "private";
  return {
    title: isPrivateWorld ? labels.confirmedLocation : labels.home,
    description: isPrivateWorld ? labels.unmeasuredBoundary : labels.emptyLot,
  };
}
