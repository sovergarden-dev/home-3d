import application from "../.output/server/index.mjs";
import { createPrivateWorker } from "../src/private/worker.server";

export default createPrivateWorker(application);
