import type { PrusaElement } from "./base";
import { PrusaCameras } from "./cameras";
import { PrusaHistory } from "./history";
import { PrusaMovement, PrusaNozzles, PrusaPrint, PrusaTemperatures, PrusaUtilities } from "./keyed";
import { PrusaLights } from "./lights";

export { PrusaCameras, PrusaHistory, PrusaLights, PrusaMovement, PrusaNozzles, PrusaPrint, PrusaTemperatures, PrusaUtilities };

// The features, in the order Home Assistant's feature picker lists them
export const FEATURES: Record<string, typeof PrusaElement> = Object.fromEntries([
  PrusaPrint, PrusaTemperatures, PrusaHistory, PrusaNozzles, PrusaMovement, PrusaLights, PrusaUtilities, PrusaCameras,
].map((feature) => [feature.type, feature]));
export const FEATURE_TAGS = Object.keys(FEATURES);

// The features that are tall (a picture, a graph), and whether each takes both columns by default
export const TALL_FEATURES: Record<string, boolean> = { [`custom:${PrusaCameras.type}`]: true, [`custom:${PrusaHistory.type}`]: false };
