// The printer and its entities, found once for each version of Home
// Assistant's entity and device registries.
import { DOMAIN, PRINTER_STATES } from "../const";
import { domainOf, known, type DeviceEntry, type EntityEntry, type HomeAssistant } from "../ha";
import { familyOf } from "./families";

/**
 * The printer's own entities: translation key and domains. A role's id is
 * its translation key in the integration. Those in PENDING are not offered
 * by the integration yet; the card finds them by these keys once it does.
 */
export const ROLES: Record<string, string[]> = {
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

// Each tool's entities: translation key and domains. Each is the role
// "tool_<n>_<key>", n counted from 1 as the printer's screen counts.
export const TOOL_KEYS: Record<string, string[]> = {
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

export interface Camera {
  entityId: string;
  id: string;
}

export interface Device {
  id?: string;
  device?: DeviceEntry;
  entities: EntityEntry[];
  // { role: entity_id }: ROLES, tool_<n>_<key> for TOOL_KEYS, connected and server
  roles: Record<string, string>;
  tools: number[];
  cameras: Camera[];
  profile: { family: string; model: string };
  // Every entity the card shows of the printer (see changedFor)
  ids: string[];
}

// The integration's entities of each device, rebuilt when Home Assistant's entity list changes
const byDeviceCache = new WeakMap<object, Map<string, EntityEntry[]>>();
function deviceEntities(hass: HomeAssistant, device?: string | null): EntityEntry[] {
  const entities = hass.entities;
  if (!entities || !device) return [];
  let byDevice = byDeviceCache.get(entities);
  if (!byDevice) {
    byDevice = new Map();
    for (const e of Object.values(entities)) {
      if (e.platform !== DOMAIN || !e.device_id) continue;
      if (!byDevice.has(e.device_id)) byDevice.set(e.device_id, []);
      byDevice.get(e.device_id)!.push(e);
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
function toolNumber(hass: HomeAssistant, e: EntityEntry): number | undefined {
  const fromId = e.entity_id.match(/_tool_(\d+)_/);
  if (fromId) return Number(fromId[1]);
  const name: string = hass.states[e.entity_id]?.attributes.friendly_name ?? "";
  const fromName = name.match(/\bTool (\d+)\b/i);
  return fromName ? Number(fromName[1]) : undefined;
}

/** A camera's id in the card's options: its name, in snake case (Camera Chamber: chamber). */
function cameraId(hass: HomeAssistant, entityId: string): string {
  const name: string = hass.states[entityId]?.attributes.friendly_name ?? entityId.split(".")[1];
  const own = name.match(/\bCamera (.+)$/i)?.[1] ?? name;
  return own.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function buildDevice(hass: HomeAssistant, id: string): Device {
  const device = hass.devices?.[id];
  const own = deviceEntities(hass, id);
  // The integration's server is the printer's hub: its update entity and the cameras Prusa Connect has not placed on a printer
  const hubEntities = deviceEntities(hass, device?.via_device_id);
  const roles: Record<string, string> = {};
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
  const counts: Record<string, number> = {};
  for (const e of own) {
    const key = e.translation_key ?? "";
    if (!TOOL_KEYS[key]?.includes(domainOf(e.entity_id))) continue;
    counts[key] = (counts[key] ?? 0) + 1;
    const n = toolNumber(hass, e) ?? counts[key];
    roles[`tool_${n}_${key}`] ??= e.entity_id;
  }
  const tools = [...new Set(Object.keys(roles).map((role) => role.match(/^tool_(\d+)_/)?.[1]).filter(Boolean).map(Number))].sort((a, b) => a - b);
  // The cameras on the printer's device, or else the server's
  const cameraOf = (list: EntityEntry[]) => list.filter((e) => domainOf(e.entity_id) === "camera").map((e) => e.entity_id);
  const cameraIds = cameraOf(own).length ? cameraOf(own) : cameraOf(hubEntities);
  return {
    id, device, entities: own, roles, tools,
    cameras: cameraIds.map((entityId) => ({ entityId, id: cameraId(hass, entityId) })),
    profile: { family: familyOf(device?.model), model: device?.model ?? "" },
    ids: [...own.map((e) => e.entity_id), ...(server ? [server.entity_id] : []), ...cameraIds],
  };
}

const NO_DEVICE: Device = Object.freeze({ id: undefined, entities: [], roles: {}, tools: [], cameras: [], profile: { family: "none", model: "" }, ids: [] });
const NO_DEVICES = {};
const deviceCache = new WeakMap<object, WeakMap<object, Map<string, Device>>>();

/** The printer of an entity and everything the card and the features use of it. */
export function deviceOf(hass: HomeAssistant | undefined, entityId?: string): Device {
  const entities = hass?.entities;
  const id = entityId ? entities?.[entityId]?.device_id : undefined;
  if (!hass || !entities || !id) return NO_DEVICE;
  const devices = hass.devices ?? NO_DEVICES;
  let byDevices = deviceCache.get(entities);
  if (!byDevices) deviceCache.set(entities, (byDevices = new WeakMap()));
  let byId = byDevices.get(devices);
  if (!byId) byDevices.set(devices, (byId = new Map()));
  if (!byId.has(id)) byId.set(id, buildDevice(hass, id));
  return byId.get(id)!;
}

export const isPrusa = (hass: HomeAssistant | undefined, entityId?: string): boolean =>
  !!entityId && hass?.entities?.[entityId]?.platform === DOMAIN;

// What else in hass the card and the features show
const HASS_PARTS = ["entities", "devices", "themes", "selectedTheme", "locale", "language", "user", "connected", "config"];

/** Whether a new hass changes anything shown for this entity and its printer. */
export function changedFor(before: HomeAssistant | undefined, hass: HomeAssistant | undefined, entityId?: string): boolean {
  if (!before || !hass) return before !== hass;
  if (before === hass) return false;
  if (HASS_PARTS.some((part) => before[part] !== hass[part])) return true;
  if (!entityId) return false;
  if (before.states[entityId] !== hass.states[entityId]) return true;
  return deviceOf(hass, entityId).ids.some((id) => before.states[id] !== hass.states[id]);
}

/** The printer's phase: its State sensor's state, or off while it is unavailable or unknown. */
export function phaseNow(hass: HomeAssistant | undefined, entityId?: string): string {
  const stateObj = hass?.states[deviceOf(hass, entityId).roles.state];
  if (!known(stateObj)) return "off";
  // A state another vendor's printer reports, outside Prusa's: shown as idle
  return Object.hasOwn(PRINTER_STATES, stateObj.state) && stateObj.state !== "off" ? stateObj.state : "idle";
}

/**
 * A heater's state, as Prusa Connect works it out (heaterState and
 * chamberState): within 2 °C of its target it is at temperature; with no
 * target it is cooling above 40 °C, else off; a chamber with no target is
 * off whatever the air.
 */
export function heaterState(current: number, target: number, chamber = false): string {
  if (!Number.isFinite(current)) return "unknown";
  if (!(target > 0)) return !chamber && current > 40 ? "cooling" : "off";
  if (current < target - 2) return "heating";
  if (current > target + 2) return "cooling";
  return "at_temperature";
}

/**
 * The printer's sensors, binary sensors and the server's version, as
 * attributes for the tile card's State content: { role: the state as Home
 * Assistant shows it }. The card's own entity is left out. Unknown and
 * unavailable states are left out unless all is true (the editor offers
 * every one).
 */
export function sensorAttributes(hass: HomeAssistant, entityId: string, all = false): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [role, id] of Object.entries(deviceOf(hass, entityId).roles)) {
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

const isStateSensor = (e: EntityEntry) => e.platform === DOMAIN && e.translation_key === "state" && domainOf(e.entity_id) === "sensor";

/** A printer device's State sensor. */
export const printerState = (hass: HomeAssistant | undefined, device?: string): string | undefined =>
  Object.values(hass?.entities ?? {}).find((e) => e.device_id === device && isStateSensor(e))?.entity_id;

/** Every printer's State sensor. */
export const printerStateSensors = (hass: HomeAssistant | undefined): string[] =>
  Object.values(hass?.entities ?? {}).filter(isStateSensor).map((e) => e.entity_id).sort();
