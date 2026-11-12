import type { PrivateWorldSessionSnapshot, WorldSessionSnapshot } from "./privateWorldSession";
import { HOME_CENTER_CONFIRMATION, HOME_GEOREFERENCE, HOME_NEIGHBORHOOD } from "./homeNeighborhood";

type HomeWorldSnapshot = Extract<WorldSessionSnapshot, { mode: "home" }>;
type HomeWorldListener = (snapshot: WorldSessionSnapshot) => void;

const snapshot: HomeWorldSnapshot = Object.freeze({
  mode: "home",
  revision: 0,
  packageEpoch: 0,
  temporaryLotIllustrationSelected: false,
  loading: false,
  dirty: false,
  world: HOME_NEIGHBORHOOD,
  centerConfirmation: HOME_CENTER_CONFIRMATION,
});

const listeners = new Set<HomeWorldListener>();

export const homeWorldSession = {
  getSnapshot: (): WorldSessionSnapshot => snapshot,
  subscribe(listener: HomeWorldListener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getPackageEpoch: () => snapshot.packageEpoch,
  getGeoreference: () => ({ origin: { ...HOME_GEOREFERENCE.origin } }),
  async getMemoryWorldKey() {
    return `fixed-home:${snapshot.world.manifest.datasetRevision}`;
  },
};
