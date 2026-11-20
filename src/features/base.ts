// What every feature has, and the features made of rows of keys.
import { html, LitElement, nothing, type CSSResultGroup, type PropertyValues, type TemplateResult } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { styleMap } from "lit/directives/style-map.js";
import { CARD_TYPE, cssColor, ENABLED, HEAT_TINTS } from "../const";
import { darkMode, entityName, select, usable, type Config, type FeatureContext, type HomeAssistant } from "../ha";
import { controlOf, heaterIds, PENDING, present, valueOf, type Control, type Moment } from "../printer/controls";
import { dim, heaterColors } from "../printer/history";
import { changedFor, deviceOf, phaseNow, type Device } from "../printer/device";
import { itemsOf, type Item } from "./keys";
import { ITEM_MIN, RowFitter } from "./rows";
import { featureStyles } from "./styles";

// What a feature's keys show: their icons, their names, or both
const DISPLAYS: [string, string][] = [["icons", "Icons"], ["names", "Names"], ["both", "Icons and names"]];
export const displayOf = (config?: Config, fallback = "icons"): string =>
  (DISPLAYS.some(([value]) => value === config?.show) ? config!.show : fallback);
export const displayField = () => ({ name: "show", label: "Show", selector: select(DISPLAYS) });

/** What a key shows with Show: its icon, its text, or both. */
function faceOf(b: Item, display: string) {
  const icon = !!(b.entity || b.icon), text = !!b.text;
  const showIcon = icon && (display !== "names" || !text);
  const showText = text && (display !== "icons" || !showIcon || !!b.alwaysText);
  return { showIcon, showText };
}

/** The Prusa Connect card a feature is in, if any. */
export function cardOf(el: Element): (HTMLElement & { config?: Config }) | undefined {
  for (let node = (el.getRootNode() as ShadowRoot).host; node; node = (node.getRootNode() as ShadowRoot).host) {
    if (node.localName === CARD_TYPE) return node as HTMLElement & { config?: Config };
  }
  return undefined;
}

/** A color (one of Home Assistant's named colors, or any CSS color) as #rrggbb, read where it is used; undefined if it cannot be read. */
let hexCanvas: CanvasRenderingContext2D | null | undefined;
export function toHex(el: Element, color: string): string | undefined {
  let value = cssColor(color);
  for (let i = 0; i < 4; i++) {
    const named = value.match(/^var\((--[\w-]+)(?:,\s*(.+))?\)$/);
    if (!named) break;
    value = getComputedStyle(el).getPropertyValue(named[1]).trim() || named[2] || "";
  }
  if (!value) return undefined;
  hexCanvas ??= document.createElement("canvas").getContext("2d");
  if (!hexCanvas) return undefined;
  hexCanvas.fillStyle = "#010203";
  hexCanvas.fillStyle = value;
  const hex = String(hexCanvas.fillStyle);
  return hex.startsWith("#") && (hex !== "#010203" || value === "#010203") ? hex : undefined;
}

export interface FeatureOption {
  name: string;
  label: string;
  helper?: string;
  default?: unknown;
  selector?: Config;
}

export interface FeatureForm {
  pending: string[];
  schema: Config[];
  data: (config: Config) => Config;
}

/**
 * Text that reads on a filled key: dark on a light color, white on a dark
 * one; null when the color cannot be read yet.
 */
let colorCanvas: CanvasRenderingContext2D | null | undefined;
function textOn(probe: HTMLElement, cssValue: string): string | null {
  probe.style.color = "";
  probe.style.color = cssValue;
  const resolved = getComputedStyle(probe).color;
  if (!resolved) return null;
  colorCanvas ??= document.createElement("canvas").getContext("2d");
  if (!colorCanvas) return null;
  colorCanvas.fillStyle = "#000";
  colorCanvas.fillStyle = resolved;
  const value = String(colorCanvas.fillStyle);
  const rgb = value.startsWith("#")
    ? value.slice(1).match(/../g)!.map((h) => parseInt(h, 16))
    : (value.match(/[\d.]+/g) ?? ["0", "0", "0"]).map(Number);
  const luma = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  return luma > 0.6 ? "rgba(0, 0, 0, .85)" : "#fff";
}

/**
 * What every feature has: its configuration, Home Assistant and its context
 * (the card's entity), the printer and the controls chosen. A feature
 * declares, as static fields:
 * - label (its element is prusa- and the label) and pickerName (its name in
 *   Home Assistant's feature picker),
 * - controls: the ids it offers, in their default order, or
 *   controlIds(device) for ids that depend on the printer; defaults: the
 *   ones shown by default (all it offers, unless given),
 * - form: its editor's { label, helper, options },
 * - display: whether its keys follow Show.
 */
export class PrusaElement extends LitElement {
  static label = "";
  static pickerName = "";
  static controls: string[] = [];
  static defaults?: string[];
  // The option that lists the controls chosen
  static controlsKey = "controls";
  static form: { label?: string; helper?: string; options?: FeatureOption[] } = {};
  static display = false;

  static get type(): string {
    return `prusa-${this.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  }

  static getStubConfig(): Config {
    return { type: `custom:${this.type}` };
  }

  static getConfigElement(): HTMLElement {
    return document.createElement("prusa-feature-editor");
  }

  static controlIds(_device: Device): string[] {
    return this.controls;
  }

  /** The controls shown when none are chosen: the defaults, or all it offers. */
  static defaultsFor(device: Device): string[] {
    return this.defaults ?? this.controlIds(device);
  }

  /** A control the feature shows, and its entity. */
  static controlFor(id: string, device: Device): { control?: Control; entityId?: string } {
    const control = controlOf(id);
    return { control, entityId: control && device.roles[control.role] };
  }

  /** The name of a control in the editor: its entity's, or for a pair, its reading's and "and target". */
  static nameOf(id: string, device: Device, hass: HomeAssistant): string {
    const { control, entityId } = this.controlFor(id, device);
    if (!control) return id;
    if (control.kind === "pair") {
      const reading = entityName(hass, device.roles[control.parts![0]]);
      return reading ? `${reading} and target` : control.option ?? id;
    }
    return (control.picks ? control.option : entityName(hass, entityId)) ?? control.option ?? valueOf(control.name, {}) ?? id;
  }

  /**
   * The controls the feature offers for a printer, in order, for the editor:
   * those the printer has, and those the integration does not offer yet
   * (they show once it does).
   */
  static offered(device: Device, hass: HomeAssistant): { value: string; label: string }[] {
    return this.controlIds(device).flatMap((id) => {
      const { control } = this.controlFor(id, device);
      if (!control) return [];
      if (present(control, device)) return [{ value: id, label: this.nameOf(id, device, hass) }];
      return PENDING.includes(id) ? [{ value: id, label: `${control.option ?? id} (not offered yet)` }] : [];
    });
  }

  /** The controls of this feature that the integration does not offer yet, by name. */
  static pendingOf(device: Device): string[] {
    return this.controlIds(device).filter((id) => PENDING.includes(id) && !present(this.controlFor(id, device).control, device))
      .map((id) => controlOf(id)?.option ?? id);
  }

  /** Whether Home Assistant's feature picker offers the feature: it has a control, or one the integration will offer. */
  static supports(device: Device, hass: HomeAssistant): boolean {
    return this.offered(device, hass).length > 0;
  }

  /** The feature's editor form: its controls, display and options. */
  static editor(hass: HomeAssistant, entityId?: string): FeatureForm {
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

  protected _config?: Config;
  protected _hass?: HomeAssistant;
  protected _context?: FeatureContext;

  // The class's statics, from an instance
  protected get _type(): typeof PrusaElement {
    return this.constructor as typeof PrusaElement;
  }

  constructor() {
    super();
    // Keep taps on a control from reaching the cards around it (such as an expander card)
    for (const type of ["click", "touchstart", "touchend", "mousedown", "mouseup"]) {
      this.addEventListener(type, (ev) => ev.stopPropagation());
    }
  }

  setConfig(config: Config): void {
    if (!config) throw new Error("Invalid configuration");
    this._config = config;
    this.requestUpdate();
  }

  set hass(hass: HomeAssistant) {
    const before = this._hass;
    this._hass = hass;
    if (this._config && this._context && !changedFor(before, hass, this._entityId)
      && !this._watched().some((id) => before?.states[id] !== hass.states[id])) return;
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  set context(context: FeatureContext) {
    this._context = context;
    this.requestUpdate();
  }

  get context(): FeatureContext | undefined {
    return this._context;
  }

  /** Entities outside the printer's that the feature shows (see PrusaCameras). */
  protected _watched(): string[] {
    return [];
  }

  protected get _entityId(): string | undefined {
    return this._context?.entity_id;
  }

  protected get _device(): Device {
    return deviceOf(this._hass, this._entityId);
  }

  protected override shouldUpdate(_changed: PropertyValues): boolean {
    return !!(this._hass && this._config && this._context);
  }

  protected _moment(): Moment {
    const hass = this._hass!, id = this._entityId;
    return { hass, device: deviceOf(hass, id), phase: phaseNow(hass, id), config: this._config! };
  }

  /** The ids of the controls chosen, in order: the option's list, or the defaults. */
  protected _chosen(): string[] {
    const chosen = this._config![this._type.controlsKey];
    return Array.isArray(chosen) ? chosen : this._type.defaultsFor(this._device);
  }

  /**
   * Each heater's colors, by its reading's id: the history's line colors,
   * so a heater reads the same in the history and in its field. The colors
   * given in the card's Prusa history feature, or else Prusa Connect's palette;
   * a target is its reading's color, dimmed.
   */
  protected _heaterColors(): Record<string, { reading: string; target: string }> {
    const dark = darkMode(this._hass);
    const history = (cardOf(this)?.config?.features as Config[] | undefined)?.find((f) => f?.type === "custom:prusa-history");
    const given: Record<string, string | undefined> = {};
    for (const [id, color] of Object.entries((history?.colors ?? {}) as Record<string, unknown>)) {
      if (typeof color === "string" && color) given[id] = toHex(this, color);
    }
    const colors = heaterColors(heaterIds(this._device), dark, given);
    return Object.fromEntries(Object.entries(colors).map(([id, color]) => [id, { reading: color, target: dim(color, dark) }]));
  }

  /**
   * A feature with nothing to show shows nothing at all: neither itself nor
   * its place among the card's features.
   */
  protected _showNothing(empty: boolean): void {
    const display = empty ? "none" : "";
    if (this.style.display !== display) this.style.display = display;
    const host = (this.getRootNode() as ShadowRoot)?.host as HTMLElement | undefined;
    if (host?.localName === "hui-card-feature" && host.style.display !== display) host.style.display = display;
  }
}

/** Rows of keys: the chosen controls'. A feature lists its rows in _lines(). */
export class PrusaFeature extends PrusaElement {
  static override display = true;
  // Rows that wrap onto more lines, rather than leaving items out
  static wraps = false;
  static override styles: CSSResultGroup = featureStyles;

  private _fitter = new RowFitter();
  // The text color on each filled color (see textOn)
  private _onColors = new Map<string, string>();

  /** The rows: one, of the chosen controls' keys. */
  protected _lines(): Item[][] {
    const moment = this._moment();
    return [this._chosen().flatMap((id) => this._controlKey(id, moment))];
  }

  /** The items for one of the feature's controls, or none when the printer does not have it. */
  protected _controlKey(id: string, moment: Moment): Item[] {
    if (!this._type.controlIds(moment.device).includes(id)) return [];
    const { control, entityId } = this._type.controlFor(id, moment.device);
    if (!control) return [];
    if (control.pick) return this._controlKey(control.pick(moment), moment);
    if (!entityId && !["presets", "cool_down"].includes(control.kind ?? "")) return [];
    return itemsOf(this, control, entityId ?? "", moment);
  }

  // The heaters' colors, read once in each render (see _heaterColors)
  private _colors?: Record<string, { reading: string; target: string }>;

  protected override render(): TemplateResult {
    this._colors = undefined;
    const tints = HEAT_TINTS[darkMode(this._hass) ? "dark" : "light"];
    this.style.setProperty("--prusa-heating", tints.heating);
    this.style.setProperty("--prusa-cooling", tints.cooling);
    const lines = this._lines().filter((line) => line.length);
    this._showNothing(lines.length === 0);
    const wraps = (this.constructor as typeof PrusaFeature).wraps;
    return html`<span class="color-probe" hidden></span><div class="rows" role="group" aria-label=${this._type.label}>${lines.map((line) => html`
      <div class="row ${wraps ? "wraps" : ""}">${repeat(line, (b) => b.key, (b) => this._item(b))}</div>`)}</div>`;
  }

  protected override updated(): void {
    this._fitter.fit(this.renderRoot.querySelectorAll<HTMLElement>(".row"));
    // The text on filled keys, once their colors can be read
    const probe = this.renderRoot.querySelector<HTMLElement>(".color-probe");
    let changed = false;
    for (const key of this.renderRoot.querySelectorAll<HTMLElement>(".key[data-color]")) {
      const color = key.dataset.color!;
      const text = probe && textOn(probe, color);
      if (text && this._onColors.get(color) !== text) {
        this._onColors.set(color, text);
        changed = true;
      }
    }
    if (changed) this.requestUpdate();
  }

  protected _usable(entityId?: string): boolean {
    return !!this._hass && usable(this._hass, entityId);
  }

  /** An item of a row: a field, a read-out or a key. */
  protected _item(b: Item): TemplateResult {
    if (b.field) {
      return html`<prusa-field data-key=${b.key} data-min=${ITEM_MIN.field} .control=${controlOf(b.field)} .entity=${b.entity_set}
        .reading=${b.reading} .hass=${this._hass} .active=${phaseNow(this._hass, this._entityId) !== "off"}
        .colors=${b.reading ? (this._colors ??= this._heaterColors())[b.field.replace(/_and_target$/, "")] : undefined}></prusa-field>`;
    }
    const display = this._type.display ? displayOf(this._config) : "icons";
    const color = b.color ? cssColor(b.color) : ENABLED;
    const { showIcon, showText } = faceOf(b, b.readout ? "both" : display);
    const icon = b.entity
      ? html`<ha-state-icon class=${b.spin ? "spin" : ""} style=${styleMap(b.spin ? { "--spin": `${b.spin}s` } : {})}
          .hass=${this._hass} .stateObj=${this._hass!.states[b.entity]}></ha-state-icon>`
      : html`<ha-icon class=${b.spin ? "spin" : ""} style=${styleMap(b.spin ? { "--spin": `${b.spin}s` } : {})} .icon=${b.icon}></ha-icon>`;
    const text = showText ? this._text(b, showIcon) : nothing;
    const press = (ev: Event) => {
      ev.stopPropagation();
      b.action?.();
    };
    if (b.readout) {
      const classes = `field readout${b.wide ? " wide" : ""}${b.dim ? " dim" : ""}${b.heat ? ` heater ${b.heat}` : ""}${b.disabled ? " disabled" : ""}`;
      return html`<div class=${classes} tabindex="0" role="button" data-key=${b.key} data-min=${b.wide ? ITEM_MIN.wide : ITEM_MIN.readout}
        title=${b.label ?? ""} aria-label=${b.label ?? ""} style=${styleMap(b.color ? { "--c": color } : {})} .disabled=${!!b.disabled}
        @click=${press} @keydown=${(ev: KeyboardEvent) => {
          if (ev.key !== "Enter" && ev.key !== " ") return;
          ev.preventDefault();
          b.action?.();
        }}>${showIcon ? icon : nothing}${text}</div>`;
    }
    const style = styleMap({ ...(b.color ? { "--c": color } : {}), ...(this._onColors.has(color) ? { "--prusa-on-color": this._onColors.get(color)! } : {}) });
    if (b.menu) {
      // A key with a list is a label around the browser's own select (a button cannot hold one)
      return html`<label class="key${b.disabled ? " disabled" : ""}" data-key=${b.key} data-min=${ITEM_MIN.key} data-color=${color}
        title=${b.label ?? ""} aria-label=${b.label ?? ""} style=${style}>${showIcon ? icon : nothing}${text}<select ?disabled=${!!b.disabled}
        aria-label=${b.label ?? ""} @click=${(ev: Event) => ev.stopPropagation()} @change=${(ev: Event) => {
          const menu = ev.target as HTMLSelectElement;
          b.choose?.(menu.value);
          menu.value = "";
        }}><option value="">${b.text}</option>${b.menu.map((o) => html`<option value=${o.value}>${o.label}</option>`)}</select></label>`;
    }
    return html`<button type="button" class="key" data-key=${b.key} data-min=${ITEM_MIN.key} data-color=${color} title=${b.label ?? ""}
      aria-label=${b.label ?? ""} aria-pressed=${b.pressed === undefined ? nothing : String(!!b.pressed)} ?disabled=${!!b.disabled}
      style=${style} @click=${press}>${showIcon ? icon : nothing}${text}</button>`;
  }

  /** A key's text: a fan's mode beside its icon, or a heater's reading (with Off under it, and its arrow). */
  private _text(b: Item, showIcon: boolean): TemplateResult {
    const text = html`<span class=${showIcon && !b.readout && b.alwaysText ? "mod" : ""}>${b.text}</span>`;
    if (!b.heat) return text;
    const arrow = b.heat === "heating" ? "mdi:arrow-up" : b.heat === "cooling" ? "mdi:arrow-down" : undefined;
    return html`<span class="heat">${b.heat === "off" ? html`<span class="two">${text}<span class="note">Off</span></span>` : text}${arrow
      ? html`<ha-icon class="arrow" .icon=${arrow}></ha-icon>` : nothing}</span>`;
  }
}
