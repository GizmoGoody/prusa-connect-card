// The items a control shows in a feature's row: a key, a read-out or a
// field, described here and drawn by the feature (see base.ts).
import { PRINTER_STATES } from "../const";
import { entityName, formatValue, isOn, known, moreInfo, performAction, usable, type Config, type HomeAssistant } from "../ha";
import { blocked, controlOf, heaterTargets, PRESETS, valueOf, type Control, type Moment } from "../printer/controls";
import { heaterState } from "../printer/device";

export interface Item {
  key: string;
  // Its name for hover and screen readers
  label?: string;
  // The entity whose icon it shows, or an icon
  entity?: string;
  icon?: string;
  text?: string;
  color?: string;
  pressed?: boolean;
  disabled?: boolean;
  action?: () => void;
  // A state only shown (a tap opens it), dimmed while off, and a heater's state
  readout?: boolean;
  dim?: boolean;
  heat?: string;
  // Seconds per turn of the icon
  spin?: number;
  alwaysText?: boolean;
  wide?: boolean;
  // A key that opens a list
  menu?: { value: string; label: string }[];
  choose?: (value: string) => void;
  // A field: the control, the number entity it sets, and a pair's reading
  field?: string;
  entity_set?: string;
  reading?: string;
}

/** What every key made from a control has: its id, its entity (whose icon it shows), its one-word name, title and color. */
function keyBase(control: Control, entityId: string | undefined, moment: Moment): Item {
  const name = valueOf(control.name, { ...moment, tool: control.tool }) ?? entityName(moment.hass, entityId);
  const title = entityName(moment.hass, entityId) ?? control.option ?? name;
  return {
    key: control.id, entity: entityId, icon: entityId || typeof control.icon !== "string" ? undefined : control.icon,
    text: name, color: control.color, label: title,
  };
}

// A fan's turn, in seconds: one speed, or each of four (see fanTurn)
const FAN_TURN = 1.2;
const FAN_TURNS = [2.4, 1.6, 1, 0.6];
/** A fan's turn at a percentage (1 to 100): faster in each quarter; none when animate_fan is off. */
const fanTurn = (config: Config, percentage?: number) => (config?.animate_fan === false ? undefined
  : percentage === undefined ? FAN_TURN : FAN_TURNS[Math.min(3, Math.max(0, Math.ceil(percentage / 25) - 1))]);

/** A key for a button entity: a tap presses it, asking first when the control says so. */
function pressKey(host: HTMLElement, control: Control, entityId: string, moment: Moment): Item {
  return {
    ...keyBase(control, entityId, moment), disabled: !usable(moment.hass, entityId) || blocked(control, moment),
    action: () => {
      const asks = !!control.confirm && moment.config[control.confirmOption ?? ""] !== false;
      performAction(host, "button.press", entityId, asks ? control.confirm : undefined);
    },
  };
}

/**
 * A read-out of a state: its icon and its value as Home Assistant shows it
 * (without its unit where the card shows none). Blank while no value is
 * known: only the icon shows, as in the xTool card. A tap opens the entity.
 */
function valueKey(host: HTMLElement, control: Control, entityId: string, moment: Moment): Item | undefined {
  const hass = moment.hass, stateObj = hass.states[entityId];
  if (!stateObj) return undefined;
  const base = keyBase(control, entityId, moment);
  const noUnit = control.noUnit || (control.axis && moment.config?.units !== true);
  const value = known(stateObj) ? formatValue(hass, stateObj, noUnit) : undefined;
  const running = control.fan && Number(stateObj.state) > 0;
  return {
    ...base, readout: true, text: value, alwaysText: true, label: `${base.label}: ${value ?? hass.formatEntityState(stateObj)}`, wide: control.wide,
    disabled: !usable(hass, entityId), spin: running ? fanTurn(moment.config) : undefined,
    action: () => moreInfo(host, entityId),
  };
}

/** A read-out of a binary sensor: by its name, in its color while on and dimmed while off. */
function flagKey(host: HTMLElement, control: Control, entityId: string, moment: Moment): Item | undefined {
  const hass = moment.hass, stateObj = hass.states[entityId];
  if (!stateObj) return undefined;
  const base = keyBase(control, entityId, moment);
  return {
    ...base, readout: true, alwaysText: true, dim: !isOn(stateObj), label: `${base.label}: ${hass.formatEntityState(stateObj)}`,
    disabled: !usable(hass, entityId), action: () => moreInfo(host, entityId),
  };
}

export const HEAT_WORDS: Record<string, string> = { heating: "heating", cooling: "cooling", at_temperature: "at temperature", off: "off" };

/** A heater's reading, tinted as Prusa Connect tints it (see heaterState). Blank while unknown. A tap opens the reading. */
function heaterKey(host: HTMLElement, control: Control, entityId: string, moment: Moment): Item | undefined {
  const hass = moment.hass, stateObj = hass.states[entityId];
  if (!stateObj) return undefined;
  const base = keyBase(control, entityId, moment);
  const target = Number(hass.states[moment.device.roles[control.target ?? ""]]?.state);
  const state = known(stateObj) ? heaterState(Number(stateObj.state), target, !!control.chamber) : "unknown";
  const value = known(stateObj) ? hass.formatEntityState(stateObj) : undefined;
  const words = HEAT_WORDS[state];
  return {
    ...base, readout: true, text: value, alwaysText: true, heat: value === undefined ? undefined : state,
    label: `${base.label}: ${value ?? hass.formatEntityState(stateObj)}${words ? `, ${words}` : ""}`, disabled: !usable(hass, entityId),
    action: () => moreInfo(host, entityId),
  };
}

/** A number field: the control and the entity it sets (see PrusaField). */
function fieldKey(_host: HTMLElement, control: Control, entityId: string): Item | undefined {
  return entityId ? { key: control.id, field: control.id, entity_set: entityId } : undefined;
}

/**
 * A heater and its target as one field (see PrusaField): the reading on
 * top, and the target under it (Off at 0).
 */
function pairKey(_host: HTMLElement, control: Control, _entityId: string, moment: Moment): Item | undefined {
  const [reading, target] = (control.parts ?? []).map((id) => moment.device.roles[controlOf(id)?.role ?? id]);
  return reading && target ? { key: control.id, field: control.id, entity_set: target, reading } : undefined;
}

// The last manual speed of each chamber fan, as Prusa Connect remembers it
const FAN_SPEEDS = new Map<string, number>();
const DEFAULT_FAN_SPEED = 50;

/**
 * The chamber fan, as Prusa Connect sets it: Off, A (Auto) and Manual, a
 * percentage. The Manual key shows the speed; its first tap returns the fan
 * to the last manual speed, and a tap while it runs at it opens Home
 * Assistant's dialog for the fan, whose slider sets another. The key in use
 * is pressed, and its fan turns, faster at a higher speed.
 */
function chamberFanKeys(host: HTMLElement, control: Control, entityId: string, moment: Moment): Item[] | undefined {
  const hass = moment.hass, stateObj = hass.states[entityId];
  if (!stateObj) return undefined;
  const presets: string[] = stateObj.attributes.preset_modes ?? [];
  const auto = presets.find((p) => `${p}`.toLowerCase() === "auto") ?? presets[0];
  const percentage = Number(stateObj.attributes.percentage);
  const mode = stateObj.attributes.preset_mode ? "auto" : stateObj.state === "off" ? "off" : stateObj.state === "on" ? "manual" : undefined;
  if (mode === "manual" && percentage > 0) FAN_SPEEDS.set(entityId, percentage);
  const last = FAN_SPEEDS.get(entityId) ?? DEFAULT_FAN_SPEED;
  const ok = usable(hass, entityId) && moment.phase !== "off";
  const name = entityName(hass, entityId) ?? control.option;
  const key = (id: string, own: Omit<Item, "key">): Item => ({
    key: `chamber_fan_${id}`, alwaysText: own.text !== undefined && id !== "off", disabled: !ok, ...own,
  });
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
        ? moreInfo(host, entityId)
        : hass.callService("fan", "set_percentage", { entity_id: entityId, percentage: last })),
    }),
  ];
}

/** Set heater targets: [entity_id, °C] each, within its range. */
function setTargets(hass: HomeAssistant, targets: [string, number][]): void {
  for (const [entityId, value] of targets) {
    const { min = -Infinity, max = Infinity } = hass.states[entityId]?.attributes ?? {};
    hass.callService("number", "set_value", { entity_id: entityId, value: Math.min(max, Math.max(min, value)) });
  }
}

/** Presets: a key that opens the list of Prusa Connect's presets; one chosen sets every nozzle and the bed. */
function presetsKey(_host: HTMLElement, control: Control, _entityId: string, moment: Moment): Item {
  const { device, hass } = moment;
  const nozzles = device.tools.map((n) => device.roles[`tool_${n}_nozzle_target_temperature`]).filter(Boolean);
  const bed = device.roles.bed_target_temperature;
  return {
    key: control.id, icon: control.icon as string, text: control.name as string, label: "Presets. Choose a material to preheat",
    color: PRINTER_STATES.printing.color, disabled: moment.phase === "off" || ![...nozzles, bed].some((id) => usable(hass, id)),
    menu: PRESETS.map(([material, nozzle, bedTemp]) => ({ value: material, label: `${material}: ${nozzle} / ${bedTemp} °C` })),
    choose: (material) => {
      const preset = PRESETS.find(([name]) => name === material);
      if (preset) setTargets(hass, [...nozzles.map((id): [string, number] => [id, preset[1]]), ...(bed ? [[bed, preset[2]] as [string, number]] : [])]);
    },
  };
}

/** Cool down: every heater's target to 0 (off). */
function coolDownKey(_host: HTMLElement, control: Control, _entityId: string, moment: Moment): Item {
  const targets = heaterTargets(moment.device);
  return {
    key: control.id, icon: control.icon as string, text: control.name as string, label: "Cool down. Turns every heater off", color: control.color,
    disabled: moment.phase === "off" || !targets.some((id) => usable(moment.hass, id)),
    action: () => setTargets(moment.hass, targets.map((id): [string, number] => [id, 0])),
  };
}

type KeyMaker = (host: HTMLElement, control: Control, entityId: string, moment: Moment) => Item | Item[] | undefined;

/** The kinds of control, each with how it makes its key, keys or field. */
const KINDS: Record<string, KeyMaker> = {
  press: pressKey,
  value: valueKey,
  flag: flagKey,
  heater: heaterKey,
  field: fieldKey,
  pair: pairKey,
  chamber_fan: chamberFanKeys,
  presets: presetsKey,
  cool_down: coolDownKey,
};

/** A control's items now: none, one or several. */
export const itemsOf = (host: HTMLElement, control: Control, entityId: string, moment: Moment): Item[] =>
  ([] as (Item | undefined)[]).concat(KINDS[control.kind ?? ""]?.(host, control, entityId, moment)).filter((i): i is Item => !!i);
