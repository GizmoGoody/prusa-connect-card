// The card's style: the printer family's frame behind the card, and the
// door behind the title (the CORE One's).
import { darkMode, type Config, type HomeAssistant } from "../ha";
import { deviceOf } from "./device";
import { FAMILIES, FAMILY_IDS } from "./families";

export const DEFAULT_REFLECTIONS = 4242;
export const STYLE_KEYS = ["family", "frame", "door", "reflections", "status_bar"];

export interface StyleOptions {
  family: string;
  frame?: string;
  door?: string;
  reflections: number;
  status_bar: boolean;
}

/** The card's style options with their defaults: the printer's family, its own frame and door. */
export function styleOptions(config: Config | undefined, hass?: HomeAssistant): StyleOptions {
  const own: Config = config?.style && typeof config.style === "object" ? config.style : {};
  const family = FAMILY_IDS.includes(own.family) ? own.family : hass ? deviceOf(hass, config?.entity).profile.family : "none";
  return {
    family,
    frame: typeof own.frame === "string" && own.frame ? own.frame : undefined,
    door: typeof own.door === "string" && own.door ? own.door : undefined,
    reflections: Number.isFinite(own.reflections) ? own.reflections : DEFAULT_REFLECTIONS,
    status_bar: own.status_bar !== false,
  };
}

/** Whether a color reads as light (dark text on it); a color that is not #rrggbb reads as dark. */
export function isLight(hex?: string): boolean {
  if (!/^#[0-9a-f]{6}$/i.test(`${hex}`)) return false;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex!.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
}

// A color made lighter (amount above 0) or darker, as the frames' own shades are
const shade = (color: string, amount: number) => `color-mix(in srgb, ${color} ${100 - Math.abs(amount)}%, ${amount < 0 ? "#000" : "#fff"})`;

const LIGHT_TEXT = "--primary-text-color: rgba(255, 255, 255, .95); --secondary-text-color: rgba(235, 235, 240, .76)";
const DARK_TEXT = "--primary-text-color: rgba(0, 0, 0, .85); --secondary-text-color: rgba(40, 40, 48, .7)";
const DARK_EDGE = "inset 0 1px 0 rgba(255, 255, 255, .18), inset 0 0 0 1px rgba(255, 255, 255, .06), inset 0 3px 8px rgba(0, 0, 0, .6)";

export interface Door {
  glass: string;
  edge: string;
  text: string;
  ink: string;
  glare: number;
}

export interface Look {
  body: string;
  tone: "light" | "dark";
  flat: string;
  door?: Door;
}

/**
 * The look of a style: its frame (body, tone of the text on it and its base
 * color for Flat) and its door (glass, edge, the title's text on it, and a
 * number field's ink), or undefined for None. A door given adds a door to
 * any family; Custom has a door only when one is given.
 */
export function lookOf(style: StyleOptions, hass?: HomeAssistant): Look | undefined {
  if (style.family === "none") return undefined;
  const family = FAMILIES.find((f) => f.id === style.family);
  let body: string, tone: Look["tone"], flat: string;
  if (style.frame) {
    body = `linear-gradient(160deg, ${shade(style.frame, 25)} 0%, ${style.frame} 55%, ${shade(style.frame, -30)} 100%)`;
    tone = isLight(style.frame) ? "light" : "dark";
    flat = style.frame;
  } else if (family) {
    const [hi, mid, lo] = family.frame;
    body = `linear-gradient(160deg, ${hi} 0%, ${mid} 55%, ${lo} 100%)`;
    tone = isLight(mid) ? "light" : "dark";
    flat = mid;
  } else {
    // Custom without a frame: the theme's own card
    body = "var(--ha-card-background, var(--card-background-color, #fff))";
    tone = darkMode(hass) ? "dark" : "light";
    flat = body;
  }
  const doorColor = style.door ?? family?.door;
  const door = doorColor ? {
    glass: `linear-gradient(175deg, ${shade(doorColor, 12)} 0%, ${doorColor} 60%, ${shade(doorColor, -25)} 100%)`,
    edge: DARK_EDGE,
    text: isLight(doorColor) ? `${DARK_TEXT}; text-shadow: none` : `${LIGHT_TEXT}; text-shadow: 0 1px 2px rgba(0, 0, 0, .8)`,
    ink: isLight(doorColor) ? "rgba(0, 0, 0, .85)" : "rgba(255, 255, 255, .95)",
    glare: 0.5,
  } : undefined;
  return { body, tone, flat, door };
}

/** A seeded random number generator: the same seed, the same numbers. */
export function seeded(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let r = Math.imul(s ^ (s >>> 15), 1 | s);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The door's glass: a sheen along the top and two to four reflections
 * falling across it at an angle, their places from the reflections number
 * (Randomize reflections in the editor picks a new one).
 */
export function glassReflections(glare: number, pattern: number): string {
  const r = seeded(pattern);
  const white = (a: number) => `rgba(255, 255, 255, ${(a * glare).toFixed(3)})`;
  const angle = Math.round((r() < 0.5 ? 100 : 30) + r() * 50);
  const layers = [`linear-gradient(to bottom, ${white(0.3)} 0%, ${white(0.1)} 14%, transparent 42%)`];
  const count = 2 + Math.floor(r() * 3);
  for (let i = 0; i < count; i++) {
    const at = 4 + r() * 84, width = 3 + r() * 16, peak = 0.14 + r() * 0.26;
    const mid = (at + width / 2).toFixed(1), end = (at + width).toFixed(1), start = at.toFixed(1);
    layers.push(i === 0
      ? `linear-gradient(${angle}deg, transparent ${start}%, ${white(peak)} ${start}%, ${white(peak * 0.25)} ${end}%, transparent ${end}%)`
      : `linear-gradient(${angle}deg, transparent ${start}%, ${white(peak)} ${mid}%, transparent ${end}%)`);
  }
  return layers.join(", ");
}
