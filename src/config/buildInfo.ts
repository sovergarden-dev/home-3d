import { version } from "../../package.json";
import { normalizeBuildSha } from "./buildSha";
export { normalizeBuildSha } from "./buildSha";

export const PUBLIC_BUILD_VERSION = `v${version}`;

export const BUILD_SHA = normalizeBuildSha(import.meta.env["VITE_BUILD_SHA"]);
