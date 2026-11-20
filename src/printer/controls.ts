// Every control a feature can show, and how each works.
import { JOB_PHASES, PRINTER_STATES } from "../const";
import type { Config, HomeAssistant } from "../ha";
import type { Device } from "./device";

/** What the controls' rules look at: hass, the printer, its phase and the feature's configuration. */
export interface Moment {
  hass: HomeAssistant;
  device: Device;
  phase: string;
  config: Config;
  tool?: number;
}

/**
 * A control. Unless role names another, its id is the role of the entity it
 * acts on. It declares:
 * - kind: how it works (see keys.ts): press (a button entity), value (a
 *   state shown as a read-out; a tap opens it), flag (a binary sensor shown
 *   by its name, dimmed while off), heater (a temperature, tinted as Prusa
 *   Connect tints it), field (a number to type in and slide on), pair (a
 *   heater and its target as one control), chamber_fan, presets, cool_down,
 *   light,
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
export interface ControlSpec {
  kind?: string;
  name?: string | ((moment: Partial<Moment>) => string);
  option?: string;
  icon?: string | true;
  color?: string;
  confirm?: Config;
  confirmOption?: string;
  allowed?: (moment: Moment) => boolean;
  target?: string;
  chamber?: boolean;
  parts?: string[];
  noUnit?: boolean;
  axis?: boolean;
  fan?: boolean;
  wide?: boolean;
  decimals?: number;
  picks?: string[];
  pick?: (moment: Moment) => string;
}

export interface Control extends ControlSpec {
  id: string;
  role: string;
  tool?: number;
  key?: string;
  part?: string;
}

const notPrinting = ({ phase }: Moment) => !JOB_PHASES.includes(phase) && phase !== "off";

export const CONTROLS: Record<string, ControlSpec> = {
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
    kind: "pair", parts: ["chamber_temperature", "chamber_target_temperature"], chamber: true, option: "Chamber temperature and target",
  },
  // Off, A (Auto) and Manual, as Prusa Connect sets the chamber fan
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

  // Lights
  chamber_light: { kind: "light", name: "Light", option: "Chamber light" },

  // Utilities
  beep: { kind: "press", name: "Beep", icon: "mdi:volume-high", option: "Beep" },
  reset_printer: {
    kind: "press", name: "Reset", icon: "mdi:restart", color: "error", option: "Reset printer",
    confirm: { title: "Reset the printer?", text: "The printer restarts. A print under way stops.", confirm_text: "Reset printer" },
    confirmOption: "ask_before_resetting",
  },
};

// Each tool's controls, by their key: the control tool_<n>_<key> acts on that tool's entity
export const TOOL_CONTROLS: Record<string, ControlSpec> = {
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

// The controls the integration does not offer yet (see PENDING_URL)
export const PENDING = [
  "chamber_temperature", "chamber_target_temperature", "chamber_temperature_and_target", "chamber_fan",
  "chamber_light", "chamber_light_brightness", "flow", "home", "disable_steppers", "beep", "reset_printer",
];

/** A control from the registry, with its id and role; a tool's control with its tool's roles. */
export function controlOf(id: string): Control | undefined {
  if (Object.hasOwn(CONTROLS, id)) {
    const control = CONTROLS[id];
    return { id, role: control.parts?.[0] ?? id, ...control };
  }
  const match = `${id ?? ""}`.match(/^tool_(\d+)_(.+)$/);
  const base = match && Object.hasOwn(TOOL_CONTROLS, match[2]) ? TOOL_CONTROLS[match[2]] : undefined;
  if (!match || !base) return undefined;
  const at = (key: string) => `tool_${match[1]}_${key}`;
  const parts = base.parts?.map(at);
  return {
    ...base, id, role: parts?.[0] ?? id, tool: Number(match[1]), key: match[2],
    ...(base.target ? { target: at(base.target) } : {}), ...(parts ? { parts } : {}),
  };
}

/** A control's value: as given, or worked out for the moment. */
export const valueOf = <T>(value: T | ((moment: Partial<Moment>) => T), moment: Partial<Moment>): T =>
  (typeof value === "function" ? (value as (m: Partial<Moment>) => T)(moment) : value);

/** Every heater target of the printer: each tool's nozzle, the bed and the chamber. */
export const heaterTargets = (device: Device): string[] => [
  ...device.tools.map((n) => device.roles[`tool_${n}_nozzle_target_temperature`]),
  device.roles.bed_target_temperature, device.roles.chamber_target_temperature,
].filter(Boolean);

/** Whether the device has what a control acts on (a key that stands for others: any of them; a pair: both). */
export function present(control: Control | undefined, device: Device): boolean {
  if (!control) return false;
  if (control.picks) return control.picks.some((id) => present(controlOf(id), device));
  if (control.parts) return control.parts.every((role) => !!device.roles[role]);
  if (control.kind === "presets" || control.kind === "cool_down") return heaterTargets(device).length > 0;
  return !!device.roles[control.role];
}

/** Whether a control's rules make it unavailable now (its entity aside). */
export const blocked = (control: Control, moment: Moment): boolean =>
  moment.phase === "off" || (!!control.allowed && !control.allowed(moment));

/**
 * Prusa Connect's preheat presets: [material, nozzle, bed] (°C). A preset
 * sets every nozzle and the bed; the chamber keeps its target.
 */
export const PRESETS: [string, number, number][] = [["PLA", 215, 60], ["PETG", 230, 85], ["ASA", 260, 105], ["PC", 275, 110], ["FLEX", 240, 50]];

/** Each heater's reading: each tool's nozzle, the bed and the chamber. */
export const heaterIds = (device: Device): string[] => [
  ...device.tools.map((n) => `tool_${n}_nozzle_temperature`), "bed_temperature", "chamber_temperature",
];
export const pairOf = (reading: string): string => `${reading}_and_target`;
export const targetOf = (reading: string): string => reading.replace(/_temperature$/, "_target_temperature");
