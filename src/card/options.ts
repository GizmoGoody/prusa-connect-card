// The card's own options: their values, defaults, checks, and the tile
// card's options as the card passes them on.
import { ENABLED_COLOR } from "../const";
import { same, type Config, type HomeAssistant } from "../ha";
import { deviceOf, type Device } from "../printer/device";
import { FAMILY_IDS } from "../printer/families";
import { DEFAULT_REFLECTIONS, lookOf, STYLE_KEYS, styleOptions } from "../printer/look";

// The same keys and values as the xTool, SVS and Lampster cards
export const FEATURES_STYLES: [string, string][] = [["match", "Match style"], ["flat", "Flat"], ["console", "Console"]];
export const DEFAULT_FEATURES_STYLE = "console";
// How far a features style's patch or channel reaches around each control (px)
export const CHANNEL_PAD: Record<string, number> = { match: 0, flat: 2, console: 3 };

// Each status the status badge can show: [id, label, whether the printer has it]
const STATUS_BADGES: [string, string, (device: Device) => boolean][] = [
  ["active_tool", "Active tool", (device) => device.tools.length > 1],
  ["server_update", "Prusa Connect update available", (device) => !!device.roles.server],
];
const DEFAULT_STATUS_BADGES = ["active_tool", "server_update"];
export const statusBadgesOf = (hass: HomeAssistant | undefined, entityId?: string) => {
  const device = deviceOf(hass, entityId);
  return STATUS_BADGES.filter(([, , has]) => has(device));
};
export const defaultStatusBadges = (hass: HomeAssistant | undefined, entityId?: string): string[] =>
  DEFAULT_STATUS_BADGES.filter((id) => statusBadgesOf(hass, entityId).some(([badge]) => badge === id));

export const EDGES: [string, string][] = [["none", "None"], ["top", "Top"], ["bottom", "Bottom"], ["left", "Left"], ["right", "Right"], ["around", "Around the card"]];
export const DIRECTIONS: [string, string][] = [["clockwise", "Clockwise"], ["counterclockwise", "Counterclockwise"]];
export const SHOW_WHILE: [string, string][] = [["printing", "Printing"], ["paused", "Paused"], ["attention", "Attention"], ["finished", "Finished"], ["error", "Error"]];
export const PROGRESS_DEFAULTS: Config = {
  edge: "top", thickness: 4, starts_at: 0, ends_at: 100, direction: "clockwise", color: "state",
  show_percentage: false, show_while: ["printing", "paused"],
};
export const progressOptions = (config?: Config): Config => ({ ...PROGRESS_DEFAULTS, ...(config?.progress_edge ?? {}) });

// Options this card adds to the tile card's
export const OWN_KEYS = ["style", "features_style", "enabled_color", "status_badge", "connection_badge", "progress_edge", "collapsible",
  "expanded_at_load", "expand_when_job_starts", "collapse_when_job_ends", "last_feature_full_width"];
export const DEFAULT_FEATURES_POSITION = "inline";
// The printer's name (its device's), not the State sensor's
const DEFAULT_NAME = { type: "device" };
const DEFAULT_STATE_CONTENT = ["state", "progress", "time_remaining"];

/** Check the card's own options; a wrong one throws, with what is wrong. */
export function checkConfig(config: Config): void {
  if (!config?.entity) throw new Error("Choose a printer: its State sensor from the Prusa Connect integration");
  if (config.style !== undefined && (typeof config.style !== "object" || Array.isArray(config.style))) {
    throw new Error("style must be a set of options, such as family: core");
  }
  if (config.style?.family !== undefined && !FAMILY_IDS.includes(config.style.family)) throw new Error(`Unknown style family: ${config.style.family}`);
  if (config.features_style !== undefined && !FEATURES_STYLES.some(([id]) => id === config.features_style)) {
    throw new Error(`Unknown features_style: ${config.features_style}`);
  }
  if (config.progress_edge !== undefined && (typeof config.progress_edge !== "object" || Array.isArray(config.progress_edge))) {
    throw new Error("progress_edge must be a set of options, such as edge: top");
  }
  const edge = progressOptions(config).edge;
  if (!EDGES.some(([id]) => id === edge)) throw new Error(`Unknown progress edge: ${edge}`);
}

/** The tile card's own options (as its editor shows them), with the card's defaults. */
export function tileConfig(config: Config): Config {
  const tile: Config = { ...config, type: "tile" };
  for (const key of OWN_KEYS) delete tile[key];
  delete tile.show_entity_picture;
  tile.features_position ??= DEFAULT_FEATURES_POSITION;
  tile.name ??= DEFAULT_NAME;
  tile.state_content ??= DEFAULT_STATE_CONTENT;
  return tile;
}

/**
 * The tile card inside the card: with Collapsible, a tap on the card shows
 * or hides the features instead of its Tap behavior, and the features below
 * the title are left out while they are hidden.
 */
export function innerTileConfig(config: Config, open: boolean): Config {
  const tile = tileConfig(config);
  if (config.collapsible !== false) {
    tile.tap_action = { action: "fire-dom-event", prusa_connect_card: "toggle" };
    if (!open) tile.features = tile.features_position === "inline" ? (config.features ?? []).slice(0, 1) : [];
  }
  return tile;
}

/**
 * The configuration as the editor saves it: every option at its default
 * left out (the card applies the default), and the options that matter only
 * with a style, a door or a collapsible card left out without one.
 */
export function minimal(config: Config, hass?: HomeAssistant): Config {
  const c: Config = { ...config };
  if (c.style && typeof c.style === "object" && !Array.isArray(c.style)) {
    const own: Config = { ...c.style };
    if (!FAMILY_IDS.includes(own.family) || (hass && own.family === deviceOf(hass, c.entity).profile.family)) delete own.family;
    for (const key of ["frame", "door"]) {
      if (typeof own[key] !== "string" || !own[key].trim()) delete own[key];
      else own[key] = own[key].trim();
    }
    const door = hass ? !!lookOf(styleOptions({ ...c, style: own }, hass), hass)?.door : true;
    if (!door || !Number.isFinite(own.reflections) || own.reflections === DEFAULT_REFLECTIONS) delete own.reflections;
    if (!door || own.status_bar !== false) delete own.status_bar;
    for (const key of Object.keys(own)) if (!STYLE_KEYS.includes(key)) delete own[key];
    if (Object.keys(own).length) c.style = own;
    else delete c.style;
  } else {
    delete c.style;
  }
  const styled = hass ? !!lookOf(styleOptions(c, hass), hass) : true;
  if (!styled || c.features_style === DEFAULT_FEATURES_STYLE || !FEATURES_STYLES.some(([id]) => id === c.features_style)) delete c.features_style;
  if (!c.enabled_color || c.enabled_color === ENABLED_COLOR) delete c.enabled_color;
  if (!Array.isArray(c.status_badge) || (hass && same(c.status_badge, defaultStatusBadges(hass, c.entity)))) delete c.status_badge;
  if (c.connection_badge !== false) delete c.connection_badge;
  if (c.progress_edge && typeof c.progress_edge === "object") {
    const edge = Object.fromEntries(Object.entries(c.progress_edge).filter(([key, value]) => !same(value, PROGRESS_DEFAULTS[key])));
    if (Object.keys(edge).length) c.progress_edge = edge;
    else delete c.progress_edge;
  }
  if (c.collapsible !== false) delete c.collapsible;
  if (c.collapsible === false || c.expanded_at_load !== true) delete c.expanded_at_load;
  for (const key of ["expand_when_job_starts", "collapse_when_job_ends"]) if (c.collapsible === false || c[key] !== false) delete c[key];
  if (c.last_feature_full_width !== false || (c.features_position ?? DEFAULT_FEATURES_POSITION) !== "inline") delete c.last_feature_full_width;
  if (c.features_position === DEFAULT_FEATURES_POSITION) delete c.features_position;
  if (same(c.name, DEFAULT_NAME)) delete c.name;
  if (c.vertical === false) delete c.vertical;
  if (same(c.state_content, DEFAULT_STATE_CONTENT)) delete c.state_content;
  if (Array.isArray(c.features) && !c.features.length) delete c.features;
  return c;
}
