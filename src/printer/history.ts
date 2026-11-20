// The history graph's lines: their colors and their names in the legend.
import { PALETTE } from "../const";
import { controlOf } from "./controls";
import type { Device } from "./device";

/** A color half way to the theme's background (#rrggbb). */
export function dim(hex: string, dark: boolean): string {
  const background = dark ? [17, 17, 17] : [255, 255, 255];
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${rgb.map((c, i) => Math.round((c + background[i]) / 2).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * The colors of the history's lines: each heater keeps one color of Prusa
 * Connect's palette, in its order, and its target the same color dimmed.
 * Past five heaters (an XL with five tools), the tools keep the five colors
 * and the bed and chamber take the text's tones.
 */
export function historyColors(ids: string[], dark: boolean): string[] {
  const palette = PALETTE[dark ? "dark" : "light"];
  const heaterOf = (id: string) => id.replace("_target_temperature", "_temperature");
  const heaters = [...new Set(ids.map(heaterOf))];
  const toneOf = (heater: string) => (heater === "bed_temperature" ? (dark ? "#e1e1e3" : "#1c1c1e") : dark ? "#9b9ea4" : "#5d6168");
  return ids.map((id) => {
    const heater = heaterOf(id);
    const at = heaters.length <= 5 ? heaters.indexOf(heater) : heaters.filter((h) => h.startsWith("tool_")).indexOf(heater);
    const color = at >= 0 ? palette[at % palette.length] : toneOf(heater);
    return id === heater ? color : dim(color, dark);
  });
}

/** A heater's short name in the legend: Nozzle (Nozzle 2 with several tools), Bed, Chamber, and "target" after a target. */
export function historyName(id: string, device: Device): string {
  const tool = controlOf(id)?.tool;
  const heater = tool !== undefined ? `Nozzle${device.tools.length > 1 ? ` ${tool}` : ""}` : id.startsWith("bed") ? "Bed" : "Chamber";
  return /_target_temperature$/.test(id) ? `${heater} target` : heater;
}
