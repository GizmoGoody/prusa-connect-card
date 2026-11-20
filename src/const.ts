declare const __VERSION__: string;

export const VERSION = __VERSION__;
export const DOMAIN = "prusa_connect";
export const CARD_TYPE = "prusa-connect-card";
export const EDITOR_TYPE = "prusa-connect-card-editor";
export const TILE_EDITOR_TYPE = "prusa-connect-tile-card-editor";
export const FEATURE_EDITOR_TYPE = "prusa-feature-editor";
// The request for the controls the integration does not offer yet
export const PENDING_URL = "https://github.com/prusa3d/prusa-connect-homeassistant/issues/14";

// Home Assistant's named colors (the tile card's color picker)
const HA_COLORS = [
  "primary", "accent", "red", "pink", "purple", "deep-purple", "indigo", "blue", "light-blue", "cyan",
  "teal", "green", "light-green", "lime", "yellow", "amber", "orange", "deep-orange", "brown",
  "light-grey", "grey", "dark-grey", "blue-grey", "black", "white", "disabled",
  "error", "warning", "success", "info",
];
const STATE_FALLBACKS: Record<string, string> = { error: "red", warning: "amber", success: "green", info: "blue" };

/** A color as CSS: one of Home Assistant's named colors, or the color as given. */
export const cssColor = (color: string): string => (STATE_FALLBACKS[color] ? `var(--${color}-color, var(--${STATE_FALLBACKS[color]}-color))`
  : HA_COLORS.includes(color) ? `var(--${color}-color)` : color);

export const STATE_COLORS = [["error", "Error"], ["warning", "Warning"], ["success", "Success"], ["info", "Info"]]
  .map(([value, label]) => ({ value, label, display_color: cssColor(value) }));

// One color for every key that is on and every slider, across the card
export const ENABLED_COLOR = "info";
export const ENABLED = `var(--prusa-enabled-color, ${cssColor(ENABLED_COLOR)})`;

// The printer's states (the State sensor's options), each with its color and
// icon; Printing in Prusa orange
export const PRINTER_STATES: Record<string, { color: string; icon: string }> = {
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
export type Phase = keyof typeof PRINTER_STATES;

// The states of a job under way: it can be paused, resumed or stopped
export const JOB_PHASES = ["printing", "paused", "attention"];

/**
 * Prusa Connect's chart palette (primary, info, success, warning,
 * destructive), for the light and the dark theme, and its heating and
 * cooling tints (see heaterState).
 */
export const PALETTE = {
  light: ["#fd5000", "#547aeb", "#008257", "#443c21", "#cc2e39"],
  dark: ["#fd5000", "#547aeb", "#71c7a2", "#fbd23c", "#ff8f8b"],
};
export const HEAT_TINTS = {
  light: { heating: "#443c21", cooling: "#4466d0" },
  dark: { heating: "#fbd23c", cooling: "#93b4ff" },
};

/**
 * The printer's RGB status bar (status_leds_handler.cpp in the firmware),
 * by state: [red green blue, pattern]. Solid blue while printing, solid
 * green when finished, yellow pulsing every 2 s for a warning, red pulsing
 * every 1 s for an error, and off otherwise.
 */
export const STATUS_BAR: Record<string, [string, string]> = {
  printing: ["0 150 255", "solid"], finished: ["0 255 0", "solid"],
  paused: ["255 255 0", "warning"], attention: ["255 255 0", "warning"], error: ["255 0 0", "error"],
};

// The tile card's Time format choices (its time_format option)
export const TIME_FORMATS = ["relative", "total", "date", "time", "datetime"];
