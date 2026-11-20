/**
 * Prusa Connect dashboard card and tile features.
 *
 * For the prusa_connect integration (Prusa Connect, on premise). The card
 * and its features follow the xTool card's design: Home Assistant's tile
 * card, wrapped, with features that work in any tile card for a printer.
 *
 * Tile features (each a section of the printer's page in Prusa Connect):
 * - custom:prusa-print         Pause print, Resume print, Stop print, and the job's read-outs
 * - custom:prusa-temperatures  each heater's reading, its target (a field), or both as one
 *                              control; the chamber fan; presets; cool down
 * - custom:prusa-history       Home Assistant's history graph of the temperatures, in
 *                              Prusa Connect's chart palette
 * - custom:prusa-nozzles       one row for each tool: material, nozzle, active, fan speeds
 * - custom:prusa-movement      print speed and flow (fields), X, Y and Z, home, disable steppers
 * - custom:prusa-lights        the chamber light's icon and brightness slider
 * - custom:prusa-utilities     beep and reset printer
 * - custom:prusa-cameras       a camera, Home Assistant's own image, with keys to switch and
 *                              a crop set with two taps (kept for the session only)
 *
 * Some controls are not offered by the integration yet (see PENDING). The
 * card is ready for them: they show once the integration adds their
 * entities. The request for them:
 * https://github.com/prusa3d/prusa-connect-homeassistant/issues/14
 *
 * custom:prusa-connect-card is Home Assistant's tile card, wrapped. It adds:
 * - the state's icon in its color in place of the entity's icon,
 * - a status badge (the active tool, a server update) and a connection badge,
 * - a progress edge along one side of the card, or around it,
 * - an optional style: the printer family's frame behind the card, and the
 *   door behind the title (the CORE One's), which can light up as the
 *   printer's RGB status bar does,
 * - an option to collapse the card to its title row, following the job,
 * - every sensor of the printer as an attribute for State content.
 *
 * The file is in sections:
 * - Shared helpers: colors, events, the states context.
 * - Registry: ROLES and TOOL_KEYS (where each entity is found) and CONTROLS
 *   (how each control works).
 * - Device model: deviceOf(hass, entityId), built once for each version of
 *   Home Assistant's entity and device registries.
 * - Styles: the printer families.
 * - Feature base: KINDS, PrusaElement and PrusaFeature.
 * - Features, the card, and the editors.
 */

const VERSION = "prototype";
const DOMAIN = "prusa_connect";
const CARD_TYPE = "prusa-connect-card";
const EDITOR_TYPE = "prusa-connect-card-editor";
const TILE_EDITOR_TYPE = "prusa-connect-tile-card-editor";
// The request for the controls the integration does not offer yet
const PENDING_URL = "https://github.com/prusa3d/prusa-connect-homeassistant/issues/14";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const domainOf = (entityId) => entityId.split(".")[0];

/** Whether a switch, light or fan is on. */
const isOn = (stateObj) => stateObj?.state === "on";

const fire = (el, type, detail) =>
  el.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));

const select = (options, extra = {}) => ({ select: { mode: "dropdown", options: options.map(([value, label]) => ({ value, label })), ...extra } });

/** Whether a state is known: neither unknown nor unavailable. */
const known = (stateObj) => !!stateObj && !["unknown", "unavailable"].includes(stateObj.state);

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

// Home Assistant's named colors (the tile card's color picker)
const HA_COLORS = [
  "primary", "accent", "red", "pink", "purple", "deep-purple", "indigo", "blue", "light-blue", "cyan",
  "teal", "green", "light-green", "lime", "yellow", "amber", "orange", "deep-orange", "brown",
  "light-grey", "grey", "dark-grey", "blue-grey", "black", "white", "disabled",
  "error", "warning", "success", "info",
];
const STATE_FALLBACKS = { error: "red", warning: "amber", success: "green", info: "blue" };
const cssColor = (color) => (STATE_FALLBACKS[color] ? `var(--${color}-color, var(--${STATE_FALLBACKS[color]}-color))`
  : HA_COLORS.includes(color) ? `var(--${color}-color)` : color);
const STATE_COLORS = [["error", "Error"], ["warning", "Warning"], ["success", "Success"], ["info", "Info"]]
  .map(([value, label]) => ({ value, label, display_color: cssColor(value) }));
// One color for every key that is on and every slider, across the card
const ENABLED_COLOR = "info";
const ENABLED = `var(--prusa-enabled-color, ${cssColor(ENABLED_COLOR)})`;

// The printer's states (the State sensor's options), each with its color and
// icon; Printing in Prusa orange
const PRINTER_STATES = {
  idle: { color: "#9aa0a6", icon: "mdi:sleep" },
  ready: { color: "#3fbf6a", icon: "mdi:check-circle-outline" },
  busy: { color: "#29a3e0", icon: "mdi:progress-clock" },
  printing: { color: "#fa6831", icon: "mdi:printer-3d-nozzle" },
  paused: { color: "#f5a623", icon: "mdi:pause" },
  attention: { color: "#ffb74d", icon: "mdi:alert" },
  finished: { color: "#3fbf6a", icon: "mdi:check-bold" },
  stopped: { color: "#8a8a8a", icon: "mdi:stop" },
  error: { color: "#ef5350", icon: "mdi:alert-circle" },
  off: { color: "#616161", icon: "mdi:printer-3d-off" },
};
// The states of a job under way: it can be paused, resumed or stopped
const JOB_PHASES = ["printing", "paused", "attention"];

/**
 * Prusa Connect's chart palette (primary, info, success, warning,
 * destructive), for the light and the dark theme, and its heating and
 * cooling tints (see heaterState).
 */
const PALETTE = {
  light: ["#fd5000", "#547aeb", "#008257", "#443c21", "#cc2e39"],
  dark: ["#fd5000", "#547aeb", "#71c7a2", "#fbd23c", "#ff8f8b"],
};
const HEAT_TINTS = {
  light: { heating: "#443c21", cooling: "#4466d0" },
  dark: { heating: "#fbd23c", cooling: "#93b4ff" },
};

/**
 * Text that reads on a filled button: dark on a light color, white on a dark
 * one. Null while the element is not on the page.
 */
let colorProbe;
let textColors = new WeakMap();
const colorsChanged = () => (textColors = new WeakMap());
function textOn(el, cssValue) {
  if (!el.isConnected) return null;
  let found = textColors.get(el);
  if (!found) textColors.set(el, (found = new Map()));
  if (!found.has(cssValue)) found.set(cssValue, textColorOf(el, cssValue));
  return found.get(cssValue);
}

function textColorOf(el, cssValue) {
  const root = el.shadowRoot ?? el;
  let probe = root.querySelector(":scope > .color-probe");
  if (!probe) {
    probe = document.createElement("span");
    probe.className = "color-probe";
    probe.hidden = true;
    root.append(probe);
  }
  probe.style.color = "";
  probe.style.color = cssValue;
  const resolved = getComputedStyle(probe).color;
  if (!resolved) return null;
  colorProbe ??= document.createElement("canvas").getContext("2d");
  colorProbe.fillStyle = "#000";
  colorProbe.fillStyle = resolved;
  const value = colorProbe.fillStyle;
  const rgb = value.startsWith("#")
    ? value.slice(1).match(/../g).map((h) => parseInt(h, 16))
    : (value.match(/[\d.]+/g) ?? [0, 0, 0]).map(Number);
  const luma = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luma > 0.6 ? "rgba(0, 0, 0, .85)" : "#fff";
}

// The tile card's Time format choices (its time_format option)
const TIME_FORMATS = ["relative", "total", "date", "time", "datetime"];

/** The Prusa Connect card a feature is in, if any. */
function cardOf(el) {
  for (let node = el.getRootNode?.()?.host; node; node = node.getRootNode?.()?.host) {
    if (node.localName === CARD_TYPE) return node;
  }
  return undefined;
}

/**
 * Answers Home Assistant's "states" context inside an element, as Home
 * Assistant's own provider does (the Lit context protocol), with the states
 * the card changed, so the tile card editor's State content picker sees the
 * card's attributes.
 */
class StatesProvider {
  constructor(host) {
    this._unsubscribes = new Map();
    this._waiting = [];
    host.addEventListener("context-request", (ev) => {
      if (ev.context !== "states") return;
      ev.stopPropagation();
      if (this._states === undefined) this._waiting.push(ev);
      else this._answer(ev);
    });
  }

  _answer(ev) {
    if (!ev.subscribe) {
      ev.callback(this._states);
      return;
    }
    const unsubscribe = () => this._unsubscribes.delete(ev.callback);
    this._unsubscribes.set(ev.callback, unsubscribe);
    ev.callback(this._states, unsubscribe);
  }

  set states(states) {
    if (states === this._states) return;
    this._states = states;
    for (const ev of this._waiting.splice(0)) this._answer(ev);
    for (const [callback, unsubscribe] of this._unsubscribes) callback(states, unsubscribe);
  }
}

// ---------------------------------------------------------------------------
// Registry: the printer's entities, by role
// ---------------------------------------------------------------------------

/**
 * The printer's own entities: [translation key, domains]. A role's id is its
 * translation key in the integration. Those in PENDING are not offered by
 * the integration yet; the card finds them by these keys once it does.
 */
const ROLES = {
  state: ["sensor"],
  progress: ["sensor"],
  time_remaining: ["sensor"],
  time_printing: ["sensor"],
  finish_time: ["sensor"],
  job_name: ["sensor"],
  bed_temperature: ["sensor"],
  bed_target_temperature: ["number"],
  chamber_temperature: ["sensor"],
  chamber_target_temperature: ["number"],
  chamber_fan: ["fan"],
  chamber_light: ["light"],
  axis_x: ["sensor"],
  axis_y: ["sensor"],
  axis_z: ["sensor"],
  speed: ["number"],
  flow: ["number"],
  pause: ["button"],
  resume: ["button"],
  stop: ["button"],
  home: ["button"],
  disable_steppers: ["button"],
  beep: ["button"],
  reset_printer: ["button"],
};

// Each tool's entities: [translation key, domains]. Each is the role
// "tool_<n>_<key>", n counted from 1 as the printer's screen counts.
const TOOL_KEYS = {
  nozzle_temperature: ["sensor"],
  nozzle_target_temperature: ["number"],
  material: ["sensor"],
  nozzle_diameter: ["sensor"],
  print_fan_speed: ["sensor"],
  heatbreak_fan_speed: ["sensor"],
  active: ["binary_sensor"],
  nozzle_high_flow: ["binary_sensor"],
  nozzle_hardened: ["binary_sensor"],
};

// The controls the integration does not offer yet (see PENDING_URL)
const PENDING = [
  "chamber_temperature", "chamber_target_temperature", "chamber_temperature_and_target", "chamber_fan",
  "chamber_light", "chamber_light_brightness", "flow", "home", "disable_steppers", "beep", "reset_printer",
];

// ---------------------------------------------------------------------------
// Device model: the printer and its entities, found once
// ---------------------------------------------------------------------------

// The integration's entities of each device, rebuilt when Home Assistant's entity list changes
const byDeviceCache = new WeakMap();
function deviceEntities(hass, device) {
  const entities = hass?.entities;
  if (!entities || !device) return [];
  let byDevice = byDeviceCache.get(entities);
  if (!byDevice) {
    byDevice = new Map();
    for (const e of Object.values(entities)) {
      if (e.platform !== DOMAIN || !e.device_id) continue;
      if (!byDevice.has(e.device_id)) byDevice.set(e.device_id, []);
      byDevice.get(e.device_id).push(e);
    }
    byDeviceCache.set(entities, byDevice);
  }
  return byDevice.get(device) ?? [];
}

/**
 * A tool entity's number, counted from 1. Home Assistant does not hand the
 * frontend the entity's unique id (where the integration keeps the tool),
 * so it is read from the entity id the integration gave it (..._tool_2_...),
 * then from its name (Tool 2 ...), and undefined when neither says.
 */
function toolNumber(hass, e) {
  const fromId = e.entity_id.match(/_tool_(\d+)_/);
  if (fromId) return Number(fromId[1]);
  const name = hass.states[e.entity_id]?.attributes.friendly_name ?? "";
  const fromName = name.match(/\bTool (\d+)\b/i);
  return fromName ? Number(fromName[1]) : undefined;
}

/** A camera's id in the card's options: its name, in snake case (Camera Chamber: chamber). */
function cameraId(hass, entityId) {
  const name = hass.states[entityId]?.attributes.friendly_name ?? entityId.split(".")[1];
  const own = name.match(/\bCamera (.+)$/i)?.[1] ?? name;
  return own.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

/** The model of a printer's device, from Home Assistant's registries (see deviceOf). */
function buildDevice(hass, id) {
  const device = hass.devices?.[id];
  const own = deviceEntities(hass, id);
  // The integration's server is the printer's hub: its update entity and the cameras Prusa Connect has not placed on a printer
  const hub = device?.via_device_id;
  const hubEntities = deviceEntities(hass, hub);
  const roles = {};
  for (const [key, domains] of Object.entries(ROLES)) {
    const found = own.find((e) => e.translation_key === key && domains.includes(domainOf(e.entity_id)));
    if (found) roles[key] = found.entity_id;
  }
  // The connectivity sensor has no translation key: it is the one binary sensor of its class
  const connected = own.find((e) => domainOf(e.entity_id) === "binary_sensor" && hass.states[e.entity_id]?.attributes.device_class === "connectivity");
  if (connected) roles.connected = connected.entity_id;
  const server = hubEntities.find((e) => e.translation_key === "server" && domainOf(e.entity_id) === "update");
  if (server) roles.server = server.entity_id;
  // Each tool's entities: by their number, or in the order the integration added them
  const toolEntities = own.filter((e) => TOOL_KEYS[e.translation_key]?.includes(domainOf(e.entity_id)));
  const counts = {};
  for (const e of toolEntities) {
    counts[e.translation_key] = (counts[e.translation_key] ?? 0) + 1;
    const n = toolNumber(hass, e) ?? counts[e.translation_key];
    roles[`tool_${n}_${e.translation_key}`] ??= e.entity_id;
  }
  const tools = [...new Set(Object.keys(roles).map((role) => role.match(/^tool_(\d+)_/)?.[1]).filter(Boolean).map(Number))].sort((a, b) => a - b);
  // The cameras on the printer's device, or else the server's
  const cameraOf = (list) => list.filter((e) => domainOf(e.entity_id) === "camera").map((e) => e.entity_id);
  const cameraIds = cameraOf(own).length ? cameraOf(own) : cameraOf(hubEntities);
  const cameras = cameraIds.map((entityId) => ({ entityId, id: cameraId(hass, entityId) }));
  return {
    id, device, entities: own, roles, tools, cameras,
    profile: { family: familyOf(device?.model), model: device?.model ?? "" },
    // Every entity the card shows of the printer (see changedFor)
    ids: [...own.map((e) => e.entity_id), ...(server ? [server.entity_id] : []), ...cameraIds],
  };
}

let noDevice;
const NO_DEVICES = {};
const deviceCache = new WeakMap();

/**
 * The printer of an entity and everything the card and the features use of
 * it, found once for each version of Home Assistant's entity and device
 * registries:
 * - id, device: the printer's device,
 * - roles: { role: entity_id } (ROLES, tool_<n>_<key> for TOOL_KEYS,
 *   connected and server),
 * - tools: the tools' numbers, cameras: [{ entityId, id }],
 * - profile: { family, model }.
 */
function deviceOf(hass, entityId) {
  const entities = hass?.entities;
  const id = entities?.[entityId]?.device_id;
  if (!id) {
    noDevice ??= Object.freeze({ id: undefined, entities: [], roles: {}, tools: [], cameras: [], profile: { family: "none", model: "" }, ids: [] });
    return noDevice;
  }
  const devices = hass.devices ?? NO_DEVICES;
  let byDevices = deviceCache.get(entities);
  if (!byDevices) deviceCache.set(entities, (byDevices = new WeakMap()));
  let byId = byDevices.get(devices);
  if (!byId) byDevices.set(devices, (byId = new Map()));
  if (!byId.has(id)) byId.set(id, buildDevice(hass, id));
  return byId.get(id);
}

// What else in hass the card and the features show
const HASS_PARTS = ["entities", "devices", "themes", "selectedTheme", "locale", "language", "user", "connected", "config"];

/** Whether a new hass changes anything shown for this entity and its printer. */
function changedFor(before, hass, entityId) {
  if (!before || !hass) return before !== hass;
  if (before === hass) return false;
  if (HASS_PARTS.some((part) => before[part] !== hass[part])) return true;
  if (before.states[entityId] !== hass.states[entityId]) return true;
  return deviceOf(hass, entityId).ids.some((id) => before.states[id] !== hass.states[id]);
}

const isPrusa = (hass, entityId) => hass?.entities?.[entityId]?.platform === DOMAIN;

/** The printer's phase: its State sensor's state, or off while it is unavailable or unknown. */
function phaseNow(hass, entityId) {
  const stateObj = hass?.states[deviceOf(hass, entityId).roles.state];
  if (!known(stateObj)) return "off";
  // A state another vendor's printer reports, outside Prusa's: shown as idle
  return Object.hasOwn(PRINTER_STATES, stateObj.state) && stateObj.state !== "off" ? stateObj.state : "idle";
}

/** Whether the theme is dark. */
const darkMode = (hass) => !!hass?.themes?.darkMode;

/**
 * A heater's state, as Prusa Connect works it out (heaterState and
 * chamberState): within 2 °C of its target it is at temperature; with no
 * target it is cooling above 40 °C, else off; a chamber with no target is
 * off whatever the air.
 */
function heaterState(current, target, chamber = false) {
  if (!Number.isFinite(current)) return "unknown";
  if (!(target > 0)) return !chamber && current > 40 ? "cooling" : "off";
  if (current < target - 2) return "heating";
  if (current > target + 2) return "cooling";
  return "at_temperature";
}

// ---------------------------------------------------------------------------
// Styles: one for each printer family of PrusaSlicer's configuration wizard
// (the CORE One and CORE One INDX are one family), and the Pro HT90. The
// colors are from the printers' drawings in Prusa Connect
// (frontend/public/img/printers).
// ---------------------------------------------------------------------------

// [id, label, frame (light to dark; the middle one is its base color, for
// Flat), the door's color (only the CORE family has a door), which models
// belong (the device's model, as the integration reports it)]
const FAMILIES = [
  ["core", "CORE Family", ["#5b5b5b", "#434242", "#2b2a29"], "#141619", /core/i],
  ["mini", "MINI Family", ["#e2e3e3", "#c5c6c6", "#b2b3b3"], null, /mini/i],
  ["mk", "MK Family", ["#4a4a49", "#2b2a29", "#1f1e1d"], null, /^\s*(original\s+prusa\s+)?(i3\s+)?mk/i],
  ["ht90", "Pro HT90", ["#4f4f4f", "#2b2a29", "#1f1b20"], null, /ht\s*90/i],
  ["xl", "XL Family", ["#4a4a4a", "#303030", "#232323"], null, /\bxl/i],
];
// The family ids in the style's options: the families, Custom (the frame and door given) and None (the theme's)
const FAMILY_IDS = ["none", ...FAMILIES.map(([id]) => id), "custom"];
const FAMILY_OPTIONS = [["none", "None (theme)"], ...FAMILIES.map(([id, label]) => [id, label]), ["custom", "Custom"]];

/** A printer model's family (none for a model of another family or vendor). */
function familyOf(model) {
  const name = `${model ?? ""}`;
  return FAMILIES.find(([, , , , match]) => match.test(name))?.[0] ?? "none";
}

const DEFAULT_REFLECTIONS = 4242;
const STYLE_KEYS = ["family", "frame", "door", "reflections", "status_bar"];

/** The card's style options with their defaults: the printer's family, its own frame and door. */
function styleOptions(config, hass) {
  const own = config?.style && typeof config.style === "object" ? config.style : {};
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
const isLight = (hex) => {
  if (!/^#[0-9a-f]{6}$/i.test(`${hex}`)) return false;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return .2126 * r + .7152 * g + .0722 * b > .45;
};
// A color made lighter (amount above 0) or darker, as the frames' own shades are
const shade = (color, amount) => `color-mix(in srgb, ${color} ${100 - Math.abs(amount)}%, ${amount < 0 ? "#000" : "#fff"})`;

const LIGHT_TEXT = "--primary-text-color: rgba(255, 255, 255, .95); --secondary-text-color: rgba(235, 235, 240, .76)";
const DARK_TEXT = "--primary-text-color: rgba(0, 0, 0, .85); --secondary-text-color: rgba(40, 40, 48, .7)";
const DARK_EDGE = "inset 0 1px 0 rgba(255, 255, 255, .18), inset 0 0 0 1px rgba(255, 255, 255, .06), inset 0 3px 8px rgba(0, 0, 0, .6)";

/**
 * The look of a style: its frame (body, tone of the text on it and its base
 * color for Flat) and its door (glass, edge, the title's text on it, and a
 * number field's ink), or undefined for None. A door given adds a door to
 * any family; Custom has a door only when one is given.
 */
function lookOf(style, hass) {
  if (style.family === "none") return undefined;
  const entry = FAMILIES.find(([id]) => id === style.family);
  let body, tone, flat;
  if (style.frame) {
    body = `linear-gradient(160deg, ${shade(style.frame, 25)} 0%, ${style.frame} 55%, ${shade(style.frame, -30)} 100%)`;
    tone = isLight(style.frame) ? "light" : "dark";
    flat = style.frame;
  } else if (entry) {
    const [hi, mid, lo] = entry[2];
    body = `linear-gradient(160deg, ${hi} 0%, ${mid} 55%, ${lo} 100%)`;
    tone = isLight(mid) ? "light" : "dark";
    flat = mid;
  } else {
    // Custom without a frame: the theme's own card
    body = "var(--ha-card-background, var(--card-background-color, #fff))";
    tone = darkMode(hass) ? "dark" : "light";
    flat = body;
  }
  const doorColor = style.door ?? entry?.[3];
  const door = doorColor ? {
    glass: `linear-gradient(175deg, ${shade(doorColor, 12)} 0%, ${doorColor} 60%, ${shade(doorColor, -25)} 100%)`,
    edge: DARK_EDGE,
    text: isLight(doorColor) ? `${DARK_TEXT}; text-shadow: none` : `${LIGHT_TEXT}; text-shadow: 0 1px 2px rgba(0, 0, 0, .8)`,
    ink: isLight(doorColor) ? "rgba(0, 0, 0, .85)" : "rgba(255, 255, 255, .95)",
    glare: .5,
  } : undefined;
  return { body, tone, flat, door };
}

/** A seeded random number generator: the same seed, the same numbers. */
function seeded(seed) {
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
function glassReflections(glare, pattern) {
  const r = seeded(pattern);
  const white = (a) => `rgba(255, 255, 255, ${(a * glare).toFixed(3)})`;
  const angle = Math.round((r() < .5 ? 100 : 30) + r() * 50);
  const layers = [`linear-gradient(to bottom, ${white(.3)} 0%, ${white(.1)} 14%, transparent 42%)`];
  const count = 2 + Math.floor(r() * 3);
  for (let i = 0; i < count; i++) {
    const at = 4 + r() * 84, width = 3 + r() * 16, peak = .14 + r() * .26;
    const mid = (at + width / 2).toFixed(1), end = (at + width).toFixed(1), start = at.toFixed(1);
    layers.push(i === 0
      ? `linear-gradient(${angle}deg, transparent ${start}%, ${white(peak)} ${start}%, ${white(peak * .25)} ${end}%, transparent ${end}%)`
      : `linear-gradient(${angle}deg, transparent ${start}%, ${white(peak)} ${mid}%, transparent ${end}%)`);
  }
  return layers.join(", ");
}

/**
 * The printer's RGB status bar (status_leds_handler.cpp in the firmware),
 * by state: [red green blue, pattern]. Solid blue while printing, solid
 * green when finished, yellow pulsing every 2 s for a warning, red pulsing
 * every 1 s for an error, and off otherwise.
 */
const STATUS_BAR = {
  printing: ["0 150 255", "solid"], finished: ["0 255 0", "solid"],
  paused: ["255 255 0", "warning"], attention: ["255 255 0", "warning"], error: ["255 0 0", "error"],
};

// ---------------------------------------------------------------------------
// Registry: the controls
// ---------------------------------------------------------------------------

/**
 * Every control a feature can show, by id. Unless role names another, the
 * id is the role of the entity it acts on. Each control declares:
 * - kind: how it works (see KINDS): press (a button entity), value (a
 *   state shown as a read-out; a tap opens it), flag (a binary sensor shown
 *   by its name, dimmed while off), heater (a temperature, tinted as Prusa
 *   Connect tints it), field (a number to type in and slide on), pair (a
 *   heater and its target as one control), chamber_fan, presets, cool_down,
 * - name: the one word on its key, or a function of the moment; option:
 *   its choice in the editor without an entity of its own (or for a control
 *   the integration does not offer yet),
 * - color, confirm and confirmOption (a button that asks first, and the
 *   feature option that turns the question off), allowed(moment),
 * - target (a heater's target role), chamber (a chamber heater),
 * - noUnit (a value shown without its unit), axis (a position, its unit
 *   shown with the Movement feature's Units option), fan (its icon turns
 *   while the fan runs), wide (a read-out that takes more room),
 * - picks and pick(moment): a key that stands for one of other controls.
 */
const notPrinting = ({ phase }) => !JOB_PHASES.includes(phase) && phase !== "off";
const CONTROLS = {
  // The print
  pause_resume: {
    option: "Pause print or Resume print", picks: ["pause", "resume"],
    pick: ({ phase }) => (phase === "paused" ? "resume" : "pause"),
  },
  pause: { kind: "press", name: "Pause", color: "warning", allowed: ({ phase }) => phase === "printing" },
  resume: { kind: "press", name: "Resume", color: "success", allowed: ({ phase }) => phase === "paused" },
  stop: {
    kind: "press", name: "Stop", color: "error", allowed: ({ phase }) => JOB_PHASES.includes(phase),
    confirm: { title: "Stop the print?", text: "The print stops and cannot be resumed.", confirm_text: "Stop print" },
    confirmOption: "ask_before_stopping",
  },
  progress: { kind: "value", name: "Progress" },
  time_remaining: { kind: "value", name: "Remaining" },
  time_printing: { kind: "value", name: "Print time" },
  finish_time: { kind: "value", name: "Finish" },
  job_name: { kind: "value", name: "File", wide: true },

  // Temperatures
  bed_temperature: { kind: "heater", name: "Bed", target: "bed_target_temperature" },
  bed_target_temperature: { kind: "field", name: "Bed target" },
  bed_temperature_and_target: { kind: "pair", parts: ["bed_temperature", "bed_target_temperature"] },
  chamber_temperature: { kind: "heater", name: "Chamber", target: "chamber_target_temperature", chamber: true, option: "Chamber temperature" },
  chamber_target_temperature: { kind: "field", name: "Chamber target", option: "Chamber target temperature" },
  chamber_temperature_and_target: {
    kind: "pair", parts: ["chamber_temperature", "chamber_target_temperature"], option: "Chamber temperature and target",
  },
  // Off, A (Auto) and Manual, as Prusa Connect sets the chamber fan (see chamberFanKeys)
  chamber_fan: { kind: "chamber_fan", name: "Chamber fan", option: "Chamber fan", fan: true },
  // Prusa Connect's preheat presets, and cooling every heater down
  presets: { kind: "presets", option: "Presets", name: "Presets", icon: "mdi:fire" },
  cool_down: { kind: "cool_down", option: "Cool down", name: "Cool down", icon: "mdi:snowflake", color: "#4fc3f7" },

  // Movement
  speed: { kind: "field", name: "Speed", icon: true },
  flow: { kind: "field", name: "Flow", icon: true, option: "Flow" },
  axis_x: { kind: "value", name: "X", axis: true },
  axis_y: { kind: "value", name: "Y", axis: true },
  axis_z: { kind: "value", name: "Z", axis: true },
  home: { kind: "press", name: "Home", icon: "mdi:home", option: "Home", allowed: notPrinting },
  disable_steppers: { kind: "press", name: "Steppers off", icon: "mdi:engine-off-outline", option: "Disable steppers", allowed: notPrinting },

  // Lights (see LightRow)
  chamber_light: { kind: "light", name: "Light", option: "Chamber light" },

  // Utilities
  beep: { kind: "press", name: "Beep", icon: "mdi:volume-high", option: "Beep" },
  reset_printer: {
    kind: "press", name: "Reset", icon: "mdi:restart", color: "error", option: "Reset printer",
    confirm: { title: "Reset the printer?", text: "The printer restarts. A print under way stops.", confirm_text: "Reset printer" },
    confirmOption: "ask_before_resetting",
  },
};

// Each tool's controls, by their key: the control tool_<n>_<key> acts on
// that tool's entity (see controlOf)
const TOOL_CONTROLS = {
  nozzle_temperature: { kind: "heater", name: "Nozzle", target: "nozzle_target_temperature" },
  nozzle_target_temperature: { kind: "field", name: "Nozzle target" },
  nozzle_temperature_and_target: { kind: "pair", parts: ["nozzle_temperature", "nozzle_target_temperature"] },
  material: { kind: "value", name: "Material" },
  nozzle_diameter: { kind: "value", name: "Nozzle", noUnit: true },
  nozzle_high_flow: { kind: "flag", name: "High-flow" },
  nozzle_hardened: { kind: "flag", name: "Hardened" },
  active: { kind: "flag", name: ({ tool }) => `T${tool}`, color: PRINTER_STATES.printing.color },
  print_fan_speed: { kind: "value", name: "Print fan", noUnit: true, fan: true },
  heatbreak_fan_speed: { kind: "value", name: "Heatbreak fan", noUnit: true, fan: true },
};

/** A control from the registry, with its id and role; a tool's control with its tool's roles. */
function controlOf(id) {
  if (Object.hasOwn(CONTROLS, id)) {
    const control = CONTROLS[id];
    return { id, role: control.parts?.[0] ?? id, ...control };
  }
  const match = `${id ?? ""}`.match(/^tool_(\d+)_(.+)$/);
  const base = match && Object.hasOwn(TOOL_CONTROLS, match[2]) ? TOOL_CONTROLS[match[2]] : undefined;
  if (!base) return undefined;
  const at = (key) => `tool_${match[1]}_${key}`;
  const parts = base.parts?.map(at);
  return {
    ...base, id, role: parts?.[0] ?? id, tool: Number(match[1]), key: match[2],
    ...(base.target ? { target: at(base.target) } : {}), ...(parts ? { parts } : {}),
  };
}

/** A control's value: as given, or worked out for the moment. */
const valueOf = (value, moment) => (typeof value === "function" ? value(moment) : value);

/** Whether the device has what a control acts on (a key that stands for others: any of them; a pair: both). */
function present(control, device) {
  if (!control) return false;
  if (control.picks) return control.picks.some((id) => present(controlOf(id), device));
  if (control.parts) return control.parts.every((role) => !!device.roles[role]);
  if (control.kind === "presets" || control.kind === "cool_down") return heaterTargets(device).length > 0;
  return !!device.roles[control.role];
}

/** Whether a control's rules make it unavailable now (its entity aside). */
const blocked = (control, moment) => moment.phase === "off" || (!!control.allowed && !control.allowed(moment));

/** Every heater target of the printer: each tool's nozzle, the bed and the chamber. */
const heaterTargets = (device) => [
  ...device.tools.map((n) => device.roles[`tool_${n}_nozzle_target_temperature`]),
  device.roles.bed_target_temperature, device.roles.chamber_target_temperature,
].filter(Boolean);

/**
 * Prusa Connect's preheat presets: [material, nozzle, bed] (°C). A preset
 * sets every nozzle and the bed; the chamber keeps its target.
 */
const PRESETS = [["PLA", 215, 60], ["PETG", 230, 85], ["ASA", 260, 105], ["PC", 275, 110], ["FLEX", 240, 50]];

// ---------------------------------------------------------------------------
// Feature base
// ---------------------------------------------------------------------------

/** Keep taps on a control from reaching the cards around it (such as an expander card). */
function keepTaps(el) {
  for (const type of ["click", "touchstart", "touchend", "mousedown", "mouseup"]) {
    el.addEventListener(type, (ev) => ev.stopPropagation());
  }
}

// Console (the prusa-console attribute): the buttons become keys that press in
const KEY_CSS = `
  :host([prusa-console]) .key {
    background-image: linear-gradient(180deg, rgba(255,255,255,.35), rgba(255,255,255,0) 45%, rgba(0,0,0,.18));
    box-shadow: inset 0 1px 0 rgba(255,255,255,.55), inset 0 -2px 2px rgba(0,0,0,.3), 0 2px 3px rgba(0,0,0,.5);
    transition: transform 120ms ease-in-out, box-shadow 120ms ease-in-out;
  }
  :host([prusa-console]) .key:not(:disabled):active,
  :host([prusa-console]) .key:not(:disabled)[aria-pressed="true"] {
    transform: translateY(1px);
    background-image: linear-gradient(180deg, rgba(0,0,0,.28), rgba(0,0,0,.06) 40%, rgba(255,255,255,.1));
    box-shadow: inset 0 3px 6px rgba(0,0,0,.55), inset 0 1px 2px rgba(0,0,0,.4), inset 0 -1px 0 rgba(255,255,255,.25);
  }
  :host([prusa-console]) .key:disabled { background-image: none; box-shadow: none; transform: none; }
`;

// What a feature's keys show: their icons, their names, or both
const DISPLAYS = [["icons", "Icons"], ["names", "Names"], ["both", "Icons and names"]];
function displayOf(config, fallback = "icons") {
  return DISPLAYS.some(([value]) => value === config?.show) ? config.show : fallback;
}
const displayField = () => ({ name: "show", label: "Show", selector: select(DISPLAYS) });

/** What a key shows with Show: its icon, its text, or both. */
function faceOf(b, display) {
  const icon = !!(b.entity || b.icon), text = !!b.text;
  const showIcon = icon && (display !== "names" || !text);
  const showText = text && (display !== "icons" || !showIcon || !!b.alwaysText);
  return { showIcon, showText };
}

// The narrowest each kind of item in a row may be (px): a key as Home
// Assistant's tile icon; a field, read-out and slider need room for their numbers
const ITEM_MIN = { key: 36, readout: 72, field: 72, slider: 72, wide: 120 };

/** An item's narrowest width (px): a group (a field, a pair) is its parts, with the gaps between them. */
function itemMin(el, gap) {
  if (el.classList.contains("group") || el.classList.contains("combo")) {
    const parts = [...el.children];
    return parts.reduce((sum, part) => sum + itemMin(part, gap), 0) + (el.classList.contains("combo") ? 0 : Math.max(0, parts.length - 1) * gap);
  }
  return Number(el.dataset.min) || ITEM_MIN.key;
}

/**
 * Fit a row's items into its width, in order: each takes at least its
 * minimum, and from the first that does not fit on, the items are left out
 * (data-dropped). A row that wraps leaves none out.
 */
function fitRow(row) {
  const width = row.clientWidth;
  if (!width) return;
  if (row.classList.contains("wraps")) {
    for (const item of row.children) item.removeAttribute("data-dropped");
    return;
  }
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  let used = 0, shown = 0, full = false;
  for (const item of row.children) {
    if (item.hidden) continue;
    const need = itemMin(item, gap) + (shown ? gap : 0);
    full ||= used + need > width + 0.5;
    item.toggleAttribute("data-dropped", full);
    if (!full) {
      used += need;
      shown += 1;
    }
  }
}

// One line of items that fills the row (see fitRow), or (wraps) several
const ROW_CSS = `
  .rows { display: flex; flex-direction: column; gap: var(--ha-card-feature-gap, 12px); }
  .row { display: flex; flex-wrap: nowrap; align-items: center; column-gap: var(--feature-button-spacing, 12px); height: var(--feature-height, 42px); }
  .row.wraps {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(${ITEM_MIN.field}px, 1fr)); height: auto;
    gap: var(--ha-card-feature-gap, 12px) var(--feature-button-spacing, 12px);
  }
  .row.wraps > *, .row.wraps > .group > * { height: var(--feature-height, 42px); min-width: 0; }
  .row [data-dropped] { display: none !important; }
  .row .key { flex: 1 1 0; min-width: ${ITEM_MIN.key}px; }
  .row .slide { flex: 2 1 0; min-width: ${ITEM_MIN.slider}px; }
  .row .field { flex: 1 1 0; min-width: ${ITEM_MIN.field}px; }
  .row .field.readout.wide { flex: 2 1 0; min-width: ${ITEM_MIN.wide}px; }
  .row .combo { flex: 2 1 0; min-width: ${2 * ITEM_MIN.field}px; }
  .row .cell { display: flex; flex: 3 1 0; min-width: ${3 * ITEM_MIN.key + 24}px; column-gap: var(--feature-button-spacing, 12px); }
`;

const FEATURE_CSS = `
  :host { display: block; min-width: 0; max-width: 100%; }
  ${ROW_CSS}
  .group { display: contents; }
  .field {
    position: relative; display: flex; align-items: center; justify-content: center; gap: 2px; height: 100%; box-sizing: border-box;
    padding: 0 6px; border-radius: var(--feature-border-radius, 12px); overflow: hidden; cursor: text;
    color: var(--prusa-text, var(--primary-text-color)); font-weight: var(--ha-font-weight-medium, 500);
  }
  .field::before { content: ""; position: absolute; inset: 0; background: var(--feature-color, ${ENABLED}); opacity: .2; }
  /* On a style with a door, a number field is a pane of the door's glass, in its text color */
  .field:not(.readout):not(.disabled) { color: var(--prusa-field-text, var(--prusa-text, var(--primary-text-color))); box-shadow: var(--prusa-field-edge, none); }
  .field:not(.readout):not(.disabled)::before { background: var(--prusa-field, var(--feature-color, ${ENABLED})); opacity: var(--prusa-field-opacity, .2); }
  .field:focus-within { outline: 2px solid var(--feature-color, ${ENABLED}); outline-offset: 2px; }
  .field > * { position: relative; }
  .field input {
    flex: 1 1 0; width: 0; min-width: 0; margin: 0; padding: 0; border: 0; outline: none; background: transparent;
    font: inherit; color: inherit; text-align: right; font-variant-numeric: tabular-nums;
  }
  .field .unit { flex: 1 1 0; min-width: 0; text-align: left; opacity: .8; white-space: nowrap; }
  .field ha-state-icon { flex: none; --mdc-icon-size: 22px; margin-right: 4px; }
  .field.disabled { cursor: default; color: var(--disabled-text-color, #bdbdbd); }
  .field.disabled::before { background: var(--disabled-color, #bdbdbd); opacity: .2; }
  .field.drag { touch-action: none; cursor: ew-resize; }
  .field.sliding::before { opacity: .45; }
  /* A read-out: a field that is only shown, its icon in its color; a tap opens it */
  .field.readout { cursor: pointer; gap: 6px; padding: 0 6px; font-size: var(--ha-font-size-s, 12px); min-width: 0; }
  .field.readout::before { background: var(--c, ${ENABLED}); }
  .field.readout:focus-visible { outline: 2px solid var(--c, ${ENABLED}); outline-offset: 2px; }
  .field.readout ha-state-icon, .field.readout ha-icon { flex: none; --mdc-icon-size: 22px; color: var(--c, ${ENABLED}); }
  .field.readout span { font-variant-numeric: tabular-nums; }
  /* A flag that is off: in the quiet tone */
  .field.readout.dim { color: var(--secondary-text-color); }
  .field.readout.dim ha-state-icon { color: var(--secondary-text-color); }
  .field.readout.dim::before { background: var(--disabled-color, #bdbdbd); }
  /* A heater, as Prusa Connect draws it: the tint says what it does, the
     arrow which way the number goes, and it pulses while it heats. Off reads
     in the quiet tone, with Off under the number */
  .heat { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
  .heat .arrow { --mdc-icon-size: 14px; margin-left: -3px; }
  .heater.heating .heat { color: var(--prusa-heating); animation: prusa-heating 2s ease-in-out infinite; }
  .heater.heating ha-state-icon { color: var(--prusa-heating); }
  .heater.cooling .heat, .heater.cooling ha-state-icon { color: var(--prusa-cooling); }
  .heater.off .heat, .heater.off ha-state-icon { color: var(--secondary-text-color); }
  .heater .two { display: grid; line-height: 1.1; min-width: 0; text-align: left; }
  .heater .note { font-size: 10px; font-weight: 400; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: .03em; }
  @keyframes prusa-heating { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
  /* A heater and its target as one field: the reading over the target (Off at 0) */
  .field.pair { justify-content: center; gap: 6px; padding: 0 10px; }
  .field.pair ha-state-icon { margin-right: 0; }
  .field.pair .two { display: grid; line-height: 1.15; min-width: 0; flex: 0 1 auto; }
  .field.pair .heat { display: flex; align-items: center; gap: 2px; min-width: 0; }
  .field.pair .now { font-variant-numeric: tabular-nums; }
  .field.pair .arrow[hidden] { display: none; }
  .field.pair .target { display: flex; min-width: 0; font-size: 11px; font-weight: 400; color: var(--secondary-text-color); }
  .field.pair .target input { flex: 0 1 auto; width: 4ch; text-align: left; }
  .field.pair .target input::placeholder { color: inherit; opacity: 1; text-transform: uppercase; letter-spacing: .03em; }
  .field.pair .target .unit { flex: 0 1 auto; }
  .field.pair.unset .unit { display: none; }
  .field.pair.heating .heat { color: var(--prusa-heating); animation: prusa-heating 2s ease-in-out infinite; }
  .field.pair.heating ha-state-icon { color: var(--prusa-heating); }
  .field.pair.cooling .heat, .field.pair.cooling ha-state-icon { color: var(--prusa-cooling); }
  .field.pair.off .heat, .field.pair.off ha-state-icon { color: var(--secondary-text-color); }
  /* A heater and its target as one control: the reading and the field side by side, as one */
  .combo { display: flex; min-width: 0; height: var(--feature-height, 42px); }
  .combo > * { flex: 1 1 0; min-width: 0; }
  .combo > .readout { border-top-right-radius: 0; border-bottom-right-radius: 0; }
  .combo > .group > .field { border-top-left-radius: 0; border-bottom-left-radius: 0; }
  .combo > .group { display: flex; flex: 1 1 0; min-width: 0; }
  .combo > .group > .field { flex: 1 1 0; }
  .key {
    min-width: 0; height: 100%; padding: 0 4px; border: 0; cursor: pointer; box-sizing: border-box;
    position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; gap: 6px;
    border-radius: var(--feature-border-radius, 12px);
    background: var(--prusa-feature-backing, var(--prusa-feature-scrim, transparent));
    color: var(--prusa-text, var(--primary-text-color)); font: inherit; font-size: var(--ha-font-size-s, 12px); font-weight: 500;
  }
  .key::before { content: ""; position: absolute; inset: 0; background: var(--c, ${ENABLED}); opacity: .2; transition: opacity 180ms ease-in-out; }
  .key[aria-pressed="false"]::before { background: var(--disabled-color, #bdbdbd); }
  .key:hover::before { opacity: .35; }
  .key[aria-pressed="true"]::before { opacity: 1; }
  .key[aria-pressed="true"] { color: var(--prusa-on-color, #fff); }
  .key:focus-visible { outline: 2px solid var(--c, ${ENABLED}); outline-offset: 2px; }
  .key:disabled { cursor: default; color: var(--disabled-text-color, #bdbdbd); }
  .key:disabled::before, .key:disabled:hover::before { background: var(--disabled-color, #bdbdbd); opacity: .2; }
  .key > * { position: relative; }
  .key ha-icon, .key ha-state-icon { flex: none; --mdc-icon-size: 22px; }
  .key .mod { font-weight: 700; font-size: 13px; margin-left: -4px; }
  /* A key that opens a menu (Presets): the browser's own list, over the whole key */
  .key select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font: inherit; }
  .key select:disabled { cursor: default; }
  .key.disabled { cursor: default; color: var(--disabled-text-color, #bdbdbd); }
  .key.disabled::before { background: var(--disabled-color, #bdbdbd); opacity: .2; }
  /* A fan's icon turns while it runs, faster at a higher speed */
  .spin { animation: prusa-spin var(--spin, 1.2s) linear infinite; }
  @keyframes prusa-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin, .heater.heating .heat { animation: none; } }
  span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
  ${KEY_CSS}
`;

/**
 * Perform an action through Home Assistant's own action handling, as a
 * card's tap action does. With a confirmation, Home Assistant first asks in
 * its own confirmation dialog.
 */
function performAction(host, service, entityId, confirmation, data) {
  fire(host, "hass-action", {
    config: {
      tap_action: {
        action: "perform-action", perform_action: service, target: { entity_id: entityId }, ...(data ? { data } : {}),
        ...(confirmation ? { confirmation: { dismiss_text: "Keep it", ...confirmation } } : {}),
      },
    },
    action: "tap",
  });
}

/** An entity's own name, without its device's, as Home Assistant shows it; undefined without one. */
function entityName(hass, entityId) {
  const stateObj = entityId ? hass?.states[entityId] : undefined;
  return (stateObj && hass.formatEntityName?.(stateObj, { type: "entity" })) || stateObj?.attributes.friendly_name || undefined;
}

/** A state as Home Assistant shows it, without its unit when asked. */
function formatValue(hass, stateObj, noUnit = false) {
  const text = hass.formatEntityState(stateObj);
  const unit = stateObj.attributes.unit_of_measurement;
  return noUnit && unit && text.endsWith(unit) ? text.slice(0, -unit.length).trim() : text;
}

/** What every key made from a control has: its id, its entity (whose icon it shows), its one-word name, title and color. */
function keyBase(control, entityId, moment) {
  const name = valueOf(control.name, { ...moment, tool: control.tool }) ?? entityName(moment.hass, entityId);
  const title = entityName(moment.hass, entityId) ?? control.option ?? name;
  return { key: control.id, entity: entityId, icon: entityId ? undefined : control.icon, text: name, color: control.color, label: title };
}

// A fan's turn, in seconds: one speed, or each of four (see fanTurn)
const FAN_TURN = 1.2;
const FAN_TURNS = [2.4, 1.6, 1, 0.6];
/** A fan's turn at a percentage (1 to 100): faster in each quarter; none when animate_fan is off. */
const fanTurn = (config, percentage) => (config?.animate_fan === false ? undefined
  : percentage === undefined ? FAN_TURN : FAN_TURNS[Math.min(3, Math.max(0, Math.ceil(percentage / 25) - 1))]);

/** A key for a button entity: a tap presses it, asking first when the control says so. */
function pressKey(feature, control, entityId, moment) {
  return {
    ...keyBase(control, entityId, moment), disabled: !feature._usable(entityId) || blocked(control, moment),
    action: () => {
      const asks = !!control.confirm && feature._config[control.confirmOption] !== false;
      performAction(feature, "button.press", entityId, asks ? control.confirm : undefined);
    },
  };
}

/**
 * A read-out of a state: its icon and its value as Home Assistant shows it
 * (without its unit where the card shows none). A tap opens the entity.
 * A fan's icon turns at one rate while it runs: the integration reports its
 * revolutions per minute, with no top speed to measure them against.
 */
function valueKey(feature, control, entityId, moment) {
  const hass = moment.hass, stateObj = hass.states[entityId];
  if (!stateObj) return undefined;
  const base = keyBase(control, entityId, moment);
  const noUnit = control.noUnit || (control.axis && moment.config?.units !== true);
  // Blank while no value is known (unknown or unavailable): only the icon shows, as in the xTool card
  const value = known(stateObj) ? formatValue(hass, stateObj, noUnit) : undefined;
  const running = control.fan && Number(stateObj.state) > 0;
  return {
    ...base, readout: true, text: value, alwaysText: true, label: `${base.label}: ${value ?? hass.formatEntityState(stateObj)}`, wide: control.wide,
    disabled: !feature._usable(entityId), spin: running ? fanTurn(moment.config) : undefined,
    action: () => fire(feature, "hass-more-info", { entityId }),
  };
}

/** A read-out of a binary sensor: by its name, in its color while on and dimmed while off. */
function flagKey(feature, control, entityId, moment) {
  const hass = moment.hass, stateObj = hass.states[entityId];
  if (!stateObj) return undefined;
  const base = keyBase(control, entityId, moment);
  return {
    ...base, readout: true, alwaysText: true, dim: !isOn(stateObj), label: `${base.label}: ${hass.formatEntityState(stateObj)}`,
    disabled: !feature._usable(entityId), action: () => fire(feature, "hass-more-info", { entityId }),
  };
}

/** A heater's reading, tinted as Prusa Connect tints it (see heaterState). A tap opens the reading. */
function heaterKey(feature, control, entityId, moment) {
  const hass = moment.hass, stateObj = hass.states[entityId];
  if (!stateObj) return undefined;
  const base = keyBase(control, entityId, moment);
  const target = Number(hass.states[moment.device.roles[control.target]]?.state);
  const state = known(stateObj) ? heaterState(Number(stateObj.state), target, !!control.chamber) : "unknown";
  // Blank while no reading is known (unknown or unavailable): only the icon shows
  const value = known(stateObj) ? hass.formatEntityState(stateObj) : undefined;
  const words = { heating: "heating", cooling: "cooling", at_temperature: "at temperature", off: "off" }[state];
  return {
    ...base, readout: true, text: value, alwaysText: true, heat: value === undefined ? undefined : state, wide: false,
    label: `${base.label}: ${value ?? hass.formatEntityState(stateObj)}${words ? `, ${words}` : ""}`, disabled: !feature._usable(entityId),
    action: () => fire(feature, "hass-more-info", { entityId }),
  };
}

/** A field's item: the field control and its entity (see FieldGroup). */
function fieldKey(feature, control, entityId) {
  return entityId ? { key: control.id, field: control.id, entities: [entityId] } : undefined;
}

/**
 * A heater and its target as one control, one field (see FieldGroup): the
 * reading on top, tinted as Prusa Connect tints it, and the target under it
 * (Off at 0). The icon is the temperature sensor's.
 */
function pairKey(feature, control, entityId, moment) {
  const [reading, target] = control.parts.map((id) => moment.device.roles[controlOf(id)?.role ?? id]);
  return reading && target ? { key: control.id, field: control.id, entities: [target], reading } : undefined;
}

// The last manual speed of each chamber fan, as Prusa Connect remembers it
const FAN_SPEEDS = new Map();
const DEFAULT_FAN_SPEED = 50;

/**
 * The chamber fan, as Prusa Connect sets it: Off, A (Auto) and Manual, a
 * percentage (Prusa Connect sends -1 for Auto and 0 for Off). The Manual
 * key shows the speed; its first tap returns the fan to the last manual
 * speed, and a tap while it runs at it opens Home Assistant's dialog for the
 * fan, whose slider sets another. The key in use is pressed, and its fan
 * turns, faster at a higher speed.
 */
function chamberFanKeys(feature, control, entityId, moment) {
  const hass = moment.hass, stateObj = hass.states[entityId];
  if (!stateObj) return undefined;
  const presets = stateObj.attributes.preset_modes ?? [];
  const auto = presets.find((p) => `${p}`.toLowerCase() === "auto") ?? presets[0];
  const percentage = Number(stateObj.attributes.percentage);
  const mode = stateObj.attributes.preset_mode ? "auto" : stateObj.state === "off" ? "off" : stateObj.state === "on" ? "manual" : undefined;
  if (mode === "manual" && percentage > 0) FAN_SPEEDS.set(entityId, percentage);
  const last = FAN_SPEEDS.get(entityId) ?? DEFAULT_FAN_SPEED;
  const usable = feature._usable(entityId) && moment.phase !== "off";
  const name = entityName(hass, entityId) ?? control.option;
  const key = (id, own) => ({ key: `chamber_fan_${id}`, alwaysText: own.text !== undefined && id !== "off", disabled: !usable, ...own });
  return [
    key("off", {
      icon: "mdi:fan-off", text: "Off", label: `${name}: Off`, pressed: mode === "off",
      action: () => mode !== "off" && hass.callService("fan", "turn_off", { entity_id: entityId }),
    }),
    ...(auto ? [key("auto", {
      icon: "mdi:fan", text: "A", label: `${name}: Auto`, pressed: mode === "auto",
      spin: mode === "auto" ? fanTurn(moment.config) : undefined,
      action: () => mode !== "auto" && hass.callService("fan", "set_preset_mode", { entity_id: entityId, preset_mode: auto }),
    })] : []),
    key("manual", {
      icon: "mdi:fan", text: `${mode === "manual" ? percentage : last}%`, pressed: mode === "manual",
      label: mode === "manual" ? `${name}: Manual, ${percentage}%. Tap to set the speed` : `${name}: Manual, ${last}%`,
      spin: mode === "manual" ? fanTurn(moment.config, percentage) : undefined,
      action: () => (mode === "manual"
        ? fire(feature, "hass-more-info", { entityId })
        : hass.callService("fan", "set_percentage", { entity_id: entityId, percentage: last })),
    }),
  ];
}

/** Set heater targets: [entity_id, °C] each, within its range. */
function setTargets(hass, targets) {
  for (const [entityId, value] of targets) {
    const { min = -Infinity, max = Infinity } = hass.states[entityId]?.attributes ?? {};
    hass.callService("number", "set_value", { entity_id: entityId, value: Math.min(max, Math.max(min, value)) });
  }
}

/** Presets: a key that opens the list of Prusa Connect's presets; one chosen sets every nozzle and the bed. */
function presetsKey(feature, control, entityId, moment) {
  const { device, hass } = moment;
  const nozzles = device.tools.map((n) => device.roles[`tool_${n}_nozzle_target_temperature`]).filter(Boolean);
  const bed = device.roles.bed_target_temperature;
  return {
    key: control.id, icon: control.icon, text: control.name, label: "Presets. Choose a material to preheat",
    color: PRINTER_STATES.printing.color, disabled: moment.phase === "off" || ![...nozzles, bed].some((id) => feature._usable(id)),
    menu: PRESETS.map(([material, nozzle, bedTemp]) => ({ value: material, label: `${material}: ${nozzle} / ${bedTemp} °C` })),
    choose: (material) => {
      const preset = PRESETS.find(([name]) => name === material);
      if (preset) setTargets(hass, [...nozzles.map((id) => [id, preset[1]]), ...(bed ? [[bed, preset[2]]] : [])]);
    },
  };
}

/** Cool down: every heater's target to 0 (off). */
function coolDownKey(feature, control, entityId, moment) {
  const targets = heaterTargets(moment.device);
  return {
    key: control.id, icon: control.icon, text: control.name, label: "Cool down. Turns every heater off", color: control.color,
    disabled: moment.phase === "off" || !targets.some((id) => feature._usable(id)),
    action: () => setTargets(moment.hass, targets.map((id) => [id, 0])),
  };
}

/** The kinds of control: key(feature, control, entity_id, moment) makes its key, keys or field. */
const KINDS = {
  press: { key: pressKey },
  value: { key: valueKey },
  flag: { key: flagKey },
  heater: { key: heaterKey },
  field: { key: fieldKey },
  pair: { key: pairKey },
  chamber_fan: { key: chamberFanKeys },
  presets: { key: presetsKey },
  cool_down: { key: coolDownKey },
};

/** A control's key (or keys), or undefined when it has none now. */
const keyOf = (feature, control, entityId, moment) => KINDS[control.kind]?.key(feature, control, entityId, moment);

/** The decimals a number shows: the control's, or as many as its step has (0.1: 1, 1: 0). */
function decimalsOf(control, stateObj) {
  if (control.decimals !== undefined) return control.decimals;
  const step = String(stateObj?.attributes.step ?? 1);
  return step.includes(".") ? step.split(".")[1].length : 0;
}

// Sliding a field: no change within this distance of the press (px), and a
// new value every tick (ms) while the pointer is held, faster the farther it
// is from where the press started
const SCRUB_DEAD_ZONE = 6;
const SCRUB_TICK = 50;
const SCRUB_SCALE = 60;
const SCRUB_POWER = 1.5;

/**
 * Press, then slide: while the pointer is held the value changes, faster
 * the farther the pointer is from where the press started; right or up
 * raises it. A tap is left to the field, to type in.
 */
function scrub(el, { change, done, hold }) {
  let start, at, timer, holding, held = false;
  const off = () => el.classList.contains("disabled");
  const begin = (ev) => {
    try {
      el.setPointerCapture(ev.pointerId);
    } catch (err) {
      // A pointer the browser no longer tracks: the slide follows the moves the element gets
    }
    clearTimeout(holding);
    el.classList.add("sliding");
    timer = setInterval(() => {
      const distance = (at.x - start.x) - (at.y - start.y);
      const beyond = Math.max(0, Math.abs(distance) - SCRUB_DEAD_ZONE);
      if (beyond) change(Math.sign(distance) * (beyond / SCRUB_SCALE) ** SCRUB_POWER);
    }, SCRUB_TICK);
  };
  const stop = (ev) => {
    if (!start) return;
    const sliding = timer !== undefined;
    clearTimeout(holding);
    clearInterval(timer);
    timer = undefined;
    start = undefined;
    el.classList.remove("sliding");
    if (el.hasPointerCapture?.(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
    if (sliding) done();
  };
  el.addEventListener("pointerdown", (ev) => {
    if (off() || ev.button !== 0) return;
    start = at = { x: ev.clientX, y: ev.clientY };
    held = false;
    if (hold) {
      holding = setTimeout(() => {
        if (!start || timer !== undefined) return;
        held = true;
        start = undefined;
        el.querySelector("input")?.blur();
        hold();
      }, HOLD_TIME);
    }
  });
  // The click after a hold does not open the field for typing
  el.addEventListener("click", (ev) => {
    if (!held) return;
    held = false;
    ev.preventDefault();
    ev.stopPropagation();
  }, true);
  el.addEventListener("pointermove", (ev) => {
    if (!start) return;
    at = { x: ev.clientX, y: ev.clientY };
    if (timer === undefined && Math.hypot(at.x - start.x, at.y - start.y) > SCRUB_DEAD_ZONE) {
      el.querySelector("input")?.blur();
      begin(ev);
    }
  });
  el.addEventListener("pointerup", stop);
  el.addEventListener("pointercancel", stop);
  el.addEventListener("lostpointercapture", stop);
}

// Each heater's last target before a hold turned it off (see FieldGroup._hold)
const HEATER_TARGETS = new Map();
// A press held this long without sliding is a hold (ms), as Home Assistant's own hold
const HOLD_TIME = 500;

// A field is in the number color, as Home Assistant's number features are
const NUMBER_ON = "var(--state-number-active-color, var(--state-active-color, var(--primary-color, #03a9f4)))";

/**
 * A number field (a heater's target, print speed, flow): its number and
 * unit; a tap types in it, and a press and slide changes it (set when the
 * slide ends). Kept while the feature shows it, so typing and sliding go on
 * while Home Assistant's states change.
 */
class FieldGroup {
  constructor(feature, control) {
    this._feature = feature;
    this._control = control;
    // A heater and its target (see pairKey): the reading over the target
    this._pair = control.kind === "pair";
    this.el = document.createElement("div");
    this.el.className = "group";
    this._field = document.createElement("label");
    this._field.className = this._pair ? "field drag pair" : "field drag";
    this._field.dataset.key = control.id;
    this._field.style.setProperty("--feature-color", NUMBER_ON);
    this._field.dataset.min = ITEM_MIN.field;
    this._field.innerHTML = this._pair
      ? `<span class="two"><span class="heat"><span class="now"></span><ha-icon class="arrow"></ha-icon></span><span class="target"><input type="text" inputmode="decimal" enterkeyhint="done" placeholder="Off"><span class="unit"></span></span></span>`
      : `<input type="text" inputmode="decimal" enterkeyhint="done"><span class="unit"></span>`;
    this._input = this._field.querySelector("input");
    this._unit = this._field.querySelector(".unit");
    this._now = this._field.querySelector(".now");
    this._arrow = this._field.querySelector(".arrow");
    if (control.icon === true || this._pair) {
      this._icon = document.createElement("ha-state-icon");
      this._field.prepend(this._icon);
    }
    this._input.addEventListener("keydown", (ev) => {
      ev.stopPropagation();
      if (ev.key === "Enter") this._input.blur();
      if (ev.key === "Escape") {
        this._input.value = this._shown;
        this._input.blur();
      }
    });
    this._input.addEventListener("change", () => this._typed());
    this._input.addEventListener("click", (ev) => ev.stopPropagation());
    this.el.append(this._field);
    scrub(this._field, { change: (steps) => this._slide(steps), done: () => this._release(), hold: this._pair ? () => this._hold() : undefined });
  }

  /** A heater held: off, or back to the last target set while it is off. */
  _hold() {
    const value = this._value();
    if (value > 0) {
      HEATER_TARGETS.set(this._entityId, value);
      this._commit(0);
    } else if (HEATER_TARGETS.has(this._entityId)) {
      this._commit(HEATER_TARGETS.get(this._entityId));
    }
  }

  get _state() {
    return this._feature._hass.states[this._entityId];
  }

  _value() {
    return Number(this._state?.state);
  }

  // A heater's target of 0 is Off: an empty field, which shows Off
  _format(value) {
    if (this._pair && value === 0) return "";
    return Number.isFinite(value) ? value.toFixed(decimalsOf(this._control, this._state)) : "";
  }

  /** Show the item's entity and state: the field, unless it is being typed in. */
  update(item) {
    this._entityId = item.entities[0];
    const feature = this._feature, hass = feature._hass, stateObj = this._state;
    const usable = feature._usable(this._entityId) && feature._moment().phase !== "off";
    this._shown = this._format(this._value());
    this._input.disabled = !usable;
    this._field.classList.toggle("disabled", !usable);
    this._unit.textContent = stateObj?.attributes.unit_of_measurement ?? "";
    if (this._icon) {
      this._icon.hass = hass;
      this._icon.stateObj = this._pair ? hass.states[item.reading] : stateObj;
    }
    if (this._pair) {
      const reading = hass.states[item.reading];
      const chamber = item.reading.includes("chamber");
      const state = known(reading) ? heaterState(Number(reading.state), this._value(), chamber) : undefined;
      for (const name of ["heating", "cooling", "at_temperature", "off"]) this._field.classList.toggle(name, state === name);
      this._now.textContent = known(reading) ? hass.formatEntityState(reading) : "";
      this._arrow.icon = state === "heating" ? "mdi:arrow-up" : state === "cooling" ? "mdi:arrow-down" : "";
      this._arrow.hidden = state !== "heating" && state !== "cooling";
      this._field.classList.toggle("unset", (this._pending ?? this._value()) === 0);
      const name = entityName(hass, item.reading) ?? this._control.option ?? "";
      const words = { heating: "heating", cooling: "cooling", at_temperature: "at temperature", off: "off" }[state];
      nameItem(this._field, `${name}: ${reading ? hass.formatEntityState(reading) : ""}${words ? `, ${words}` : ""}. Target: ${stateObj ? hass.formatEntityState(stateObj) : ""}. Tap to type, press and slide, or hold to turn it off or on`);
      this._input.setAttribute("aria-label", entityName(hass, this._entityId) ?? "");
      if (this._pending !== undefined || feature.shadowRoot.activeElement !== this._input) this._input.value = this._format(this._pending ?? this._value());
      return;
    }
    nameItem(this._field, `${entityName(hass, this._entityId) ?? this._control.option ?? ""}. Tap to type, or press and slide`);
    this._input.setAttribute("aria-label", entityName(hass, this._entityId) ?? this._control.option ?? "");
    if (this._pending !== undefined || feature.shadowRoot.activeElement !== this._input) this._input.value = this._format(this._pending ?? this._value());
  }

  _slide(steps) {
    const stateObj = this._state;
    const value = this._pending ?? this._value();
    if (!Number.isFinite(value)) return;
    const { min = -Infinity, max = Infinity, step = 1 } = stateObj.attributes;
    this._pending = Math.min(max, Math.max(min, value + steps * Math.max(step, 10 ** -decimalsOf(this._control, stateObj))));
    this._input.value = this._format(this._pending);
    this._field.classList.toggle("unset", this._pair && this._pending === 0);
  }

  _release() {
    const pending = this._pending;
    this._pending = undefined;
    if (pending !== undefined) this._commit(pending);
  }

  _typed() {
    const typed = this._input.value.trim();
    // A heater's target typed empty or "off" is Off
    if (this._pair && (typed === "" || /^off$/i.test(typed))) {
      this._commit(0);
      return;
    }
    const value = Number(typed.replace(",", "."));
    if (typed === "" || !Number.isFinite(value)) {
      this._input.value = this._shown;
      return;
    }
    this._commit(value);
  }

  /** Set the number, rounded to what it shows and kept within its range. */
  _commit(value) {
    const stateObj = this._state;
    if (!stateObj) return;
    const factor = 10 ** decimalsOf(this._control, stateObj);
    const { min = -Infinity, max = Infinity } = stateObj.attributes;
    const next = Math.min(max, Math.max(min, Math.round(value * factor) / factor));
    if (next !== this._value()) this._feature._hass.callService("number", "set_value", { entity_id: this._entityId, value: next });
    else this._input.value = this._shown;
  }
}

/**
 * Name an item of a row for hover (its title, the tooltip on a desktop)
 * and for screen readers.
 */
function nameItem(el, name) {
  if (!name) return;
  if (el.title !== name) el.title = name;
  if (el.getAttribute("aria-label") !== name) el.setAttribute("aria-label", name);
}

// A light's color in a feature: its own color when it has one, daylight
// otherwise; Home Assistant's color for a light that is off
const DAYLIGHT = "rgb(214, 228, 255)";
const LIGHT_OFF = "var(--state-light-inactive-color, var(--state-inactive-color, var(--disabled-color, #bdbdbd)))";
const BRIGHTNESS = "_brightness";

/** Whether a light has a brightness. */
const dimmable = (hass, light) => (hass?.states[light]?.attributes.supported_color_modes ?? []).some((mode) => mode !== "onoff");

/**
 * A light as a light's tile card shows it: Home Assistant's tile icon with
 * the light's icon, where a tap turns the light on or off, and Home
 * Assistant's light brightness feature (for a light with a brightness).
 * With the feature's off_at_minimum option, its slider at the minimum turns
 * the light off.
 */
class LightRow {
  constructor(feature, entityId) {
    this._feature = feature;
    this._entityId = entityId;
    this.icon = document.createElement("ha-tile-icon");
    this.icon.dataset.min = ITEM_MIN.key;
    this.icon.interactive = true;
    this.icon.actionHandlerOptions = { hasHold: false, hasDoubleClick: false };
    this._state = document.createElement("ha-state-icon");
    this._state.slot = "icon";
    this.icon.append(this._state);
    this.icon.addEventListener("action", (ev) => {
      ev.stopPropagation();
      if (ev.detail?.action === "tap") performAction(feature, "light.toggle", entityId);
    });
    this.slide = document.createElement("div");
    this.slide.className = "slide slider";
    this.slide.dataset.min = ITEM_MIN.slider;
    const control = document.createElement("hui-card-feature");
    control.feature = { type: "light-brightness" };
    control.context = { entity_id: entityId };
    this._slideIcon = document.createElement("ha-state-icon");
    this.slide.append(control, this._slideIcon);
    this.slide.addEventListener("value-changed", (ev) => {
      const slider = ev.composedPath()[0];
      if (feature._config?.off_at_minimum === true && ev.detail?.value <= Number(slider?.min ?? 1)) {
        ev.stopPropagation();
        feature._hass.callService("light", "turn_off", { entity_id: entityId });
      }
    }, true);
  }

  /** The light as it is now. */
  update() {
    const hass = this._feature._hass, stateObj = hass.states[this._entityId];
    const rgb = stateObj?.attributes.rgb_color;
    const color = stateObj?.state === "on" ? (Array.isArray(rgb) ? `rgb(${rgb.join(", ")})` : DAYLIGHT) : LIGHT_OFF;
    this.icon.style.setProperty("--tile-icon-color", color);
    this.icon.accessibleLabel = entityName(hass, this._entityId);
    nameItem(this.icon, this.icon.accessibleLabel);
    for (const icon of [this._state, this._slideIcon]) {
      icon.hass = hass;
      icon.stateObj = stateObj;
    }
    this._slideIcon.classList.toggle("off", !isOn(stateObj));
    this.slide.hidden = !dimmable(hass, this._entityId);
    nameItem(this.slide, `${entityName(hass, this._entityId) ?? ""} brightness`);
    this.slide.style.setProperty("--feature-color", color);
    this.slide.firstChild.color = color;
    this.slide.firstChild.hass = hass;
  }
}

const LIGHT_CSS = `
  ha-tile-icon { flex: none; }
  .row > ha-tile-icon {
    flex: 1 1 0; min-width: ${ITEM_MIN.key}px; display: block; height: 100%;
    --tile-icon-size: 100%; --ha-tile-icon-border-radius: var(--feature-border-radius, 12px);
  }
  .row > ha-tile-icon:active { transform: none; }
  .slide { display: block; min-width: 0; border-radius: var(--feature-border-radius, 12px); }
  .slide[hidden] { display: none; }
  .slide.slider { position: relative; isolation: isolate; }
  .slide.slider > ha-state-icon {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: none;
    --mdc-icon-size: 22px; color: var(--primary-text-color); mix-blend-mode: overlay; display: flex;
  }
  .slide.slider > ha-state-icon.off { opacity: .45; }
`;

/** Show these elements in a box, replacing what it shows only when they differ. */
function showChildren(box, items) {
  if (items.length !== box.children.length || items.some((item, i) => box.children[i] !== item)) box.replaceChildren(...items);
}

/**
 * What every feature has: its configuration, Home Assistant and its context
 * (the card's entity), the printer's model and the controls chosen. A
 * feature declares, as static fields:
 * - label (its title: its element is prusa- and the title) and pickerName
 *   (its name in Home Assistant's feature picker),
 * - controls: the ids it offers, in their default order, or
 *   controlIds(device) for ids that depend on the printer; defaults: the
 *   ones shown by default (all it offers, unless given),
 * - form: its editor's { label, helper, options } (options: { name, label,
 *   helper, default, selector }; on and off, on unless the default is false),
 * - display: whether its keys follow Show.
 */
class PrusaElement extends HTMLElement {
  static get type() {
    return `prusa-${this.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  }

  static controls = [];
  // The option that lists the controls chosen
  static controlsKey = "controls";
  static form = {};

  static getStubConfig() {
    return { type: `custom:${this.type}` };
  }

  static getConfigElement() {
    return document.createElement("prusa-feature-editor");
  }

  static controlIds() {
    return this.controls;
  }

  /** The controls shown when none are chosen: the defaults, or all it offers. */
  static defaultsFor(device) {
    return this.defaults ?? this.controlIds(device);
  }

  /** A control the feature shows, and its entity. */
  static controlFor(id, device) {
    const control = controlOf(id);
    return { control, entityId: control && device.roles[control.role] };
  }

  /** The name of a control in the editor: its entity's, or for a pair, its reading's and "and target". */
  static nameOf(id, device, hass) {
    const { control, entityId } = this.controlFor(id, device);
    if (!control) return id;
    if (control.kind === "pair") {
      const reading = entityName(hass, device.roles[control.parts[0]]);
      return reading ? `${reading} and target` : control.option ?? id;
    }
    return (control.picks ? control.option : entityName(hass, entityId)) ?? control.option ?? valueOf(control.name, {}) ?? id;
  }

  /**
   * The controls the feature offers for a printer, in order, for the
   * editor: those the printer has, and those the integration does not offer
   * yet (they show once it does).
   */
  static offered(device, hass) {
    return this.controlIds(device).flatMap((id) => {
      const { control } = this.controlFor(id, device);
      if (!control) return [];
      if (present(control, device)) return [{ value: id, label: this.nameOf(id, device, hass) }];
      return PENDING.includes(id) ? [{ value: id, label: `${control.option ?? id} (not offered yet)` }] : [];
    });
  }

  /** The controls of this feature that the integration does not offer yet, by name. */
  static pendingOf(device) {
    return this.controlIds(device).filter((id) => PENDING.includes(id) && !present(this.controlFor(id, device).control, device))
      .map((id) => controlOf(id)?.option ?? id);
  }

  /** Whether Home Assistant's feature picker offers the feature: it has a control, or one the integration will offer. */
  static supports(device, hass) {
    return this.offered(device, hass).length > 0;
  }

  /** The feature's editor form: { schema, data }, from its controls, display and options. */
  static editor(hass, entityId) {
    const { label, helper, options = [] } = this.form;
    const device = deviceOf(hass, entityId);
    const offered = this.offered(device, hass);
    const values = offered.map((o) => o.value);
    return {
      pending: this.pendingOf(device),
      schema: [
        ...(label ? [{
          name: this.controlsKey, label, ...(helper ? { helper } : {}),
          selector: { select: { multiple: true, reorder: true, mode: "dropdown", options: offered } },
        }] : []),
        ...(this.display ? [displayField()] : []),
        ...options.map((option) => ({
          name: option.name, label: option.label, ...(option.helper ? { helper: option.helper } : {}), selector: option.selector ?? { boolean: {} },
        })),
      ],
      data: (c) => ({
        ...(label ? {
          [this.controlsKey]: Array.isArray(c[this.controlsKey]) ? c[this.controlsKey] : this.defaultsFor(device).filter((value) => values.includes(value)),
        } : {}),
        ...(this.display ? { show: displayOf(c) } : {}),
        ...Object.fromEntries(options.map(({ name, selector, default: value = true }) => [
          name, selector ? c[name] ?? value : typeof c[name] === "boolean" ? c[name] : value,
        ])),
      }),
    };
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    keepTaps(this);
  }

  /** Fit a row now (see fitRow), and again whenever its width changes. */
  _fit(row) {
    this._fitter ??= new ResizeObserver((entries) => entries.forEach((entry) => fitRow(entry.target)));
    this._fitted ??= new WeakSet();
    if (!this._fitted.has(row)) {
      this._fitted.add(row);
      this._fitter.observe(row);
    }
    fitRow(row);
  }

  setConfig(config) {
    if (!config) throw new Error("Invalid configuration");
    this._config = config;
    this._render();
  }

  set hass(hass) {
    const before = this._hass;
    this._hass = hass;
    if (this._config && this._context && !changedFor(before, hass, this._entityId)
      && !this._watched().some((id) => before?.states[id] !== hass.states[id])) return;
    this._render();
  }

  /** Entities outside the printer's that the feature shows (see PrusaCameras). */
  _watched() {
    return [];
  }

  set context(context) {
    this._context = context;
    this._render();
  }

  get _entityId() {
    return this._context?.entity_id;
  }

  get _device() {
    return deviceOf(this._hass, this._entityId);
  }

  _ready() {
    return !!(this._hass && this._config && this._context);
  }

  /** What the controls' rules look at: hass, the printer, its phase and the feature's configuration. */
  _moment() {
    const hass = this._hass, id = this._entityId;
    return { hass, device: deviceOf(hass, id), phase: phaseNow(hass, id), config: this._config };
  }

  /** The ids of the controls chosen, in order: the option's list, or the defaults. */
  _chosen() {
    const chosen = this._config[this.constructor.controlsKey];
    return Array.isArray(chosen) ? chosen : this.constructor.defaultsFor(this._device);
  }

  _usable(entityId) {
    const stateObj = entityId ? this._hass.states[entityId] : undefined;
    return !!stateObj && stateObj.state !== "unavailable";
  }

  connectedCallback() {
    this._render();
  }

  /**
   * A feature with nothing to show shows nothing at all: neither itself nor
   * its place among the card's features.
   */
  _showNothing(nothing) {
    const display = nothing ? "none" : "";
    if (this.style.display !== display) this.style.display = display;
    const host = this.getRootNode()?.host;
    if (host?.localName === "hui-card-feature" && host.style.display !== display) host.style.display = display;
  }
}

/**
 * Rows of keys: the chosen controls'. A feature lists its rows in
 * _lines(): each a list of items, { key, label, entity (whose icon it
 * shows) or icon, text, color, pressed, disabled, action, readout (a state
 * only shown), dim, heat (a heater's state), spin (seconds per turn of the
 * icon), alwaysText, wide, menu and choose (a key that opens a list) },
 * or a field ({ field, entities }), or a pair ({ pair: [read-out, field] }).
 */
class PrusaFeature extends PrusaElement {
  static display = true;
  // Rows that wrap onto more lines, rather than leaving items out
  static wraps = false;

  constructor() {
    super();
    this.shadowRoot.innerHTML = `<style>${FEATURE_CSS}</style><div class="rows" role="group"></div>`;
    this._box = this.shadowRoot.querySelector(".rows");
    this._groups = new Map();
  }

  /** The rows: one, of the chosen controls' keys. */
  _lines() {
    const moment = this._moment();
    return [this._chosen().flatMap((id) => this._controlKey(id, moment)).filter(Boolean)];
  }

  /** The key (or keys) for one of the feature's controls, or none when the printer does not have it. */
  _controlKey(id, moment, options) {
    if (!this.constructor.controlIds(moment.device).includes(id)) return [];
    const { control, entityId } = this.constructor.controlFor(id, moment.device);
    if (!control) return [];
    if (control.pick) return this._controlKey(control.pick(moment), moment, options);
    if (!entityId && !["presets", "cool_down"].includes(control.kind)) return [];
    const keys = keyOf(this, control, entityId, moment);
    return [].concat(keys ?? []).map((key) => ({ ...key, ...options }));
  }

  _render() {
    if (!this._ready()) return;
    this._box.setAttribute("aria-label", this.constructor.label);
    const tints = HEAT_TINTS[darkMode(this._hass) ? "dark" : "light"];
    this.style.setProperty("--prusa-heating", tints.heating);
    this.style.setProperty("--prusa-cooling", tints.cooling);
    const lines = this._lines().filter((line) => line.length);
    const keys = lines.flat().flatMap((b) => b.pair ?? [b]);
    const colors = new Map(keys.filter((b) => !b.field).map((b) => [b, textOn(this, b.color ? cssColor(b.color) : ENABLED)]));
    if ([...colors.values()].includes(null) && !this._retry) {
      this._retry = true;
      requestAnimationFrame(() => {
        this._retry = false;
        this._render();
      });
    }
    this._showNothing(lines.length === 0);
    const strip = (b) => (b.field ? { field: b.field } : b.pair ? { pair: b.pair.map(strip) } : (({ action, choose, ...rest }) => rest)(b));
    const key = JSON.stringify([lines.map((line) => line.map(strip)), [...colors.values()], displayOf(this._config)]);
    if (key !== this._key) {
      this._key = key;
      this._rows = lines.map((line, i) => {
        const row = this._rowEls?.[i] ?? document.createElement("div");
        row.className = this.constructor.wraps ? "row wraps" : "row";
        showChildren(row, line.map((b) => this._item(b, colors)));
        return row;
      });
      this._rowEls = this._rows;
      showChildren(this._box, this._rows);
    }
    for (const b of keys) if (b.field) this._group(b.field).update(b);
    // The entities' icons follow their states without drawing the keys again
    for (const icon of this._box.querySelectorAll("ha-state-icon[data-entity]")) {
      icon.hass = this._hass;
      icon.stateObj = this._hass.states[icon.dataset.entity];
    }
    for (const row of this._rows ?? []) this._fit(row);
  }

  /** An item of a row: a field's group, a pair, or a key. */
  _item(b, colors) {
    if (b.field) return this._group(b.field).el;
    if (b.pair) {
      const combo = document.createElement("div");
      combo.className = "combo";
      combo.append(...b.pair.map((part) => this._item(part, colors)));
      return combo;
    }
    return this._button(b, colors.get(b));
  }

  /** A field's group, made once and kept while the feature shows it. */
  _group(id) {
    if (!this._groups.has(id)) this._groups.set(id, new FieldGroup(this, controlOf(id)));
    return this._groups.get(id);
  }

  _button(b, onColor) {
    const display = this.constructor.display ? displayOf(this._config) : "icons";
    // A key with a list is a label around the browser's own select (a button cannot hold one)
    const button = document.createElement(b.readout ? "div" : b.menu ? "label" : "button");
    if (b.readout) {
      button.className = `field readout${b.wide ? " wide" : ""}${b.dim ? " dim" : ""}${b.heat ? ` heater ${b.heat}` : ""}`;
      button.tabIndex = 0;
      button.setAttribute("role", "button");
      button.addEventListener("keydown", (ev) => {
        if (ev.key !== "Enter" && ev.key !== " ") return;
        ev.preventDefault();
        b.action?.();
      });
      button.dataset.min = b.wide ? ITEM_MIN.wide : ITEM_MIN.readout;
    } else {
      if (!b.menu) button.type = "button";
      button.className = "key";
      button.dataset.min = ITEM_MIN.key;
    }
    button.dataset.key = b.key;
    nameItem(button, b.label);
    if (b.pressed !== undefined && !b.readout) button.setAttribute("aria-pressed", String(!!b.pressed));
    button.disabled = !!b.disabled;
    button.classList.toggle("disabled", !!b.disabled && (!!b.readout || !!b.menu));
    if (b.color) button.style.setProperty("--c", cssColor(b.color));
    if (onColor) button.style.setProperty("--prusa-on-color", onColor);
    let icon;
    if (b.entity) {
      icon = document.createElement("ha-state-icon");
      icon.dataset.entity = b.entity;
      icon.hass = this._hass;
      icon.stateObj = this._hass.states[b.entity];
    } else if (b.icon) {
      icon = document.createElement("ha-icon");
      icon.icon = b.icon;
    }
    if (icon && b.spin) {
      icon.classList.add("spin");
      icon.style.setProperty("--spin", `${b.spin}s`);
    }
    const { showIcon, showText } = faceOf(b, b.readout ? "both" : display);
    if (showIcon) button.append(icon);
    if (showText) {
      const text = document.createElement("span");
      text.textContent = b.text;
      // A fan's mode (Off, A, a speed) beside its icon
      if (showIcon && !b.readout && b.alwaysText) text.className = "mod";
      if (b.heat) {
        const heat = document.createElement("span");
        heat.className = "heat";
        if (b.heat === "off") {
          const two = document.createElement("span");
          two.className = "two";
          const note = document.createElement("span");
          note.className = "note";
          note.textContent = "Off";
          two.append(text, note);
          heat.append(two);
        } else {
          heat.append(text);
        }
        if (b.heat === "heating" || b.heat === "cooling") {
          const arrow = document.createElement("ha-icon");
          arrow.className = "arrow";
          arrow.icon = b.heat === "heating" ? "mdi:arrow-up" : "mdi:arrow-down";
          heat.append(arrow);
        }
        button.append(heat);
      } else {
        button.append(text);
      }
    }
    if (b.menu) {
      // The browser's own list of choices, over the whole key
      const menu = document.createElement("select");
      menu.disabled = !!b.disabled;
      menu.setAttribute("aria-label", b.label);
      menu.append(new Option(b.text, ""), ...b.menu.map((o) => new Option(o.label, o.value)));
      menu.addEventListener("change", () => {
        b.choose?.(menu.value);
        menu.value = "";
      });
      menu.addEventListener("click", (ev) => ev.stopPropagation());
      button.append(menu);
      return button;
    }
    button.addEventListener("click", (ev) => {
      ev.stopPropagation();
      b.action?.();
    });
    return button;
  }
}

// ---------------------------------------------------------------------------
// Features
// ---------------------------------------------------------------------------

// The print: Pause print or Resume print (one key), the keys on their own,
// Stop print (asking first), and the job's read-outs
class PrusaPrint extends PrusaFeature {
  static label = "Print";
  static pickerName = "Prusa print";
  static controls = ["pause_resume", "pause", "resume", "stop", "progress", "time_remaining", "time_printing", "finish_time", "job_name"];
  static defaults = ["pause_resume", "stop", "time_remaining", "progress"];
  static form = {
    label: "Controls",
    helper: "Pause print or Resume print is one key: Resume print while the print is paused, Pause print otherwise.",
    options: [{ name: "ask_before_stopping", label: "Ask before stopping a print" }],
  };
}

/** Each heater's reading, target and both as one: each tool's nozzle, the bed and the chamber. */
const heaterIds = (device) => [
  ...device.tools.map((n) => `tool_${n}_nozzle_temperature`), "bed_temperature", "chamber_temperature",
];
const pairOf = (reading) => `${reading}_and_target`;
const targetOf = (reading) => reading.replace(/_temperature$/, "_target_temperature");

// Temperatures: each heater's reading, its target (a field), or both as one
// control; the chamber fan; Presets and Cool down. The row wraps onto more
// lines, so every heater shows.
class PrusaTemperatures extends PrusaFeature {
  static label = "Temperatures";
  static pickerName = "Prusa temperatures";
  static wraps = true;
  static form = {
    label: "Controls",
    helper: "A heater and its target shows the temperature over its target. Tap it to type a target, press and slide to change it, or hold it to turn that heater off (hold again for the target it had). Presets set every nozzle and the bed; Cool down turns every heater off.",
    options: [{ name: "animate_fan", label: "Animate fan", helper: "The chamber fan's icon turns while it runs, faster at a higher speed." }],
  };

  static controlIds(device) {
    return [...heaterIds(device).flatMap((reading) => [pairOf(reading), reading, targetOf(reading)]), "chamber_fan", "presets", "cool_down"];
  }

  static defaultsFor(device) {
    return [...heaterIds(device).map(pairOf), "chamber_fan", "presets", "cool_down"];
  }
}

// The colors of Prusa history's lines: each heater keeps one color of
// Prusa Connect's palette, in its order, and its target the same color
// dimmed (half way to the theme's background). Past five heaters (an XL with
// five tools), the tools keep the five colors and the bed and chamber take
// the text's tones.
function historyColors(ids, hass) {
  const dark = darkMode(hass);
  const dim = (hex) => {
    const background = dark ? [17, 17, 17] : [255, 255, 255];
    const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return `#${rgb.map((c, i) => Math.round((c + background[i]) / 2).toString(16).padStart(2, "0")).join("")}`;
  };
  const palette = PALETTE[dark ? "dark" : "light"];
  const heaters = [...new Set(ids.map((id) => id.replace("_target_temperature", "_temperature")))];
  const toneOf = (heater) => (heater === "bed_temperature" ? (dark ? "#e1e1e3" : "#1c1c1e") : dark ? "#9b9ea4" : "#5d6168");
  return ids.map((id) => {
    const heater = id.replace("_target_temperature", "_temperature");
    const at = heaters.length <= 5 ? heaters.indexOf(heater) : heaters.filter((h) => h.startsWith("tool_")).indexOf(heater);
    const color = at >= 0 ? palette[at % palette.length] : toneOf(heater);
    return id === heater ? color : dim(color);
  });
}

/** A heater's short name in the history's legend: Nozzle (Nozzle 2 with several tools), Bed, Chamber, and "target" after a target. */
function historyName(id, device) {
  const control = controlOf(id);
  const heater = control.tool !== undefined ? `Nozzle${device.tools.length > 1 ? ` ${control.tool}` : ""}` : id.startsWith("bed") ? "Bed" : "Chamber";
  return /_target_temperature$/.test(id) ? `${heater} target` : heater;
}

/**
 * Prusa history: Home Assistant's own history graph card of the heaters'
 * readings and targets, with its options (hours_to_show, min_y_axis,
 * max_y_axis, fit_y_data), in Prusa Connect's chart palette (see
 * historyColors). The graph takes its line colors from the theme's graph
 * colors, which the feature sets for the lines it holds.
 */
class PrusaHistory extends PrusaElement {
  static label = "History";
  static pickerName = "Prusa history";
  static controlsKey = "entities";
  static form = {
    label: "Entities",
    options: [
      { name: "hours_to_show", label: "Hours to show", default: 1, selector: { number: { mode: "box", min: 1, step: 1 } } },
      { name: "min_y_axis", label: "Minimum Y axis", default: undefined, selector: { number: { mode: "box", step: "any" } } },
      { name: "max_y_axis", label: "Maximum Y axis", default: undefined, selector: { number: { mode: "box", step: "any" } } },
      { name: "fit_y_data", label: "Fit Y axis to the data", default: false },
      {
        name: "full_width", label: "Full width", default: false,
        helper: "The features sit beside the title in two columns. On: the graph stretches across both. Off: it takes one column.",
      },
    ],
  };

  static controlIds(device) {
    return heaterIds(device).flatMap((reading) => [reading, targetOf(reading)]);
  }

  constructor() {
    super();
    this.shadowRoot.innerHTML = `<style>
      :host { display: block; min-width: 0; max-width: 100%; height: 100%; }
      .graph {
        display: flex; flex-direction: column; height: 100%; min-height: 240px; box-sizing: border-box;
        --ha-card-background: transparent; --card-background-color: transparent; --ha-card-box-shadow: none;
        --ha-card-border-width: 0; --ha-card-border-color: transparent; --ha-card-backdrop-filter: none;
        border-radius: var(--feature-border-radius, 12px); overflow: hidden;
        background: var(--prusa-feature-backing, var(--prusa-feature-scrim, transparent));
      }
      /* Home Assistant's history graph card is an inline element of its own: as a block that fills the feature, its chart fills it too */
      .graph > * { display: block; flex: 1 1 auto; min-height: 0; height: 100%; }
    </style><div class="graph"></div>`;
    this._box = this.shadowRoot.querySelector(".graph");
  }

  _render() {
    if (!this._ready()) return;
    const device = this._device;
    const ids = this._chosen().filter((id) => this.constructor.controlIds(device).includes(id) && device.roles[id]);
    this._showNothing(ids.length === 0);
    if (!ids.length) return;
    const colors = historyColors(ids, this._hass);
    const c = this._config;
    // A fixed height (grid_options rows) makes the card's chart fill the
    // feature's height; the legend shows every line
    const config = {
      type: "history-graph",
      entities: ids.map((id, i) => ({ entity: device.roles[id], name: historyName(id, device), color: colors[i] })),
      hours_to_show: Number(c.hours_to_show) || 1, grid_options: { rows: 4 }, expand_legend: true,
      ...(Number.isFinite(c.min_y_axis) ? { min_y_axis: c.min_y_axis } : {}),
      ...(Number.isFinite(c.max_y_axis) ? { max_y_axis: c.max_y_axis } : {}),
      ...(c.fit_y_data === true ? { fit_y_data: true } : {}),
    };
    const key = JSON.stringify(config);
    if (key !== this._shown) {
      this._shown = key;
      if (this._graph) this._graph.setConfig(config);
      else if (!this._loading) {
        // Home Assistant's history graph card, made by its card helpers as a dashboard makes it
        this._loading = window.loadCardHelpers?.().then((helpers) => {
          this._graph = helpers.createCardElement(JSON.parse(this._shown));
          this._graph.hass = this._hass;
          this._box.replaceChildren(this._graph);
        });
      }
    }
    if (this._graph) this._graph.hass = this._hass;
  }
}

// Nozzles: one row for each tool, the controls chosen of each
const NOZZLE_KEYS = ["material", "nozzle_diameter", "nozzle_high_flow", "nozzle_hardened", "active", "print_fan_speed", "heatbreak_fan_speed"];

class PrusaNozzles extends PrusaFeature {
  static label = "Nozzles";
  static pickerName = "Prusa nozzles";
  static display = false;
  static controls = NOZZLE_KEYS;
  static defaults = ["material", "nozzle_diameter", "active", "print_fan_speed"];
  static form = {
    label: "Controls",
    helper: "Each tool has a row of its own.",
    options: [{ name: "animate_fan", label: "Animate fan", helper: "A fan's icon turns while the fan runs." }],
  };

  /** A control as the first tool that has it has it. */
  static controlFor(id, device) {
    const n = device.tools.find((tool) => device.roles[`tool_${tool}_${id}`]) ?? 1;
    const control = controlOf(`tool_${n}_${id}`);
    return { control, entityId: control && device.roles[control.role] };
  }

  /** Each control by its entity's name, without its tool (Tool 1 material: Material). */
  static nameOf(id, device, hass) {
    const name = super.nameOf(id, device, hass).replace(/^Tool \d+\s+/i, "");
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  /** Active only for a printer with more than one tool. */
  static offered(device, hass) {
    return super.offered(device, hass).filter((o) => o.value !== "active" || device.tools.length > 1);
  }

  _lines() {
    const moment = this._moment(), { device } = moment;
    const chosen = this._chosen().filter((id) => NOZZLE_KEYS.includes(id) && (id !== "active" || device.tools.length > 1));
    return device.tools.map((n) => chosen.flatMap((id) => {
      const control = controlOf(`tool_${n}_${id}`);
      const entityId = device.roles[control.role];
      return entityId ? [].concat(keyOf(this, control, entityId, moment) ?? []) : [];
    }));
  }
}

// Movement: print speed and flow (fields), the positions, Home and Disable
// steppers. Only Z while printing (on by default): X and Y hide during a print.
class PrusaMovement extends PrusaFeature {
  static label = "Movement";
  static pickerName = "Prusa movement";
  static controls = ["speed", "flow", "axis_z", "axis_x", "axis_y", "home", "disable_steppers"];
  static defaults = ["speed", "flow", "axis_z", "axis_x", "axis_y"];
  static form = {
    label: "Controls",
    helper: "Print speed and flow are fields: tap one to type a value, or press and slide on it.",
    options: [
      { name: "only_z_while_printing", label: "Only Z while printing", helper: "X and Y hide while a print is under way." },
      { name: "units", label: "Units", default: false, helper: "The positions show their unit (mm)." },
    ],
  };

  _lines() {
    const moment = this._moment();
    const onlyZ = this._config.only_z_while_printing !== false && JOB_PHASES.includes(moment.phase);
    return [this._chosen().filter((id) => !(onlyZ && (id === "axis_x" || id === "axis_y")))
      .flatMap((id) => this._controlKey(id, moment)).filter(Boolean)];
  }
}

// Utilities, as Prusa Connect names them: Beep and Reset printer (asking first)
class PrusaUtilities extends PrusaFeature {
  static label = "Utilities";
  static pickerName = "Prusa utilities";
  static controls = ["beep", "reset_printer"];
  static form = {
    label: "Controls",
    options: [{ name: "ask_before_resetting", label: "Ask before resetting the printer" }],
  };
}

// ---------------------------------------------------------------------------
// Feature: the lights as a light's tile card shows them (see LightRow): the
// light's icon and its slider are two choices, in one row, in the order chosen
// ---------------------------------------------------------------------------
const LIGHTS = ["chamber_light"];

class PrusaLights extends PrusaElement {
  static label = "Lights";
  static pickerName = "Prusa lights";
  static form = {
    label: "Controls",
    options: [{
      name: "off_at_minimum", label: "Off at minimum", default: false,
      helper: "Moving a light's slider to its minimum (1%) turns the light off.",
    }],
  };

  /** Each light's icon and slider: "<light>" and "<light>_brightness". */
  static controlIds() {
    return LIGHTS.flatMap((light) => [light, `${light}${BRIGHTNESS}`]);
  }

  static controlFor(id, device) {
    const light = id.endsWith(BRIGHTNESS) ? id.slice(0, -BRIGHTNESS.length) : id;
    if (!LIGHTS.includes(light)) return { control: undefined };
    const part = light === id ? "icon" : "brightness";
    const base = controlOf(light);
    const control = { ...base, id, part, option: part === "brightness" ? `${base.option} brightness` : base.option };
    return { control, entityId: device.roles[light] };
  }

  static nameOf(id, device, hass) {
    const { control, entityId } = this.controlFor(id, device);
    const name = entityName(hass, entityId) ?? controlOf(control.role).option;
    return control.part === "brightness" ? `${name} brightness` : name;
  }

  constructor() {
    super();
    this.shadowRoot.innerHTML = `<style>
      :host { display: block; min-width: 0; max-width: 100%; }
      ${ROW_CSS}
      ${LIGHT_CSS}
    </style><div class="row" role="group"></div>`;
    this._row = this.shadowRoot.querySelector(".row");
    this._lights = new Map();
  }

  _render() {
    if (!this._ready()) return;
    const device = this._device;
    this._row.setAttribute("aria-label", this.constructor.label);
    const items = this._chosen().map((id) => ({ id, ...this.constructor.controlFor(id, device) }))
      .filter(({ control, entityId }) => control && entityId)
      .map(({ control, entityId }) => {
        if (!this._lights.has(entityId)) this._lights.set(entityId, new LightRow(this, entityId));
        const light = this._lights.get(entityId);
        light.update();
        return control.part === "icon" ? light.icon : light.slide;
      })
      // A light without a brightness has no slider
      .filter((el) => !el.hidden);
    this._showNothing(items.length === 0);
    showChildren(this._row, items);
    this._fit(this._row);
  }
}

// ---------------------------------------------------------------------------
// Feature: a camera, with keys to switch between the printer's cameras. The
// picture is Home Assistant's own hui-image, the element its picture cards
// show a camera with: snapshots it refreshes itself (Auto), or the camera's
// live stream (Live). Crop: two taps on the picture choose the part shown,
// kept in this browser's memory for the session (the camera is not changed).
// ---------------------------------------------------------------------------
const CAMERA_VIEWS = [["auto", "Auto"], ["live", "Live"]];
// Each camera's crop ({ x, y, w, h }, shares of the whole picture), and the cameras whose crop is shown
const CROPS = new Map();
const CROPPING = new Set();
// Each camera's picture size, the last one known (see _pictureSize)
const SIZES = new Map();
// A crop narrower than this share of the picture is a slip, not a crop
const MIN_CROP = .02;
// A tap moves the pointer less than this between press and release (px)
const TAP_SLOP = 10;

class PrusaCameras extends PrusaFeature {
  static label = "Cameras";
  static pickerName = "Prusa cameras";
  static controls = ["camera_buttons", "camera_toggle", "crop"];
  static defaults = ["camera_buttons", "crop"];

  // Any printer can show a camera: its own, or any other camera entity (see camerasOf)
  static supports() {
    return true;
  }

  static offered() {
    return [{ value: "camera_buttons", label: "Camera buttons" }, { value: "camera_toggle", label: "Camera toggle" }, { value: "crop", label: "Crop" }];
  }

  static editor(hass, entityId) {
    const device = deviceOf(hass, entityId);
    const offered = this.offered(device, hass);
    const own = device.cameras.map((camera) => camera.entityId);
    return {
      pending: [],
      schema: [
        {
          name: "cameras", label: "Cameras",
          helper: "The printer's cameras from Prusa Connect, or any other camera entities, such as one that shows the printer better. The first shows when the card loads; the keys switch between them.",
          selector: { entity: { domain: "camera", multiple: true, reorder: true } },
        },
        {
          name: "camera_view", label: "Camera view",
          helper: "Auto: snapshots that Home Assistant refreshes. Live: the camera's stream.",
          selector: select(CAMERA_VIEWS),
        },
        {
          name: "controls", label: "Controls",
          helper: "Crop: tap two corners on the picture to show only that part, in this browser until the page is reloaded. Tap Crop again for the whole picture.",
          selector: { select: { multiple: true, reorder: true, mode: "dropdown", options: offered } },
        },
        displayField(),
        {
          name: "show_last_updated", label: "Show the last updated time",
          helper: "In the Auto view, along the bottom of the picture, in the card's Time format (under Content).",
          selector: { boolean: {} },
        },
        {
          name: "full_width", label: "Full width",
          helper: "The features sit beside the title in two columns. On: the picture stretches across both. Off: it takes one column, and the next features sit beside it.",
          selector: { boolean: {} },
        },
      ],
      data: (c) => ({
        cameras: Array.isArray(c.cameras) && c.cameras.length ? c.cameras : own, camera_view: c.camera_view === "live" ? "live" : "auto",
        controls: Array.isArray(c.controls) ? c.controls : this.defaults.filter((id) => offered.some((o) => o.value === id)),
        show: displayOf(c), show_last_updated: c.show_last_updated !== false, full_width: c.full_width !== false,
      }),
    };
  }

  constructor() {
    super();
    const style = document.createElement("style");
    style.textContent = `
      .shot {
        position: relative; display: block; width: 100%; padding: 0; border: 0; cursor: pointer;
        border-radius: var(--feature-border-radius, 12px); overflow: hidden; background: #111;
        touch-action: manipulation; user-select: none; -webkit-user-select: none;
      }
      .shot:has(+ .rows:not(:empty)) { margin-bottom: var(--ha-card-feature-gap, 12px); }
      .shot.cropping { cursor: crosshair; }
      .view { position: relative; overflow: hidden; }
      .view hui-image { display: block; }
      .view.cropped hui-image { position: absolute; }
      .area {
        position: absolute; pointer-events: none; box-sizing: border-box;
        border: 2px solid ${ENABLED}; box-shadow: 0 0 0 1px rgba(0, 0, 0, .6), 0 0 0 100vmax rgba(0, 0, 0, .35);
      }
      .area[hidden] { display: none; }
      .hint, .time {
        position: absolute; left: 0; right: 0; text-align: start; pointer-events: none;
        font-size: var(--ha-font-size-s, 12px); color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, .9);
      }
      .hint { top: 0; padding: 6px 12px 16px; background: linear-gradient(to bottom, rgba(0, 0, 0, .6), rgba(0, 0, 0, 0)); }
      .time { bottom: 0; padding: 16px 12px 6px; background: linear-gradient(to top, rgba(0, 0, 0, .6), rgba(0, 0, 0, 0)); }
      .hint:empty, .time:empty { display: none; }`;
    this._shot = document.createElement("button");
    this._shot.type = "button";
    this._shot.className = "shot";
    this._shot.innerHTML = `<div class="view"></div><span class="area" hidden></span><span class="hint"></span><span class="time"></span>`;
    this._view = this._shot.querySelector(".view");
    this._area = this._shot.querySelector(".area");
    this._hint = this._shot.querySelector(".hint");
    this._time = this._shot.querySelector(".time");
    // A tap is a pointer pressed and let go in about one place; the click
    // that follows on touch is the same tap
    this._shot.addEventListener("pointerdown", (ev) => {
      this._down = ev.button === 0 ? { x: ev.clientX, y: ev.clientY } : undefined;
      this._tapped = false;
    });
    this._shot.addEventListener("pointerup", (ev) => {
      const down = this._down;
      this._down = undefined;
      if (!down || Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > TAP_SLOP) return;
      this._tapped = true;
      this._tap(ev);
    });
    this._shot.addEventListener("click", (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      if (this._tapped) this._tapped = false;
      else this._tap(ev);
    });
    // After the first corner, the rectangle follows the pointer
    this._shot.addEventListener("pointermove", (ev) => {
      if (this._first) this._showArea(this._first.at, this._placeOf(ev));
    });
    this.shadowRoot.prepend(style);
    this._box.before(this._shot);
    this._sizer = new ResizeObserver(() => this._applyCrop());
    this._sizer.observe(this._shot);
  }

  get _cameraView() {
    return this._config?.camera_view === "live" ? "live" : "auto";
  }

  /** The cameras shown, in order: those chosen (cameras), or else the printer's own. */
  _cameras() {
    const chosen = Array.isArray(this._config.cameras) ? this._config.cameras.filter((id) => typeof id === "string" && id.startsWith("camera.")) : [];
    return chosen.length ? chosen.map((entityId) => ({ entityId, id: entityId })) : this._device.cameras;
  }

  _watched() {
    return this._config && this._device ? this._cameras().map((camera) => camera.entityId) : [];
  }

  /** Nothing to show only without a camera: the picture always shows. */
  _render() {
    if (!this._ready()) return;
    const cameras = this._cameras();
    const current = this._currentCamera(cameras);
    if (current !== this._camera) {
      this._camera = current;
      this._pictureAt = undefined;
      this._first = undefined;
      this._area.hidden = true;
    }
    super._render();
    this._showNothing(cameras.length === 0);
    this._showCamera();
  }

  _lines() {
    const moment = this._moment();
    const cameras = this._cameras();
    const current = this._camera;
    const nameOf = (camera) => entityName(moment.hass, camera.entityId) ?? camera.id;
    const shortOf = (camera) => nameOf(camera).replace(/^Camera\s+/i, "");
    const keys = {
      camera_buttons: () => (cameras.length < 2 ? [] : cameras.map((c) => ({
        key: c.entityId, entity: c.entityId, label: nameOf(c), text: shortOf(c),
        pressed: c.entityId === current, disabled: !this._usable(c.entityId), action: () => this._pick(c.entityId),
      }))),
      camera_toggle: () => {
        if (cameras.length < 2) return [];
        const at = cameras.findIndex((c) => c.entityId === current);
        const next = [...cameras.slice(at + 1), ...cameras.slice(0, at)].find((c) => this._usable(c.entityId));
        const shown = cameras[at];
        return [{
          key: "camera_toggle", entity: shown.entityId, text: shortOf(shown),
          label: next ? `${nameOf(shown)}. Tap for ${nameOf(next)}` : nameOf(shown), pressed: false, disabled: !next,
          action: () => next && this._pick(next.entityId),
        }];
      },
      crop: () => {
        if (!current) return [];
        const on = CROPPING.has(current);
        return [{
          key: "crop", icon: "mdi:crop", text: "Crop", pressed: on, disabled: !this._usable(current),
          label: on ? "Crop: on. Tap two corners on the picture; tap Crop again for the whole picture" : "Crop",
          action: () => this._toggleCropping(),
        }];
      },
    };
    return [this._chosen().flatMap((id) => keys[id]?.() ?? [])];
  }

  _pick(entityId) {
    this._picked = entityId;
    this._key = undefined;
    this._render();
  }

  _currentCamera(cameras) {
    const ids = cameras.map((camera) => camera.entityId);
    if (this._picked && ids.includes(this._picked)) return this._picked;
    return ids[0];
  }

  /**
   * Home Assistant's image stops fetching photos when the connection to
   * Home Assistant drops, and does not start again after it returns while it
   * stays on screen; a camera that was unavailable can leave it on a broken
   * picture. Either way, the image is made anew.
   */
  set hass(hass) {
    const before = this._hass;
    if (before && this._image) {
      const camera = this._image.cameraImage;
      const back = before.connected === false && hass.connected !== false;
      const returned = before.states[camera]?.state === "unavailable" && hass.states[camera] && hass.states[camera].state !== "unavailable";
      if (back || returned) this._dropImage();
    }
    super.hass = hass;
  }

  _dropImage() {
    this._image?.remove();
    this._image = undefined;
    this._watchedRoot = undefined;
  }

  /** Whether the picture is waiting for the crop's corners: Crop is on, with no crop chosen yet. */
  get _choosing() {
    return CROPPING.has(this._camera) && !CROPS.has(this._camera);
  }

  /** A tap on the picture: while a crop is being chosen it marks a corner; otherwise it opens the camera. */
  _tap(ev) {
    if (!this._camera) return;
    if (this._choosing) this._cropTap(ev);
    else fire(this, "hass-more-info", { entityId: this._camera });
  }

  /**
   * Crop on: two taps on the picture choose the part shown, which stays
   * until Crop is turned off. Off: the whole picture, and the crop is forgotten.
   */
  _toggleCropping() {
    if (CROPPING.has(this._camera)) {
      CROPPING.delete(this._camera);
      CROPS.delete(this._camera);
    } else {
      CROPPING.add(this._camera);
    }
    this._first = undefined;
    this._area.hidden = true;
    this._key = undefined;
    this._render();
  }

  /** A place in the picture box (px). */
  _placeOf(ev) {
    const box = this._shot.getBoundingClientRect();
    const scale = box.width / this._shot.offsetWidth || 1;
    return { left: (ev.clientX - box.left) / scale, top: (ev.clientY - box.top) / scale };
  }

  _showArea(a, b) {
    Object.assign(this._area.style, {
      left: `${Math.min(a.left, b.left)}px`, top: `${Math.min(a.top, b.top)}px`,
      width: `${Math.abs(b.left - a.left)}px`, height: `${Math.abs(b.top - a.top)}px`,
    });
    this._area.hidden = false;
  }

  /** The crop shown now: the camera's while Crop is on, else the whole picture. */
  _shownCrop() {
    return (CROPPING.has(this._camera) && CROPS.get(this._camera)) || { x: 0, y: 0, w: 1, h: 1 };
  }

  // First tap: a corner; second tap: the opposite corner, which sets the crop
  _cropTap(ev) {
    const box = this._view.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const shown = this._shownCrop();
    const u = (ev.clientX - box.left) / box.width, v = (ev.clientY - box.top) / box.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    const point = { x: shown.x + u * shown.w, y: shown.y + v * shown.h, at: this._placeOf(ev) };
    if (!this._first) {
      this._first = point;
      this._showArea(point.at, point.at);
      this._showHint();
      return;
    }
    const first = this._first;
    this._first = undefined;
    this._area.hidden = true;
    const crop = { x: Math.min(first.x, point.x), y: Math.min(first.y, point.y), w: Math.abs(point.x - first.x), h: Math.abs(point.y - first.y) };
    if (crop.w >= MIN_CROP && crop.h >= MIN_CROP) CROPS.set(this._camera, crop);
    this._showHint();
    this._applyCrop();
  }

  _showHint() {
    const on = this._choosing;
    this._shot.classList.toggle("cropping", on);
    this._hint.textContent = !on ? "" : this._first ? "Tap the opposite corner of the crop area" : "Tap a corner to start selection of a crop area";
  }

  /**
   * The picture's own size (an image's, or a live stream's). While a new
   * picture loads it has none yet, so the last size the camera had is kept:
   * the crop and its shape stay steady between pictures.
   */
  _pictureSize() {
    const el = this._image?.shadowRoot && findDeep(this._image.shadowRoot, "img, video", 3);
    const width = el?.naturalWidth || el?.videoWidth, height = el?.naturalHeight || el?.videoHeight;
    if (width && height) SIZES.set(this._camera, { width, height });
    return SIZES.get(this._camera);
  }

  /**
   * Show the crop: the box takes the crop's shape (the whole picture's
   * without one), and the picture is scaled and moved so only the crop
   * shows. The picture itself is the camera's whole picture.
   */
  _applyCrop() {
    if (!this._image) return;
    const crop = this._shownCrop(), size = this._pictureSize();
    // Sized by the picture's last known size, cropped or not, so the box
    // does not shrink while Home Assistant's image loads the next picture
    const cropped = !!size;
    this._view.classList.toggle("cropped", cropped);
    if (!cropped) {
      this._view.style.aspectRatio = "";
      Object.assign(this._image.style, { width: "", left: "", top: "" });
      return;
    }
    this._view.style.aspectRatio = `${size.width * crop.w} / ${size.height * crop.h}`;
    Object.assign(this._image.style, {
      width: `${100 / crop.w}%`, left: `${(-crop.x / crop.w) * 100}%`, top: `${(-crop.y / crop.h) * 100}%`,
    });
  }

  _showCamera() {
    if (!this._hass || !this._config || !this._camera) return;
    if (!customElements.get("hui-image")) {
      // Loaded with Home Assistant's picture cards: ask the card helpers for one
      if (!this._loading) {
        this._loading = true;
        const camera = this._camera;
        window.loadCardHelpers?.()
          .then((helpers) => helpers.createCardElement({ type: "picture-entity", entity: camera, camera_image: camera }))
          .then(() => customElements.whenDefined("hui-image"))
          .then(() => {
            this._loading = false;
            this._showCamera();
          });
      }
      return;
    }
    // One Home Assistant image, for the camera shown, as its picture cards have
    if (this._image?.cameraImage !== this._camera) {
      this._dropImage();
      this._image = document.createElement("hui-image");
      Object.assign(this._image, { entity: this._camera, cameraImage: this._camera });
      this._view.append(this._image);
    }
    if (this._image.hass !== this._hass) this._image.hass = this._hass;
    if (this._image.cameraView !== this._cameraView) this._image.cameraView = this._cameraView;
    this._shot.setAttribute("aria-label", `${entityName(this._hass, this._camera) ?? "Camera"}: ${CROPPING.has(this._camera) ? "crop" : "open"}`);
    this._showHint();
    this._watchPictures();
    this._applyCrop();
    this._showTime();
  }

  // The time shown is when the latest picture arrived in Home Assistant's image
  _watchPictures() {
    const root = this._image?.shadowRoot;
    if (!root) {
      Promise.resolve(this._image?.updateComplete).then(() => this._image?.shadowRoot && this._watchPictures());
      return;
    }
    if (this._watchedRoot === root) return;
    this._watchedRoot = root;
    root.addEventListener("load", () => this._arrived(), true);
    root.addEventListener("loadedmetadata", () => this._applyCrop(), true);
  }

  _arrived() {
    this._applyCrop();
    this._pictureAt = new Date();
    this._showTime();
  }

  /**
   * The last updated time along the bottom of the picture (Auto view):
   * Home Assistant's timestamp display, in the tile card's time format.
   */
  _showTime() {
    const shown = this._config?.show_last_updated !== false && this._cameraView === "auto" && this._pictureAt;
    if (!shown) {
      this._time.replaceChildren();
      return;
    }
    const chosen = cardOf(this)?._config?.time_format;
    this._stamp ??= document.createElement("hui-timestamp-display");
    this._stamp.hass = this._hass;
    this._stamp.ts = this._pictureAt;
    this._stamp.format = TIME_FORMATS.includes(chosen) ? chosen : undefined;
    if (this._stamp.parentNode !== this._time) this._time.replaceChildren("Updated ", this._stamp);
  }
}

// The features, in the order Home Assistant's feature picker lists them
const FEATURES = Object.fromEntries([
  PrusaPrint, PrusaTemperatures, PrusaHistory, PrusaNozzles, PrusaMovement, PrusaLights, PrusaUtilities, PrusaCameras,
].map((feature) => [feature.type, feature]));
const FEATURE_TAGS = Object.keys(FEATURES);

// ---------------------------------------------------------------------------
// The card
// ---------------------------------------------------------------------------

/**
 * The printer's sensors, binary sensors and the server's version, as
 * attributes for the tile card's State content: { role: the state as Home
 * Assistant shows it }. A role is the entity's translation key in the
 * integration (tool_<n>_ before a tool's), connected, and server. The card's
 * own entity is left out. Unknown and unavailable states are left out
 * unless all is true (the editor offers every one).
 */
function sensorAttributes(hass, entityId, all = false) {
  const device = deviceOf(hass, entityId);
  const out = {};
  for (const [role, id] of Object.entries(device.roles)) {
    const domain = domainOf(id);
    if (id === entityId || !["sensor", "binary_sensor", "update"].includes(domain)) continue;
    const stateObj = hass.states[id];
    if (!stateObj || (!known(stateObj) && !all)) continue;
    // The server's update entity shows its installed version
    const value = domain === "update" ? stateObj.attributes.installed_version : hass.formatEntityState(stateObj);
    if (value !== undefined && value !== null) out[role] = value;
  }
  return out;
}

// The state's icon in its color, from inside the tile card: its icon moves
// as the state does (a nozzle that bobs while printing, an alert that
// blinks). If Home Assistant renames that part, the icon stays still.
const STATE_SHEET = `
  :host([prusa-state-color]) ha-tile-icon { --tile-icon-color: var(--prusa-state-color) !important; }
  :host([prusa-phase="printing"]) ha-tile-icon ha-state-icon { animation: prusa-bob 1.6s ease-in-out infinite; }
  :host([prusa-phase="idle"]) ha-tile-icon ha-state-icon { animation: prusa-breathe 3.2s ease-in-out infinite; }
  :host([prusa-phase="attention"]) ha-tile-icon ha-state-icon,
  :host([prusa-phase="error"]) ha-tile-icon ha-state-icon { animation: prusa-blink 1.2s step-end infinite; }
  @keyframes prusa-bob { 0%, 100% { transform: translateY(-1.5px); } 50% { transform: translateY(1.5px); } }
  @keyframes prusa-breathe { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
  @keyframes prusa-blink { 50% { opacity: .35; } }
  @media (prefers-reduced-motion: reduce) { ha-tile-icon ha-state-icon { animation: none !important; } }`;

// The same keys and values as the xTool, SVS and Lampster cards
const FEATURES_STYLES = [["match", "Match style"], ["flat", "Flat"], ["console", "Console"]];
// How far a features style's patch or channel reaches around each control (px)
const CHANNEL_PAD = { match: 0, flat: 2, console: 3 };
// The door's edge inside the title row (px)
const WINDOW_MARGIN = 4;
const DEFAULT_FEATURES_STYLE = "console";
// Each status the status badge can show: [id, label, whether the printer has it]
const STATUS_BADGES = [
  ["active_tool", "Active tool", (device) => device.tools.length > 1],
  ["server_update", "Prusa Connect update available", (device) => !!device.roles.server],
];
const DEFAULT_STATUS_BADGES = ["active_tool", "server_update"];
const statusBadgesOf = (hass, entityId) => {
  const device = deviceOf(hass, entityId);
  return STATUS_BADGES.filter(([, , has]) => has(device));
};
const defaultStatusBadges = (hass, entityId) => DEFAULT_STATUS_BADGES.filter((id) => statusBadgesOf(hass, entityId).some(([badge]) => badge === id));
const EDGES = [["none", "None"], ["top", "Top"], ["bottom", "Bottom"], ["left", "Left"], ["right", "Right"], ["around", "Around the card"]];
const DIRECTIONS = [["clockwise", "Clockwise"], ["counterclockwise", "Counterclockwise"]];
const SHOW_WHILE = [["printing", "Printing"], ["paused", "Paused"], ["attention", "Attention"], ["finished", "Finished"], ["error", "Error"]];
const PROGRESS_DEFAULTS = {
  edge: "top", thickness: 4, starts_at: 0, ends_at: 100, direction: "clockwise", color: "state",
  show_percentage: false, show_while: ["printing", "paused"],
};
const BAR_DIRECTION = {
  top: { clockwise: "to right", counterclockwise: "to left" },
  bottom: { clockwise: "to left", counterclockwise: "to right" },
  left: { clockwise: "to top", counterclockwise: "to bottom" },
  right: { clockwise: "to bottom", counterclockwise: "to top" },
};
const TRACK = "var(--disabled-color, rgba(127, 127, 127, .35))";
// Where the badges sit, as a share of the icon's radius (the xTool card's spacing)
const BADGE_RING = 16.7 / 20;

// Options this card adds to the tile card's
const OWN_KEYS = ["style", "features_style", "enabled_color", "status_badge", "connection_badge", "progress_edge", "collapsible",
  "expanded_at_load", "expand_when_job_starts", "collapse_when_job_ends", "last_feature_full_width"];
const DEFAULT_FEATURES_POSITION = "inline";
// The printer's name (its device's), not the State sensor's
const DEFAULT_NAME = { type: "device" };
const DEFAULT_STATE_CONTENT = ["state", "progress", "time_remaining"];

/** The tile card's own options (as its editor shows them), with the card's defaults. */
function tileConfig(config) {
  const tile = { ...config, type: "tile" };
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
function innerTileConfig(config, open) {
  const tile = tileConfig(config);
  if (config.collapsible !== false) {
    tile.tap_action = { action: "fire-dom-event", prusa_connect_card: "toggle" };
    if (!open) tile.features = tile.features_position === "inline" ? (config.features ?? []).slice(0, 1) : [];
  }
  return tile;
}

const progressOptions = (config) => ({ ...PROGRESS_DEFAULTS, ...(config?.progress_edge ?? {}) });

// Whether each printer's card is expanded in the editor's preview, while the editor is open
const PREVIEW_OPEN = new Map();

/** Whether two flat objects hold the same values. */
function sameValues(a, b) {
  if (!a || !b) return a === b;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/** Home Assistant's states with one state object in place of the entity's, without copying the others. */
function statesWith(states, entityId, stateObj) {
  return new Proxy(states, {
    get: (target, key, receiver) => (key === entityId ? stateObj : Reflect.get(target, key, receiver)),
    getOwnPropertyDescriptor: (target, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      return key === entityId && descriptor ? { ...descriptor, value: stateObj } : descriptor;
    },
  });
}

/** All elements matching selector inside root and its shadow roots, a few deep. */
function findAllDeep(root, selector, depth = 5, out = []) {
  if (!root || depth < 0) return out;
  out.push(...(root.querySelectorAll?.(selector) ?? []));
  for (const el of root.querySelectorAll?.("*") ?? []) {
    if (el.shadowRoot) findAllDeep(el.shadowRoot, selector, depth - 1, out);
  }
  return out;
}

/** The first element matching selector inside root and its shadow roots. */
function findDeep(root, selector, depth = 5) {
  if (!root || depth < 0) return null;
  const found = root.querySelector?.(selector);
  if (found) return found;
  for (const el of root.querySelectorAll?.("*") ?? []) {
    const hit = el.shadowRoot && findDeep(el.shadowRoot, selector, depth - 1);
    if (hit) return hit;
  }
  return null;
}

/** A control's corner radius: the theme's feature radius, or the element's own, no more than half its height. */
function featureRadius(el, height) {
  const themed = parseFloat(getComputedStyle(el).getPropertyValue("--feature-border-radius"));
  const own = parseFloat(getComputedStyle(el).borderTopLeftRadius);
  const radius = Number.isFinite(themed) ? themed : Number.isFinite(own) ? own : 0;
  return Math.min(radius, height / 2);
}

/**
 * Where each feature below the title goes in Home Assistant's two-column
 * feature grid, as the xTool card places them. The features alternate left
 * and right in the order chosen. On top of that:
 * - a feature with Full width (the camera's default; the history can have
 *   it too) takes both columns;
 * - a camera or history without it takes one column, as many rows tall as
 *   it needs: the features after it fill the other column, one per row,
 *   until they pass its bottom; then the pattern resumes;
 * - a feature alone in its row takes both columns with Last feature full
 *   width (the default), one column without it.
 * items: [{ tall, full, height }]; gap: the grid's row gap (px).
 */
function featurePlaces(items, gap, lastWide) {
  const places = [];
  const gridRows = [];
  let row = 1, col = 0;
  const alone = (index) => {
    if (lastWide) places[index] = { column: "1 / -1", row: places[index].row, columns: 1 };
  };
  for (let i = 0; i < items.length;) {
    const item = items[i];
    if (item.full) {
      if (col === 1) {
        alone(i - 1);
        row += 1;
      }
      places[i] = { column: "1 / -1", row: `${row}`, columns: 1 };
      row += 1;
      col = 0;
      i += 1;
      continue;
    }
    if (item.tall) {
      const other = 1 - col;
      let rows = col === 1 ? 1 : 0;
      let height = col === 1 ? items[i - 1].height : 0;
      let next = i + 1;
      while (next < items.length && height < item.height && !items[next].full) {
        places[next] = { column: `${other + 1}`, row: `${row + rows}`, columns: 2 };
        height += (rows ? gap : 0) + items[next].height;
        rows += 1;
        next += 1;
      }
      const span = Math.max(rows, 1);
      places[i] = { column: `${col + 1}`, row: span > 1 ? `${row} / span ${span}` : `${row}`, columns: 2 };
      gridRows[row + span - 2] = "1fr";
      row += span;
      col = 0;
      i = next;
      continue;
    }
    places[i] = { column: `${col + 1}`, row: `${row}`, columns: 2 };
    col += 1;
    if (col === 2) {
      col = 0;
      row += 1;
    }
    i += 1;
  }
  if (col === 1) alone(items.length - 1);
  return { places, rows: Array.from({ length: row - 1 + col }, (_, i) => gridRows[i] ?? "auto") };
}

// The features that are tall (a picture, a graph), and whether each takes both columns by default
const TALL_FEATURES = { [`custom:${PrusaCameras.type}`]: true, [`custom:${PrusaHistory.type}`]: false };

class PrusaConnectCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        :host { display: block; height: 100%; }
        .frame {
          position: relative; height: 100%; box-sizing: border-box; isolation: isolate;
          border-radius: var(--ha-card-border-radius, var(--ha-border-radius-lg, 12px));
        }
        .clip { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; pointer-events: none; }
        .clip.over { z-index: 2; }
        .tile { position: relative; display: block; height: 100%; --ha-card-feature-divider: none; }

        /* The style: the frame behind everything, the door behind the title */
        #body, #door { position: absolute; display: none; }
        .styled #body { display: block; inset: 0; background: var(--prusa-body); }
        .styled.glazed #door {
          display: block; overflow: hidden; border-radius: max(4px, calc(var(--ha-card-border-radius, 12px) - 5px));
          background: var(--prusa-glass); box-shadow: var(--prusa-edge);
        }
        #door::after { content: ""; position: absolute; inset: 0; background: var(--prusa-gloss); }
        /* The RGB status bar's light, rising from the bottom of the door */
        #door::before {
          content: ""; position: absolute; inset: 0; opacity: 0; pointer-events: none;
          background: radial-gradient(120% 90% at 50% 125%, rgb(var(--prusa-bar, 0 0 0) / .65) 0%, rgb(var(--prusa-bar, 0 0 0) / 0) 65%);
        }
        #door[data-bar]::before { opacity: 1; }
        #door[data-bar="warning"]::before { animation: prusa-bar 2s ease-in-out infinite; }
        #door[data-bar="error"]::before { animation: prusa-bar 1s ease-in-out infinite; }
        @keyframes prusa-bar { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { #door[data-bar]::before { animation: none; } }
        .styled::after {
          content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 3;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, .3), inset 0 -1px 0 rgba(0, 0, 0, .4);
        }
        .styled .tile {
          --ha-card-background: transparent; --card-background-color: transparent;
          --ha-card-box-shadow: none; --ha-card-border-color: transparent; --ha-card-backdrop-filter: none;
        }
        .tile.dark {
          --primary-text-color: rgba(255, 255, 255, .95); --secondary-text-color: rgba(235, 235, 240, .7);
          --disabled-text-color: rgba(255, 255, 255, .38);
          --prusa-text: rgba(255, 255, 255, .95); text-shadow: 0 1px 2px rgba(0, 0, 0, .8);
          --prusa-feature-scrim: rgba(0, 0, 0, .45);
        }
        .tile.light {
          --primary-text-color: rgba(0, 0, 0, .85); --secondary-text-color: rgba(40, 40, 48, .62);
          --disabled-text-color: rgba(0, 0, 0, .38);
          --prusa-text: rgba(0, 0, 0, .85); --prusa-feature-scrim: rgba(255, 255, 255, .45);
        }
        .tile.dark.solid { --prusa-feature-backing: #1e1f22; }
        .tile.light.solid { --prusa-feature-backing: #eceef1; }
        #areas { position: absolute; inset: 0; }
        .area { position: absolute; box-sizing: border-box; }
        .area.flat { background: var(--flat); box-shadow: 0 0 3px 1px var(--flat); }
        .area.console {
          background: linear-gradient(180deg, rgba(0, 0, 0, .22), rgba(0, 0, 0, .08));
          box-shadow:
            inset 0 2px 3px rgba(0, 0, 0, .55), inset 0 1px 1px rgba(0, 0, 0, .4),
            inset 0 -1px 0 rgba(255, 255, 255, .14), 0 1px 0 rgba(255, 255, 255, .18);
        }

        /* The progress edge */
        #edge { position: absolute; display: none; overflow: hidden; }
        #edge.on { display: block; }
        #edge.around {
          inset: 0; border-radius: inherit; box-sizing: border-box;
          -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          -webkit-mask-composite: xor;
          mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
          mask-composite: exclude;
        }
        #edge .sweep { position: absolute; display: none; border-radius: 3px; }
        #edge.indeterminate .sweep { display: block; }
        #edge.indeterminate.horizontal .sweep { top: 0; bottom: 0; width: 30%; animation: sweep-x 2.2s ease-in-out infinite; }
        #edge.indeterminate.vertical .sweep { left: 0; right: 0; height: 30%; animation: sweep-y 2.2s ease-in-out infinite; }
        #edge.indeterminate.around { animation: pulse 2s ease-in-out infinite; }
        @keyframes sweep-x { from { left: -30%; } to { left: 100%; } }
        @keyframes sweep-y { from { top: -30%; } to { top: 100%; } }
        @keyframes pulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          #edge.indeterminate .sweep, #edge.indeterminate.around { animation: none; }
          #edge.indeterminate.horizontal .sweep { left: 35%; }
          #edge.indeterminate.vertical .sweep { top: 35%; }
        }
        #pct {
          position: absolute; right: 16px; bottom: 12px; display: none;
          font: 700 14px/1 var(--ha-font-family-body, inherit); text-shadow: 0 1px 3px rgba(0, 0, 0, .8);
        }
        #pct.on { display: block; }

        /* The badges on the icon: the status badge at the top right, the connection badge at the bottom right */
        .badge {
          position: absolute; z-index: 3; width: 18px; height: 18px; margin: -9px 0 0 -9px; box-sizing: border-box;
          display: none; place-items: center; border-radius: 50%; pointer-events: none; overflow: hidden; line-height: 0;
          border: 2px solid var(--prusa-badge-ring, var(--ha-card-background, var(--card-background-color, #fff)));
          color: #fff; font: 700 10px/1 var(--ha-font-family-body, inherit); text-shadow: none;
        }
        .badge.on { display: grid; }
        .badge ha-state-icon {
          position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
          --mdc-icon-size: 12px; --ha-icon-display: flex;
        }
        .badge .text { position: relative; line-height: 1; }
        .badge .text:empty { display: none; }
        .styled .badge { --prusa-badge-ring: rgba(0, 0, 0, .55); }
      </style>
      <div class="frame">
        <div class="clip under"><div id="body"></div><div id="door"></div><div id="areas"></div></div>
        <div class="clip over"><div id="edge"><div class="sweep"></div></div><span id="pct"></span></div>
        <span class="badge status" role="img"><ha-state-icon aria-hidden="true"></ha-state-icon><span class="text"></span></span>
        <span class="badge connection" role="img"><ha-state-icon aria-hidden="true"></ha-state-icon><span class="text"></span></span>
      </div>`;
    this._frame = this.shadowRoot.querySelector(".frame");
    this._statesProvider = new StatesProvider(this._frame);
    this._over = this.shadowRoot.querySelector(".clip.over");
    this._door = this.shadowRoot.getElementById("door");
    this._areas = this.shadowRoot.getElementById("areas");
    this._edge = this.shadowRoot.getElementById("edge");
    this._pct = this.shadowRoot.getElementById("pct");
    this._statusBadge = this.shadowRoot.querySelector(".badge.status");
    this._connectionBadge = this.shadowRoot.querySelector(".badge.connection");
    this._resize = new ResizeObserver(() => this._layout());
    // A tap on the card shows or hides the features (see innerTileConfig),
    // except a tap between the features
    this._frame.addEventListener("pointerdown", (ev) => {
      this._tapAt = { x: ev.clientX, y: ev.clientY };
    }, true);
    this._frame.addEventListener("ll-custom", (ev) => {
      if (ev.detail?.prusa_connect_card !== "toggle") return;
      ev.stopPropagation();
      const at = this._tapAt;
      this._tapAt = undefined;
      if (this._open && at && this._amongFeatures(at)) return;
      this._setOpen(!this._open);
    });
    this._resize.observe(this._frame);
  }

  static getConfigElement() {
    return document.createElement(EDITOR_TYPE);
  }

  /** True when a point is in one of the tile card's feature areas. */
  _amongFeatures({ x, y }) {
    return [...(this._tile?.shadowRoot?.querySelectorAll("hui-card-features") ?? [])].some((features) => {
      const box = features.getBoundingClientRect();
      return box.width > 0 && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    });
  }

  /** A new card: the first printer in Home Assistant, with Prusa print and Prusa temperatures. */
  static getStubConfig(hass) {
    const entity = printerStateSensors(hass)[0];
    if (!entity) return { entity: "" };
    const device = deviceOf(hass, entity);
    const features = [PrusaPrint, PrusaTemperatures].filter((f) => f.supports(device, hass)).map((f) => ({ type: `custom:${f.type}` }));
    return minimal({ entity, ...(features.length ? { features } : {}) }, hass);
  }

  setConfig(config) {
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
    this._config = config;
    this._open = config.collapsible === false ? true : this._preview ? PREVIEW_OPEN.get(config.entity) ?? true : this._storedOpen() ?? config.expanded_at_load === true;
    this._phase = undefined;
    const tile = innerTileConfig(this._config, this._open);
    if (this._tile) {
      this._tile.setConfig(tile);
    } else if (customElements.get("hui-tile-card")) {
      this._createTile(tile);
    } else {
      // The tile card is loaded on demand; the card helpers load it
      window.loadCardHelpers?.().then(async (helpers) => {
        helpers.createCardElement({ type: "tile", entity: tile.entity });
        await customElements.whenDefined("hui-tile-card");
        if (!this._tile) this._createTile(innerTileConfig(this._config, this._open));
      });
    }
    const hass = this._hass;
    this._hass = undefined;
    if (hass) this.hass = hass;
    this._layout();
  }

  _createTile(tile) {
    this._tile = document.createElement("hui-tile-card");
    this._tile.classList.add("tile");
    this._tile.setConfig(tile);
    if (this._hass) this._setTileHass(this._hass);
    if (this._preview !== undefined) this._tile.preview = this._preview;
    if (this._layoutValue !== undefined) this._tile.layout = this._layoutValue;
    this._frame.insertBefore(this._tile, this._over);
    this._layout();
  }

  _setTileHass(hass) {
    const inner = this._innerHass(hass);
    this._statesProvider.states = inner.states;
    this._tile.hass = inner;
    this._styleState();
  }

  set hass(hass) {
    const before = this._hass;
    this._hass = hass;
    if (!this._config) return;
    if (before?.themes !== hass.themes) colorsChanged();
    if (this._tile && !changedFor(before, hass, this._config.entity)) return;
    const phase = phaseNow(hass, this._config.entity);
    this._followJob(phase);
    this._phaseNow = phase;
    if (this._tile) this._setTileHass(hass);
    this._updateBadges();
    this._updateEdge();
    this._updateBar();
  }

  get hass() {
    return this._hass;
  }

  // In the editor's preview and while the dashboard is edited, the card
  // starts expanded and changes only when tapped (see PREVIEW_OPEN)
  set preview(value) {
    const was = this._preview;
    this._preview = value;
    if (this._tile) this._tile.preview = value;
    if (!this._config || this._config.collapsible === false || !value === !was) return;
    this._setOpen(value ? PREVIEW_OPEN.get(this._config.entity) ?? true : this._storedOpen() ?? this._config.expanded_at_load === true, false);
  }

  set layout(value) {
    this._layoutValue = value;
    if (this._tile) this._tile.layout = value;
  }

  getCardSize() {
    const features = this._config?.features ?? [];
    const rows = features.reduce((sum, f) => sum + (TALL_FEATURES[f?.type] !== undefined ? 5 : 1), 0);
    return 1 + (this._open === false ? 0 : rows);
  }

  /** The tile card's columns, and a height that follows the content (rows: auto). */
  getGridOptions() {
    const options = { ...(this._tile?.getGridOptions?.() ?? { columns: 6 }), rows: "auto" };
    delete options.min_rows;
    return options;
  }

  connectedCallback() {
    this._layout();
  }

  // Whether the features are shown is remembered in this browser, per printer
  get _storageKey() {
    return `prusa-connect-card:${this._config?.entity}`;
  }

  _storedOpen() {
    try {
      const v = window.localStorage.getItem(this._storageKey);
      return v === null ? undefined : v === "1";
    } catch (err) {
      return undefined;
    }
  }

  /**
   * A collapsible card follows the print job, each option on its own:
   * - Expand when a job starts (expand_when_job_starts): the card expands
   *   when the printer starts printing.
   * - Collapse when a job ends (collapse_when_job_ends): the card collapses
   *   when the print finishes or is stopped.
   * Only a change of state does either; the card loads as it was left.
   */
  _followJob(phase) {
    const was = this._phase;
    this._phase = phase;
    if (was === undefined || was === phase || this._config.collapsible === false || this._preview) return;
    const started = phase === "printing" && !JOB_PHASES.includes(was);
    const ended = ["finished", "stopped"].includes(phase) && JOB_PHASES.includes(was);
    if (started && this._config.expand_when_job_starts !== false && !this._open) this._setOpen(true, false);
    else if (ended && this._config.collapse_when_job_ends !== false && this._open) this._setOpen(false, false);
  }

  _setOpen(open, remember = true) {
    this._open = open;
    if (this._preview) PREVIEW_OPEN.set(this._config.entity, open);
    try {
      if (remember && !this._preview) window.localStorage.setItem(this._storageKey, open ? "1" : "0");
    } catch (err) {
      // Storage can be unavailable (private windows); the card still works
    }
    if (this._tile) this._tile.setConfig(innerTileConfig(this._config, open));
    this._areasKey = undefined;
    this._layout();
  }

  /**
   * The Home Assistant object the tile card sees: the same, except that the
   * card's entity has the state's icon and the printer's sensors as
   * attributes (see sensorAttributes). The changed state object is reused
   * until any of them changes.
   */
  _innerHass(hass) {
    const entity = this._config?.entity;
    const stateObj = hass.states[entity];
    if (!stateObj) return hass;
    const extra = { ...sensorAttributes(hass, entity), icon: PRINTER_STATES[phaseNow(hass, entity)].icon };
    if (this._sourceState !== stateObj || !sameValues(this._lastExtra, extra)) {
      this._sourceState = stateObj;
      this._lastExtra = extra;
      this._innerState = { ...stateObj, attributes: { ...stateObj.attributes, ...extra } };
    }
    if (this._outerHass === hass && this._innerFor === this._innerState) return this._inner;
    this._outerHass = hass;
    this._innerFor = this._innerState;
    this._inner = { ...hass, states: statesWith(hass.states, entity, this._innerState) };
    return this._inner;
  }

  /** The state's icon in its color, moving as the state does (see STATE_SHEET); a color chosen in the tile options wins. */
  _styleState() {
    const tile = this._tile, root = tile?.shadowRoot;
    if (!root) return;
    if (!PrusaConnectCard._stateSheet) {
      PrusaConnectCard._stateSheet = new CSSStyleSheet();
      PrusaConnectCard._stateSheet.replaceSync(STATE_SHEET);
    }
    try {
      if (!root.adoptedStyleSheets.includes(PrusaConnectCard._stateSheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, PrusaConnectCard._stateSheet];
    } catch (err) {
      console.warn("Prusa Connect card: could not color the state's icon", err);
      return;
    }
    const phase = this._phaseNow ?? "off";
    const own = this._config.color && this._config.color !== "state";
    tile.setAttribute("prusa-phase", phase);
    tile.toggleAttribute("prusa-state-color", !own);
    tile.style.setProperty("--prusa-state-color", PRINTER_STATES[phase].color);
  }

  /** What the status badge shows, or undefined: the first of the chosen statuses that applies. */
  _statusBadgeNow() {
    const hass = this._hass, id = this._config.entity;
    const chosen = Array.isArray(this._config.status_badge) ? this._config.status_badge : defaultStatusBadges(hass, id);
    const device = deviceOf(hass, id);
    const phase = this._phaseNow;
    const active = device.tools.length > 1 && JOB_PHASES.includes(phase)
      ? device.tools.find((n) => isOn(hass.states[device.roles[`tool_${n}_active`]])) : undefined;
    const server = hass.states[device.roles.server];
    const options = {
      active_tool: active !== undefined ? { text: String(active), color: ENABLED, label: `Active tool: ${active}` } : undefined,
      server_update: server?.state === "on" ? { icon: "mdi:arrow-up-bold", color: ENABLED, label: "Prusa Connect update available" } : undefined,
    };
    for (const option of chosen) if (options[option]) return options[option];
    return undefined;
  }

  /**
   * What the connection badge shows: Unavailable while the State sensor is,
   * disconnected while Prusa Connect does not reach the printer, otherwise
   * connected, in the enabled color.
   */
  _connectionBadgeNow() {
    const hass = this._hass, id = this._config.entity;
    const device = deviceOf(hass, id);
    const state = hass.states[device.roles.state];
    if (!state || state.state === "unavailable") return { icon: "mdi:close-thick", color: "#616161", label: "Unavailable" };
    if (this._config.connection_badge === false) return undefined;
    const connected = hass.states[device.roles.connected];
    if (!known(connected)) return undefined;
    return isOn(connected)
      ? { icon: "mdi:link-variant", color: ENABLED, label: "Connected to Prusa Connect" }
      : { icon: "mdi:link-variant-off", color: "#616161", label: "Printer disconnected from Prusa Connect" };
  }

  _updateBadges() {
    const ready = !!this._hass;
    const status = this._showBadge(this._statusBadge, ready ? this._statusBadgeNow() : undefined);
    const connection = this._showBadge(this._connectionBadge, ready ? this._connectionBadgeNow() : undefined);
    if (status || connection) this._placeBadges();
  }

  /** Show a badge (or hide it, for none): an icon or a digit on a circle; whether it shows. */
  _showBadge(el, badge) {
    el.classList.toggle("on", !!badge);
    if (!badge) {
      el.removeAttribute("aria-label");
      el.title = "";
      return false;
    }
    el.style.background = badge.color;
    const icon = el.querySelector("ha-state-icon");
    icon.hidden = !badge.icon;
    if (icon.hass !== this._hass) icon.hass = this._hass;
    if (icon.icon !== badge.icon) icon.icon = badge.icon;
    el.querySelector(".text").textContent = badge.text ?? "";
    el.title = badge.label;
    el.setAttribute("aria-label", badge.label);
    return true;
  }

  // The badges sit on a circle at BADGE_RING of the icon's radius: the
  // status badge up and to the right, the connection badge down and to the right
  _placeBadges() {
    const icon = this._tile?.shadowRoot?.querySelector("ha-tile-icon");
    if (!icon) {
      if (this._tile && !this._badgeRetry) {
        this._badgeRetry = true;
        Promise.resolve(this._tile.updateComplete).then(() => {
          this._badgeRetry = false;
          if (this._tile.shadowRoot?.querySelector("ha-tile-icon")) this._placeBadges();
        });
      }
      return;
    }
    const frame = this._frame.getBoundingClientRect(), box = icon.getBoundingClientRect();
    if (!box.width) return;
    const scale = frame.width / this._frame.offsetWidth || 1;
    const r = box.width / 2 / scale;
    const cx = (box.left - frame.left) / scale + r, cy = (box.top - frame.top) / scale + r;
    const ring = r * BADGE_RING;
    this._statusBadge.style.left = this._connectionBadge.style.left = `${cx + ring * .7071}px`;
    this._statusBadge.style.top = `${cy - ring * .7071}px`;
    this._connectionBadge.style.top = `${cy + ring * .7071}px`;
  }

  /** The progress edge, as configured, for the printer's state. */
  _updateEdge() {
    const edge = this._edge, pct = this._pct;
    const p = progressOptions(this._config);
    const phase = this._phaseNow;
    const showWhile = Array.isArray(p.show_while) ? p.show_while : PROGRESS_DEFAULTS.show_while;
    edge.className = "";
    edge.removeAttribute("style");
    pct.className = "";
    if (!phase || p.edge === "none" || !showWhile.includes(phase)) return;
    const raw = Number(this._hass.states[deviceOf(this._hass, this._config.entity).roles.progress]?.state);
    const value = phase === "finished" ? 1 : Number.isFinite(raw) ? Math.max(0, Math.min(1, raw / 100)) : undefined;
    const determinate = value !== undefined;
    const color = this._edgeColor(p.color, phase, value);
    const thickness = Math.max(1, Math.min(24, Number(p.thickness) || PROGRESS_DEFAULTS.thickness));
    const clamp = (v, d) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Number(v))) : d);
    let start = clamp(p.starts_at, 0), end = clamp(p.ends_at, 100);
    if (start > end) [start, end] = [end, start];
    const counter = p.direction === "counterclockwise";
    edge.classList.add("on");
    if (!determinate) edge.classList.add("indeterminate");
    if (p.edge === "around") {
      edge.classList.add("around");
      edge.style.padding = `${thickness}px`;
      if (!determinate) {
        edge.style.background = color;
      } else {
        const deg = Math.round(value * 36000) / 100;
        edge.style.background = counter
          ? `conic-gradient(from 0deg, ${TRACK} 0deg ${360 - deg}deg, ${color} ${360 - deg}deg 360deg)`
          : `conic-gradient(from 0deg, ${color} 0deg ${deg}deg, ${TRACK} ${deg}deg 360deg)`;
      }
    } else {
      const horizontal = p.edge === "top" || p.edge === "bottom";
      edge.classList.add(horizontal ? "horizontal" : "vertical");
      const place = {
        top: `top: 0; left: 0; right: 0; height: ${thickness}px;`,
        bottom: `bottom: 0; left: 0; right: 0; height: ${thickness}px;`,
        left: `top: 0; bottom: 0; left: 0; width: ${thickness}px;`,
        right: `top: 0; bottom: 0; right: 0; width: ${thickness}px;`,
      }[p.edge];
      const direction = BAR_DIRECTION[p.edge][counter ? "counterclockwise" : "clockwise"];
      const stop = Math.round((start + (end - start) * (value ?? 0)) * 100) / 100;
      const background = determinate
        ? `linear-gradient(${direction}, ${TRACK} 0%, ${TRACK} ${start}%, ${color} ${start}%, ${color} ${stop}%, ${TRACK} ${stop}%, ${TRACK} 100%)`
        : TRACK;
      edge.style.cssText = `${place} background: ${background}; transition: background 3s linear;`;
      edge.querySelector(".sweep").style.background = color;
    }
    if (p.show_percentage && determinate) {
      pct.classList.add("on");
      pct.textContent = `${Math.round(value * 100)}%`;
      pct.style.color = color;
    }
  }

  _edgeColor(spec, phase, value) {
    if (spec === "thresholds" && value !== undefined) {
      if (value > 0.6) return "var(--success-color, #43a047)";
      if (value > 0.2) return "var(--warning-color, #ffa600)";
      return "var(--error-color, #db4437)";
    }
    if (!spec || spec === "state" || spec === "thresholds") return PRINTER_STATES[phase].color;
    return cssColor(spec);
  }

  /** The style's look now (see lookOf), or undefined for none. */
  get _look() {
    return this._config && this._hass ? lookOf(styleOptions(this._config, this._hass), this._hass) : undefined;
  }

  _layout() {
    if (!this._config) return;
    const style = styleOptions(this._config, this._hass);
    const look = this._look;
    const door = look?.door;
    this._frame.classList.toggle("styled", !!look);
    this._frame.classList.toggle("glazed", !!door);
    for (const [name, value] of [
      ["--prusa-body", look?.body], ["--prusa-glass", door?.glass], ["--prusa-edge", door?.edge],
      // A number field is a pane of the door's glass (see FEATURE_CSS)
      ["--prusa-field", door && "var(--prusa-glass)"], ["--prusa-field-opacity", door && "1"],
      ["--prusa-field-text", door?.ink], ["--prusa-field-edge", door && "var(--prusa-edge)"],
    ]) {
      if (value) this._frame.style.setProperty(name, value);
      else this._frame.style.removeProperty(name);
    }
    if (this._config.enabled_color) this.style.setProperty("--prusa-enabled-color", cssColor(this._config.enabled_color));
    else this.style.removeProperty("--prusa-enabled-color");
    this._door.style.setProperty("--prusa-gloss", door ? glassReflections(door.glare, style.reflections) : "none");
    this._updateBar();
    if (this._tile) {
      this._tile.classList.toggle("dark", look?.tone === "dark");
      this._tile.classList.toggle("light", look?.tone === "light");
      this._tile.classList.toggle("solid", !!look && (this._config.features_style ?? DEFAULT_FEATURES_STYLE) !== "match");
      this._tile.style.setProperty("--prusa-channel-pad", `${CHANNEL_PAD[this._featuresStyle()]}px`);
      this._tile.style.setProperty("--prusa-window-margin", `${door ? WINDOW_MARGIN : 0}px`);
      this._styleDoorText(door);
    }
    this._removeDividers();
    this._placeFeatures();
    this._clampCorners();
    this._drawDoor();
    this._drawAreas();
    if (this._statusBadge.classList.contains("on") || this._connectionBadge.classList.contains("on")) this._placeBadges();
  }

  /** The door lights up as the printer's RGB status bar does (see STATUS_BAR), with the style's status_bar option. */
  _updateBar() {
    if (!this._config) return;
    const door = this._look?.door;
    const bar = door && styleOptions(this._config, this._hass).status_bar && this._phaseNow ? STATUS_BAR[this._phaseNow] : undefined;
    if (bar) {
      this._door.style.setProperty("--prusa-bar", bar[0]);
      if (this._door.dataset.bar !== bar[1]) this._door.dataset.bar = bar[1];
    } else {
      this._door.removeAttribute("data-bar");
    }
  }

  /**
   * Place the features below the title in the tile card's feature grid
   * (see featurePlaces), only when the card's options call for it.
   */
  _placeFeatures() {
    let group;
    try {
      group = findAllDeep(this._tile?.shadowRoot, 'hui-card-features[slot="features"]')[0];
    } catch (err) {
      console.warn("Prusa Connect card: could not place the features", err);
      return;
    }
    const items = [...(group?.shadowRoot?.querySelectorAll("hui-card-feature") ?? [])];
    const inline = (this._config.features_position ?? DEFAULT_FEATURES_POSITION) === "inline";
    const lastWide = this._config.last_feature_full_width !== false;
    const tall = (item) => TALL_FEATURES[item.feature?.type] !== undefined;
    const placed = inline && items.length > 0 && (!lastWide || items.some(tall));
    const gap = placed ? parseFloat(getComputedStyle(group).rowGap) || 0 : 0;
    const { places, rows } = placed
      ? featurePlaces(items.map((item) => ({
        tall: tall(item), full: tall(item) && (item.feature.full_width ?? TALL_FEATURES[item.feature.type]) !== false, height: item.offsetHeight,
      })), gap, lastWide)
      : { places: [], rows: [] };
    const key = JSON.stringify([places, rows]);
    if (group === this._placedGroup && key === this._placedKey) return;
    clearTimeout(this._placeTimer);
    this._placeTimer = setTimeout(() => {
      this._placedGroup = group;
      this._placedKey = key;
      if (!group) return;
      group.style.gridTemplateColumns = places.some((p) => p.columns === 2) && group.getAttribute("columns") !== "2" ? "repeat(2, minmax(0, 1fr))" : "";
      group.style.gridTemplateRows = rows.includes("1fr") ? rows.join(" ") : "";
      items.forEach((item, i) => {
        const place = places[i];
        item.style.gridColumn = place?.column ?? "";
        item.style.gridRow = place?.row ?? "";
        item.style.alignSelf = place ? "start" : "";
        if (place) item.style.setProperty("--feature-columns", `${place.columns}`);
        else item.style.removeProperty("--feature-columns");
      });
    }, 0);
  }

  /**
   * The title's text on the door, in the door's colors, and the space below
   * the title row: the feature gap, less the door's margin and the features
   * style's channel, as the xTool card has it. This styles the tile card
   * from inside it; if Home Assistant renames that part, the title keeps the
   * frame's text color.
   */
  _styleDoorText(door) {
    const root = this._tile?.shadowRoot;
    if (!root) return;
    this._doorSheet ??= new CSSStyleSheet();
    this._doorSheet.replaceSync(`
        hui-card-features[slot="features"] {
          margin-top: calc(var(--ha-card-feature-gap, 12px) - var(--prusa-window-margin, 0px) - var(--prusa-channel-pad, 0px));
        }
        ${door ? `ha-tile-info { ${door.text}; }` : ""}`);
    try {
      if (!root.adoptedStyleSheets.includes(this._doorSheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, this._doorSheet];
    } catch (err) {
      console.warn("Prusa Connect card: could not style the title on the door", err);
    }
  }

  /** A box in the card's own pixels (the card can be scaled in the editor). */
  _box(el) {
    const origin = this._frame.getBoundingClientRect();
    const scale = origin.width / this._frame.offsetWidth || 1;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: (r.left - origin.left) / scale, y: (r.top - origin.top) / scale, w: r.width / scale, h: r.height / scale };
  }

  /** The tile card's title row: its height (one row) and the middle of its icon, in the card's own pixels. */
  _titleRow() {
    const root = this._tile?.shadowRoot;
    const content = root && findDeep(root, "ha-tile-container")?.shadowRoot?.querySelector(".content");
    const icon = root && findDeep(root, "ha-tile-icon");
    const box = icon && this._box(icon);
    const height = content && parseFloat(getComputedStyle(content).minHeight);
    if (!box || !Number.isFinite(height) || !height) return null;
    return { height, middle: box.y + box.h / 2 };
  }

  /** The door covers the title row (and any feature beside it), 4 px inside its edges. */
  _drawDoor() {
    if (!this._look?.door) return;
    const W = this._frame.offsetWidth, H = this._frame.offsetHeight;
    if (!W || !H) return;
    const margin = WINDOW_MARGIN;
    let top = margin, bottom = H - margin;
    const row = this._titleRow();
    if (row) {
      top = Math.max(margin, row.middle - row.height / 2 + margin);
      bottom = Math.min(H - margin, row.middle + row.height / 2 - margin);
    }
    Object.assign(this._door.style, { left: `${margin}px`, top: `${top}px`, width: `${W - 2 * margin}px`, height: `${Math.max(0, bottom - top)}px` });
  }

  /** The card's corners: the theme's, but never rounder than half the title row. */
  _clampCorners() {
    const row = this._titleRow();
    this._frame.style.removeProperty("--ha-card-border-radius");
    if (!row) return;
    const themed = parseFloat(getComputedStyle(this._frame).borderTopLeftRadius);
    const half = row.height / 2;
    if (Number.isFinite(themed) && themed > half) this._frame.style.setProperty("--ha-card-border-radius", `${half}px`);
  }

  /**
   * The areas the feature controls take, in the card's own pixels: each
   * key, field, slider and picture of this card's features on its own, so
   * the frame shows between them.
   */
  _featureAreas() {
    const root = this._tile?.shadowRoot;
    if (!root) return [];
    const areas = [];
    for (const wrap of findAllDeep(root, "hui-card-feature")) {
      if (FEATURE_TAGS.includes(wrap.getRootNode()?.host?.localName)) continue;
      this._watchAdded(wrap.shadowRoot);
      const inner = wrap.shadowRoot ?? wrap;
      const ours = findDeep(inner, FEATURE_TAGS.join(", "));
      this._watchAdded(ours?.shadowRoot);
      const keys = ours ? [...(ours.shadowRoot?.querySelectorAll(".key, .shot, .slide:not([hidden]), .field, .combo, ha-tile-icon, .graph") ?? [])]
        .filter((el) => !el.closest?.("[data-dropped]") && !el.parentElement?.classList.contains("combo")) : [];
      const element = [...inner.children].find((c) => c.tagName !== "STYLE");
      for (const key of keys.length ? keys : [element]) {
        const b = key && this._box(key);
        if (!b) continue;
        areas.push({ ...b, radius: key.localName === "ha-tile-icon" ? b.h / 2 : featureRadius(key, b.h) });
      }
    }
    this._watchAdded(root);
    return areas;
  }

  /** No divider before a feature in a second column; the feature beside the title keeps a steady height. */
  _removeDividers() {
    const root = this._tile?.shadowRoot;
    if (!root) return;
    if (!PrusaConnectCard._plainSheet) {
      PrusaConnectCard._plainSheet = new CSSStyleSheet();
      PrusaConnectCard._plainSheet.replaceSync(`
        .divided { border-inline-start: none !important; margin-inline-start: 0 !important; padding-inline-start: 0 !important; }
        :host([slot="features-inline"]) { --feature-height: var(--ha-space-9, 36px) !important; }`);
    }
    try {
      for (const group of findAllDeep(root, "hui-card-features")) {
        const shadow = group.shadowRoot;
        if (shadow && !shadow.adoptedStyleSheets.includes(PrusaConnectCard._plainSheet)) {
          shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, PrusaConnectCard._plainSheet];
        }
      }
    } catch (err) {
      console.warn("Prusa Connect card: could not remove the feature dividers", err);
    }
  }

  // Console: this card's buttons become keys
  _styleControls(keys) {
    const root = this._tile?.shadowRoot;
    if (!root) return;
    try {
      for (const el of findAllDeep(root, FEATURE_TAGS.join(", "))) el.toggleAttribute("prusa-console", keys);
    } catch (err) {
      console.warn("Prusa Connect card: could not style the controls", err);
    }
  }

  // Draw again when elements are added in the tile card (features render late)
  _watchAdded(root) {
    if (!root) return;
    this._observed ??= new WeakSet();
    if (this._observed.has(root)) return;
    this._observed.add(root);
    this._mutations ??= new MutationObserver(() => {
      clearTimeout(this._areasTimer);
      this._areasTimer = setTimeout(() => this._layout(), 0);
    });
    this._mutations.observe(root, { childList: true, subtree: true });
  }

  /** The features style drawn: Match without a style. */
  _featuresStyle() {
    return this._look ? this._config.features_style ?? DEFAULT_FEATURES_STYLE : "match";
  }

  _drawAreas() {
    const style = this._featuresStyle();
    this._styleControls(style === "console");
    if (style === "match") {
      this._areas.replaceChildren();
      this._areasKey = undefined;
    } else {
      const pad = CHANNEL_PAD[style];
      const areas = this._featureAreas().map((b) => ({
        x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad,
        radius: Math.min(b.radius + pad, (b.h + 2 * pad) / 2),
      }));
      const key = style + JSON.stringify(areas.map((a) => [a.x, a.y, a.w, a.h, a.radius].map(Math.round)));
      if (key !== this._areasKey) {
        this._areasKey = key;
        this._areas.style.setProperty("--flat", this._look?.flat ?? "transparent");
        this._areas.replaceChildren(...areas.map((a) => {
          const el = document.createElement("div");
          el.className = `area ${style}`;
          Object.assign(el.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${a.w}px`, height: `${a.h}px`, borderRadius: `${a.radius}px` });
          return el;
        }));
      }
    }
    // The tile card can move its features without changing size: check again for about a second
    if (this._settling) return;
    this._settleUntil = performance.now() + 1200;
    this._settling = true;
    const check = () => {
      if (performance.now() > this._settleUntil || !this.isConnected) {
        this._settling = false;
        return;
      }
      this._removeDividers();
      this._placeFeatures();
      this._clampCorners();
      this._drawDoor();
      this._drawAreas();
      if (this._statusBadge.classList.contains("on") || this._connectionBadge.classList.contains("on")) this._placeBadges();
      setTimeout(check, 100);
    };
    setTimeout(check, 100);
  }
}

// ---------------------------------------------------------------------------
// Editors
// ---------------------------------------------------------------------------

/**
 * A notice of the controls the integration does not offer yet: what they
 * are, the request for them, and an invitation to support it there.
 */
function pendingNotice(names) {
  const alert = document.createElement("ha-alert");
  alert.alertType = "info";
  alert.setAttribute("alert-type", "info");
  const text = document.createElement("span");
  const link = document.createElement("a");
  link.href = PENDING_URL;
  link.target = "_blank";
  link.rel = "noreferrer";
  link.textContent = "the request for them";
  text.append(
    `Not offered by the Prusa Connect integration yet: ${names.join(", ")}. They show here once it offers them. Add your support to `,
    link, " on the integration's repository.",
  );
  alert.append(text);
  return alert;
}

// The features' editor: one element; the form is the feature's (its static editor)
class PrusaFeatureEditor extends HTMLElement {
  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  set context(context) {
    this._context = context;
    this._render();
  }

  setConfig(config) {
    this._config = config;
    this._render();
  }

  _form() {
    return FEATURES[`${this._config.type ?? ""}`.replace(/^custom:/, "")]?.editor?.(this._hass, this._context?.entity_id);
  }

  _render() {
    if (!this._hass || !this._config) return;
    const form = this._form();
    if (!form) return;
    if (!this._formElement) {
      this._notice = document.createElement("div");
      this._formElement = document.createElement("ha-form");
      this._formElement.computeLabel = (s) => s.label ?? s.name;
      this._formElement.computeHelper = (s) => s.helper;
      this._formElement.addEventListener("value-changed", (ev) => {
        ev.stopPropagation();
        const changed = this._form();
        const value = { ...ev.detail.value };
        // Only what differs from the feature's defaults is written
        const defaults = changed.data({ type: this._config.type });
        for (const [key, option] of Object.entries(value)) {
          if ((key in defaults && same(option, defaults[key])) || option === undefined || option === "") delete value[key];
        }
        const config = { type: this._config.type, ...value };
        this._config = config;
        fire(this, "config-changed", { config });
        this._render();
      });
      this.append(this._notice, this._formElement);
    }
    const pending = form.pending ?? [];
    const key = pending.join("|");
    if (key !== this._noticeKey) {
      this._noticeKey = key;
      this._notice.replaceChildren(...(pending.length ? [pendingNotice(pending)] : []));
      this._notice.style.marginBottom = pending.length ? "16px" : "";
    }
    this._formElement.hass = this._hass;
    this._formElement.schema = form.schema;
    this._formElement.data = form.data(this._config);
  }
}

// Tile card options this card sets itself, so they are left out of its editor:
// the printer is chosen above it (as a device), and the icon is the state's
const HIDDEN_TILE_OPTIONS = ["entity", "icon", "show_entity_picture"];

function hideOptions(schema) {
  return schema
    .filter((item) => !HIDDEN_TILE_OPTIONS.includes(item.name))
    .map((item) => (Array.isArray(item.schema) ? { ...item, schema: hideOptions(item.schema) } : item));
}

/** A printer device's State sensor. */
function printerState(hass, device) {
  return Object.values(hass?.entities ?? {})
    .find((e) => e.device_id === device && e.platform === DOMAIN && e.translation_key === "state" && domainOf(e.entity_id) === "sensor")?.entity_id;
}

/** Every printer's State sensor. */
function printerStateSensors(hass) {
  return Object.values(hass?.entities ?? {})
    .filter((e) => e.platform === DOMAIN && e.translation_key === "state" && domainOf(e.entity_id) === "sensor")
    .map((e) => e.entity_id)
    .sort();
}

/** hass with the card's entity carrying the printer's sensors as attributes, so State content can offer every one. */
function withSensorAttributes(hass, entityId) {
  const stateObj = hass?.states[entityId];
  if (!stateObj) return hass;
  const attributes = { ...sensorAttributes(hass, entityId, true), ...stateObj.attributes };
  return { ...hass, states: { ...hass.states, [entityId]: { ...stateObj, attributes } } };
}

/**
 * The tile card's editor, with the options above left out. It is the tile
 * card's own editor class, so it keeps every future change to it.
 */
function tileEditorType() {
  if (customElements.get(TILE_EDITOR_TYPE)) return TILE_EDITOR_TYPE;
  const Base = customElements.get("hui-tile-card-editor");
  if (!Base) return null;
  customElements.define(TILE_EDITOR_TYPE, class extends Base {
    constructor() {
      super();
      const original = this._schema;
      if (typeof original !== "function") return;
      let lastIn, lastOut;
      this._schema = (...args) => {
        const schema = original.apply(this, args);
        if (schema !== lastIn) {
          lastIn = schema;
          lastOut = Array.isArray(schema) ? hideOptions(schema) : schema;
        }
        return lastOut;
      };
    }
  });
  return TILE_EDITOR_TYPE;
}

class PrusaConnectCardEditor extends HTMLElement {
  constructor() {
    super();
    // A new editor: its preview starts expanded
    PREVIEW_OPEN.clear();
    this.attachShadow({ mode: "open" });
    this.shadowRoot.innerHTML = `
      <style>
        #tile { display: block; }
        #printer { display: block; margin-bottom: 24px; }
        ha-expansion-panel {
          display: block; margin-top: 24px;
          --expansion-panel-content-padding: 0;
          border-radius: var(--ha-border-radius-md, 8px);
          --ha-card-border-radius: var(--ha-border-radius-md, 8px);
        }
        ha-expansion-panel > [slot="header"] { margin: 0; font-size: inherit; font-weight: inherit; }
        .content { padding: 12px; display: grid; gap: 16px; }
        .row { display: flex; align-items: center; gap: 12px; }
      </style>
      <ha-form id="printer"></ha-form>
      <div id="tile"></div>
      <ha-expansion-panel outlined expanded>
        <div slot="header" role="heading" aria-level="3">Prusa</div>
        <div class="content">
          <ha-form id="style"></ha-form>
          <div class="row" id="row"><ha-button id="randomize">Randomize reflections</ha-button></div>
          <ha-form id="form"></ha-form>
        </div>
      </ha-expansion-panel>`;
    this._statesProvider = new StatesProvider(this.shadowRoot);
    this._printerForm = this.shadowRoot.getElementById("printer");
    this._printerForm.computeLabel = (s) => s.label;
    this._printerForm.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      const state = printerState(this._hass, ev.detail.value?.device);
      if (state && state !== this._config.entity) this._update({ entity: state });
    });
    this._styleForm = this.shadowRoot.getElementById("style");
    this._form = this.shadowRoot.getElementById("form");
    // Home Assistant's form cannot draw without a schema; hass can come before the configuration
    for (const form of [this._printerForm, this._styleForm, this._form]) form.schema = [];
    for (const form of [this._styleForm, this._form]) {
      form.computeLabel = (s) => s.label ?? s.title ?? s.name;
      form.computeHelper = (s) => s.helper;
    }
    this._styleForm.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      const v = ev.detail.value;
      this._update({ style: { ...(this._config.style ?? {}), ...v } });
    });
    this._form.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      const v = ev.detail.value;
      this._update({
        features_style: v.features_style,
        enabled_color: v.enabled_color,
        status_badge: v.status_badge ?? [],
        connection_badge: v.connection_badge !== false,
        progress_edge: { ...PROGRESS_DEFAULTS, ...(v.progress_edge ?? {}) },
        collapsible: v.collapsible !== false,
        expanded_at_load: v.expanded_at_load === true,
        expand_when_job_starts: v.expand_when_job_starts !== false,
        collapse_when_job_ends: v.collapse_when_job_ends !== false,
        last_feature_full_width: v.last_feature_full_width !== false,
      });
    });
    this.shadowRoot.getElementById("randomize").addEventListener("click", () => {
      this._update({ style: { ...(this._config.style ?? {}), reflections: 1 + Math.floor(Math.random() * 99999) } });
    });
  }

  set hass(hass) {
    this._hass = hass;
    this._printerForm.hass = hass;
    this._styleForm.hass = hass;
    this._form.hass = hass;
    this._setTileEditorHass(this._config?.entity);
    if (this._config) this._render();
  }

  /** The tile editor gets Home Assistant's own hass; the states context, which its State content picker reads, carries the card's attributes. */
  _setTileEditorHass(entity) {
    if (!this._hass) return;
    this._statesProvider.states = withSensorAttributes(this._hass, entity).states;
    if (this._tileEditor) this._tileEditor.hass = this._hass;
  }

  set lovelace(lovelace) {
    this._lovelace = lovelace;
    if (this._tileEditor) this._tileEditor.lovelace = lovelace;
  }

  setConfig(config) {
    this._config = minimal(config, this._hass);
    this._render();
    this._setTileEditorHass(this._config.entity);
    this._setTileEditorConfig();
    if (JSON.stringify(this._config) !== JSON.stringify(config)) this._fire();
  }

  async _setTileEditorConfig() {
    if (!this._tileEditor) {
      this._loading ??= (async () => {
        const helpers = await window.loadCardHelpers();
        helpers.createCardElement({ type: "tile", entity: this._config.entity });
        await customElements.whenDefined("hui-tile-card");
        const original = await customElements.get("hui-tile-card").getConfigElement();
        const type = tileEditorType();
        const editor = type ? document.createElement(type) : original;
        editor.addEventListener("config-changed", (ev) => {
          // The tile card's options changed: keep ours and pass the whole card on
          ev.stopPropagation();
          const own = Object.fromEntries(OWN_KEYS.filter((k) => k in this._config).map((k) => [k, this._config[k]]));
          const next = { ...ev.detail.config, ...own, type: this._config.type };
          delete next.show_entity_picture;
          this._config = minimal(next, this._hass);
          this._fire();
          this._render();
          editor.setConfig(tileConfig(this._config));
        });
        if (this._lovelace) editor.lovelace = this._lovelace;
        this._tileEditor = editor;
        this._setTileEditorHass(this._config.entity);
        this.shadowRoot.getElementById("tile").replaceWith(editor);
      })();
      await this._loading;
    }
    this._tileEditor.setConfig(tileConfig(this._config));
  }

  _render() {
    const c = this._config;
    if (!c) return;
    const style = styleOptions(c, this._hass);
    const look = this._hass ? lookOf(style, this._hass) : undefined;
    this._printerForm.schema = [{
      name: "device", label: "Printer", required: true,
      selector: { device: { integration: DOMAIN, entity: [{ integration: DOMAIN, domain: "sensor", device_class: "enum" }] } },
    }];
    this._printerForm.data = { device: this._hass?.entities?.[c.entity]?.device_id };
    this._styleForm.schema = [
      {
        name: "family", label: "Style",
        helper: "Defaults to your printer's family. None follows your theme. Custom uses the frame and door colors below.",
        selector: select(FAMILY_OPTIONS),
      },
      ...(style.family !== "none" ? [{
        type: "grid", name: "", schema: [
          { name: "frame", label: "Frame color", helper: "Such as #434242. Empty: the family's own.", selector: { text: {} } },
          { name: "door", label: "Door color", helper: "Such as #141619. Adds a door to any family. Empty: the family's own (only the CORE Family has one).", selector: { text: {} } },
        ],
      }] : []),
      ...(look?.door ? [{
        name: "status_bar", label: "RGB status bar",
        helper: "The door lights up as the printer's RGB status bar does: blue while printing, green when finished, yellow pulsing when paused or needing attention, red pulsing on an error, and dark otherwise.",
        selector: { boolean: {} },
      }] : []),
    ];
    this._styleForm.data = { family: style.family, frame: style.frame ?? "", door: style.door ?? "", status_bar: style.status_bar };
    this.shadowRoot.getElementById("row").style.display = look?.door ? "" : "none";
    this._form.schema = [
      ...(look ? [{
        name: "features_style", label: "Features style",
        helper: "Match style: the controls sit on the frame. Flat: on a plain patch of the frame's color. Console: in a channel pressed into the frame.",
        selector: select(FEATURES_STYLES),
      }] : []),
      {
        name: "enabled_color", label: "Enabled color",
        helper: "The color of keys that are on, and of sliders. The print's keys keep their own colors.",
        selector: { ui_color: { default_color: ENABLED_COLOR, extra_options: STATE_COLORS } },
      },
      {
        name: "collapsible", label: "Collapsible",
        helper: "Tapping the card shows or hides its features, in place of the card's Tap behavior (under Interactions). Tapping the icon still works as set.",
        selector: { boolean: {} },
      },
      ...(c.collapsible !== false ? [
        { name: "expanded_at_load", label: "Expanded at load", selector: { boolean: {} } },
        { name: "expand_when_job_starts", label: "Expand when a print starts", selector: { boolean: {} } },
        { name: "collapse_when_job_ends", label: "Collapse when a print ends", helper: "When it finishes or is stopped.", selector: { boolean: {} } },
      ] : []),
      ...((c.features_position ?? DEFAULT_FEATURES_POSITION) === "inline" ? [{
        name: "last_feature_full_width", label: "Last feature full width",
        helper: "The features sit beside the title in two columns. When the last one ends up alone in its row, it stretches across both columns instead of leaving the other empty.",
        selector: { boolean: {} },
      }] : []),
      {
        name: "status_badge", label: "Status badge",
        helper: "Shown at the top right of the icon. When several apply, the first in this list shows.",
        selector: { select: { multiple: true, reorder: true, mode: "dropdown", options: statusBadgesOf(this._hass, c.entity).map(([value, label]) => ({ value, label })) } },
      },
      {
        name: "connection_badge", label: "Connection badge",
        helper: "Shown at the bottom right of the icon: whether Prusa Connect reaches the printer. Unavailable always shows.",
        selector: { boolean: {} },
      },
      {
        type: "expandable", name: "progress_edge", title: "Progress edge",
        schema: [
          { name: "edge", label: "Edge", selector: select(EDGES) },
          {
            type: "grid", name: "", schema: [
              { name: "thickness", label: "Thickness (px)", selector: { number: { mode: "box", min: 1, max: 24, step: 1 } } },
              { name: "starts_at", label: "Starts at (%)", selector: { number: { mode: "box", min: 0, max: 100, step: 1 } } },
              { name: "ends_at", label: "Ends at (%)", selector: { number: { mode: "box", min: 0, max: 100, step: 1 } } },
            ],
          },
          { name: "direction", label: "Direction", selector: select(DIRECTIONS) },
          {
            name: "color", label: "Color",
            helper: "Follows the state: Prusa orange while printing, amber when paused, green when finished. Thresholds: green above 60%, amber above 20%, red below. Or type any color.",
            selector: select([["state", "Follows the state"], ["thresholds", "Thresholds"]], { custom_value: true }),
          },
          { name: "show_percentage", label: "Show the percentage", selector: { boolean: {} } },
          {
            name: "show_while", label: "Show while",
            selector: { select: { multiple: true, mode: "list", options: SHOW_WHILE.map(([value, label]) => ({ value, label })) } },
          },
        ],
      },
    ];
    this._form.data = {
      features_style: c.features_style ?? DEFAULT_FEATURES_STYLE,
      enabled_color: c.enabled_color ?? ENABLED_COLOR,
      status_badge: Array.isArray(c.status_badge) ? c.status_badge : defaultStatusBadges(this._hass, c.entity),
      connection_badge: c.connection_badge !== false,
      progress_edge: progressOptions(c),
      collapsible: c.collapsible !== false,
      expanded_at_load: c.expanded_at_load === true,
      expand_when_job_starts: c.expand_when_job_starts !== false,
      collapse_when_job_ends: c.collapse_when_job_ends !== false,
      last_feature_full_width: c.last_feature_full_width !== false,
    };
  }

  _update(changes) {
    this._config = minimal({ ...this._config, ...changes }, this._hass);
    this._render();
    if ("entity" in changes) this._setTileEditorConfig();
    this._fire();
  }

  _fire() {
    fire(this, "config-changed", { config: this._config });
  }
}

/** Whether two option values are the same (lists and sets of options by their contents). */
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The configuration as the editor saves it: every option at its default
 * left out (the card applies the default), and the options that matter only
 * with a style, a door or a collapsible card left out without one.
 */
function minimal(config, hass) {
  const c = { ...config };
  if (c.style && typeof c.style === "object" && !Array.isArray(c.style)) {
    const own = { ...c.style };
    if (!FAMILY_IDS.includes(own.family) || (hass && own.family === deviceOf(hass, c.entity).profile.family)) delete own.family;
    for (const key of ["frame", "door"]) if (typeof own[key] !== "string" || !own[key].trim()) delete own[key];
    else own[key] = own[key].trim();
    const options = styleOptions({ ...c, style: own }, hass);
    const door = hass ? !!lookOf(options, hass)?.door : true;
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

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------
const define = (name, cls) => {
  if (!customElements.get(name)) customElements.define(name, cls);
};

if (!customElements.get(CARD_TYPE)) {
  for (const [tag, cls] of Object.entries(FEATURES)) define(tag, cls);
  define("prusa-feature-editor", PrusaFeatureEditor);
  define(CARD_TYPE, PrusaConnectCard);
  define(EDITOR_TYPE, PrusaConnectCardEditor);

  window.customCardFeatures = window.customCardFeatures || [];
  window.customCardFeatures.push(...Object.values(FEATURES).map((feature) => ({
    type: feature.type,
    name: feature.pickerName,
    isSupported: (hass, context) => isPrusa(hass, context?.entity_id) && feature.supports(deviceOf(hass, context.entity_id), hass),
    configurable: true,
  })));

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: CARD_TYPE,
    name: "Prusa Connect",
    description: "A tile card for a printer in Prusa Connect: its state, a progress edge, status and connection badges, and an optional Prusa style.",
    preview: true,
    documentationURL: "https://github.com/GizmoGoody/prusa-connect-card#configuration",
  });

  console.info(`%c PRUSA-CONNECT-CARD %c ${VERSION} `, "color: #fff; background: #fa6831; font-weight: 700;", "color: #fa6831; background: #fff;");
}
