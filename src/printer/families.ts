// The printer families: one for each family of PrusaSlicer's configuration
// wizard (the CORE One and CORE One INDX are one family), and the Pro HT90.
// The colors are from the printers' drawings in Prusa Connect
// (frontend/public/img/printers).

export interface Family {
  id: string;
  label: string;
  // The frame, light to dark; the middle one is its base color, for Flat
  frame: [string, string, string];
  // The door's color: only the CORE family has a door
  door?: string;
  // The models that belong, as the integration reports the device's model
  models: RegExp;
}

export const FAMILIES: Family[] = [
  { id: "core", label: "CORE Family", frame: ["#5b5b5b", "#434242", "#2b2a29"], door: "#141619", models: /core/i },
  { id: "mini", label: "MINI Family", frame: ["#e2e3e3", "#c5c6c6", "#b2b3b3"], models: /mini/i },
  { id: "mk", label: "MK Family", frame: ["#4a4a49", "#2b2a29", "#1f1e1d"], models: /^\s*(original\s+prusa\s+)?(i3\s+)?mk/i },
  { id: "ht90", label: "Pro HT90", frame: ["#4f4f4f", "#2b2a29", "#1f1b20"], models: /ht\s*90/i },
  { id: "xl", label: "XL Family", frame: ["#4a4a4a", "#303030", "#232323"], models: /\bxl/i },
];

// The family ids in the style's options: the families, Custom (the frame and door given) and None (the theme's)
export const FAMILY_IDS = ["none", ...FAMILIES.map((f) => f.id), "custom"];
export const FAMILY_OPTIONS: [string, string][] = [["none", "None (theme)"], ...FAMILIES.map((f): [string, string] => [f.id, f.label]), ["custom", "Custom"]];

/** A printer model's family (none for a model of another family or vendor). */
export function familyOf(model?: string | null): string {
  const name = `${model ?? ""}`;
  return FAMILIES.find((f) => f.models.test(name))?.id ?? "none";
}
