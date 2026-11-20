// custom:prusa-connect-card is Home Assistant's tile card, wrapped: the tile
// card still draws the name, state, actions and features, so every tile
// card option works the same way. The card adds:
// - the state's icon in its color in place of the entity's icon,
// - a status badge (the active tool, a server update) and a connection badge,
// - a progress edge along one side of the card, or around it,
// - an optional style: the printer family's frame behind the card, and the
//   door behind the title (the CORE One's), which can light up as the
//   printer's RGB status bar does,
// - an option to collapse the card to its title row, following the job,
// - every sensor of the printer as an attribute for State content.
import { html, LitElement, nothing, type TemplateResult } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { cssColor, EDITOR_TYPE, ENABLED, JOB_PHASES, PRINTER_STATES, STATUS_BAR } from "../const";
import {
  adopt, findAllDeep, findDeep, isOn, known, sameValues, sheetOf, StatesProvider, type Config, type HassEntity, type HomeAssistant,
} from "../ha";
import { changedFor, deviceOf, phaseNow, printerStateSensors, sensorAttributes } from "../printer/device";
import { glassReflections, lookOf, styleOptions, type Door, type Look } from "../printer/look";
import { FEATURE_TAGS, PrusaPrint, PrusaTemperatures, TALL_FEATURES } from "../features";
import { featurePlaces, featureRadius } from "./layout";
import {
  CHANNEL_PAD, checkConfig, DEFAULT_FEATURES_POSITION, DEFAULT_FEATURES_STYLE, defaultStatusBadges, innerTileConfig, minimal,
  PROGRESS_DEFAULTS, progressOptions,
} from "./options";
import { cardStyles, PLAIN_SHEET, STATE_SHEET } from "./styles";

// The door's edge inside the title row (px)
const WINDOW_MARGIN = 4;
const BAR_DIRECTION: Record<string, Record<string, string>> = {
  top: { clockwise: "to right", counterclockwise: "to left" },
  bottom: { clockwise: "to left", counterclockwise: "to right" },
  left: { clockwise: "to top", counterclockwise: "to bottom" },
  right: { clockwise: "to bottom", counterclockwise: "to top" },
};
const TRACK = "var(--disabled-color, rgba(127, 127, 127, .35))";
// Where the badges sit, as a share of the icon's radius (the xTool card's spacing)
const BADGE_RING = 16.7 / 20;

// Whether each printer's card is expanded in the editor's preview, while the editor is open
export const PREVIEW_OPEN = new Map<string, boolean>();

let stateSheet: CSSStyleSheet | undefined, plainSheet: CSSStyleSheet | undefined;

interface Badge {
  icon?: string;
  text?: string;
  color: string;
  label: string;
}

type Tile = HTMLElement & {
  setConfig(config: Config): void; hass?: HomeAssistant; preview?: boolean; layout?: string;
  config?: Config; updateComplete?: Promise<unknown>; getGridOptions?(): Config;
};

/** Home Assistant's states with one state object in place of the entity's, without copying the others. */
function statesWith(states: Record<string, HassEntity>, entityId: string, stateObj: HassEntity): Record<string, HassEntity> {
  return new Proxy(states, {
    get: (target, key, receiver) => (key === entityId ? stateObj : Reflect.get(target, key, receiver)),
    getOwnPropertyDescriptor: (target, key) => {
      const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
      return key === entityId && descriptor ? { ...descriptor, value: stateObj } : descriptor;
    },
  });
}

export class PrusaConnectCard extends LitElement {
  static override styles = cardStyles;

  private _config?: Config;
  private _hass?: HomeAssistant;
  private _tile?: Tile;
  private _open = false;
  // The phase last followed (see _followJob), and the phase shown
  private _phase?: string;
  private _phaseNow?: string;
  private _preview?: boolean;
  private _layoutValue?: string;
  private _tapAt?: { x: number; y: number };
  private _statesProvider = new StatesProvider(this);
  private _resize = new ResizeObserver(() => this._layout());
  // The tile card's hass: the card's entity with the state's icon and the printer's sensors (see _innerHass)
  private _inner?: HomeAssistant;
  private _innerState?: HassEntity;
  private _innerFor?: HassEntity;
  private _outerHass?: HomeAssistant;
  private _sourceState?: HassEntity;
  private _lastExtra?: Record<string, string>;
  private _doorSheet?: CSSStyleSheet;
  private _observed = new WeakSet<Node>();
  private _mutations?: MutationObserver;
  private _areasTimer?: ReturnType<typeof setTimeout>;
  private _areasKey?: string;
  private _placeTimer?: ReturnType<typeof setTimeout>;
  private _placedGroup?: Element;
  private _placedKey?: string;
  private _settling = false;
  private _settleUntil = 0;
  private _badgeRetry = false;

  static getConfigElement(): HTMLElement {
    return document.createElement(EDITOR_TYPE);
  }

  /** A new card: the first printer in Home Assistant, with Prusa print and Prusa temperatures. */
  static getStubConfig(hass: HomeAssistant): Config {
    const entity = printerStateSensors(hass)[0];
    if (!entity) return { entity: "" };
    const device = deviceOf(hass, entity);
    const features = [PrusaPrint, PrusaTemperatures].filter((f) => f.supports(device, hass)).map((f) => ({ type: `custom:${f.type}` }));
    return minimal({ entity, ...(features.length ? { features } : {}) }, hass);
  }

  /** The card's configuration, as given. */
  get config(): Config | undefined {
    return this._config;
  }

  setConfig(config: Config): void {
    checkConfig(config);
    this._config = config;
    this._open = config.collapsible === false ? true
      : this._preview ? PREVIEW_OPEN.get(config.entity) ?? true : this._storedOpen() ?? config.expanded_at_load === true;
    this._phase = undefined;
    const tile = innerTileConfig(config, this._open);
    if (this._tile) {
      this._tile.setConfig(tile);
    } else if (customElements.get("hui-tile-card")) {
      this._createTile(tile);
    } else {
      // The tile card is loaded on demand; the card helpers load it
      window.loadCardHelpers?.().then(async (helpers) => {
        helpers.createCardElement({ type: "tile", entity: tile.entity });
        await customElements.whenDefined("hui-tile-card");
        if (!this._tile && this._config) this._createTile(innerTileConfig(this._config, this._open));
      });
    }
    const hass = this._hass;
    this._hass = undefined;
    if (hass) this.hass = hass;
    this.requestUpdate();
  }

  private _createTile(config: Config): void {
    const tile = document.createElement("hui-tile-card") as Tile;
    tile.classList.add("tile");
    tile.setConfig(config);
    if (this._preview !== undefined) tile.preview = this._preview;
    if (this._layoutValue !== undefined) tile.layout = this._layoutValue;
    this._tile = tile;
    if (this._hass) this._setTileHass(this._hass);
    this.requestUpdate();
  }

  private _setTileHass(hass: HomeAssistant): void {
    const inner = this._innerHass(hass);
    this._statesProvider.states = inner.states;
    this._tile!.hass = inner;
    this._styleState();
  }

  set hass(hass: HomeAssistant) {
    const before = this._hass;
    this._hass = hass;
    if (!this._config) return;
    if (this._tile && !changedFor(before, hass, this._config.entity)) return;
    const phase = phaseNow(hass, this._config.entity);
    this._followJob(phase);
    this._phaseNow = phase;
    if (this._tile) this._setTileHass(hass);
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  // In the editor's preview and while the dashboard is edited, the card
  // starts expanded and changes only when tapped (see PREVIEW_OPEN)
  set preview(value: boolean) {
    const was = this._preview;
    this._preview = value;
    if (this._tile) this._tile.preview = value;
    if (!this._config || this._config.collapsible === false || !value === !was) return;
    this._setOpen(value ? PREVIEW_OPEN.get(this._config.entity) ?? true : this._storedOpen() ?? this._config.expanded_at_load === true, false);
  }

  get preview(): boolean {
    return !!this._preview;
  }

  set layout(value: string) {
    this._layoutValue = value;
    if (this._tile) this._tile.layout = value;
  }

  get layout(): string | undefined {
    return this._layoutValue;
  }

  getCardSize(): number {
    const features: Config[] = this._config?.features ?? [];
    const rows = features.reduce((sum, f) => sum + (TALL_FEATURES[f?.type] !== undefined ? 5 : 1), 0);
    return 1 + (this._open === false ? 0 : rows);
  }

  /** The tile card's columns, and a height that follows the content (rows: auto). */
  getGridOptions(): Config {
    const options: Config = { ...(this._tile?.getGridOptions?.() ?? { columns: 6 }), rows: "auto" };
    delete options.min_rows;
    return options;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._resize.observe(this);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resize.disconnect();
  }

  // Whether the features are shown is remembered in this browser, per printer
  private get _storageKey(): string {
    return `prusa-connect-card:${this._config?.entity}`;
  }

  private _storedOpen(): boolean | undefined {
    try {
      const v = window.localStorage.getItem(this._storageKey);
      return v === null ? undefined : v === "1";
    } catch {
      return undefined;
    }
  }

  /**
   * A collapsible card follows the print job, each option on its own: it
   * expands when the printer starts printing (expand_when_job_starts), and
   * collapses when the print finishes or is stopped (collapse_when_job_ends).
   * Only a change of state does either; the card loads as it was left.
   */
  private _followJob(phase: string): void {
    const was = this._phase;
    this._phase = phase;
    const c = this._config!;
    if (was === undefined || was === phase || c.collapsible === false || this._preview) return;
    const started = phase === "printing" && !JOB_PHASES.includes(was);
    const ended = ["finished", "stopped"].includes(phase) && JOB_PHASES.includes(was);
    if (started && c.expand_when_job_starts !== false && !this._open) this._setOpen(true, false);
    else if (ended && c.collapse_when_job_ends !== false && this._open) this._setOpen(false, false);
  }

  private _setOpen(open: boolean, remember = true): void {
    this._open = open;
    const c = this._config!;
    if (this._preview) PREVIEW_OPEN.set(c.entity, open);
    try {
      if (remember && !this._preview) window.localStorage.setItem(this._storageKey, open ? "1" : "0");
    } catch {
      // Storage can be unavailable (private windows); the card still works
    }
    this._tile?.setConfig(innerTileConfig(c, open));
    this._areasKey = undefined;
    this.requestUpdate();
  }

  /** True when a point is in one of the tile card's feature areas. */
  private _amongFeatures({ x, y }: { x: number; y: number }): boolean {
    return [...(this._tile?.shadowRoot?.querySelectorAll("hui-card-features") ?? [])].some((features) => {
      const box = features.getBoundingClientRect();
      return box.width > 0 && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    });
  }

  // A tap on the card shows or hides the features (see innerTileConfig), except a tap between the features
  private _pointerDown = {
    handleEvent: (ev: PointerEvent) => {
      this._tapAt = { x: ev.clientX, y: ev.clientY };
    },
    capture: true,
  };

  private _toggle = (ev: CustomEvent) => {
    if (ev.detail?.prusa_connect_card !== "toggle") return;
    ev.stopPropagation();
    const at = this._tapAt;
    this._tapAt = undefined;
    if (this._open && at && this._amongFeatures(at)) return;
    this._setOpen(!this._open);
  };

  /**
   * The Home Assistant object the tile card sees: the same, except that the
   * card's entity has the state's icon and the printer's sensors as
   * attributes. The changed state object is reused until any of them changes.
   */
  private _innerHass(hass: HomeAssistant): HomeAssistant {
    const entity: string = this._config!.entity;
    const stateObj = hass.states[entity];
    if (!stateObj) return hass;
    const extra = { ...sensorAttributes(hass, entity), icon: PRINTER_STATES[phaseNow(hass, entity)].icon };
    if (this._sourceState !== stateObj || !sameValues(this._lastExtra, extra)) {
      this._sourceState = stateObj;
      this._lastExtra = extra;
      this._innerState = { ...stateObj, attributes: { ...stateObj.attributes, ...extra } };
    }
    if (this._outerHass === hass && this._innerFor === this._innerState && this._inner) return this._inner;
    this._outerHass = hass;
    this._innerFor = this._innerState;
    this._inner = { ...hass, states: statesWith(hass.states, entity, this._innerState!) };
    return this._inner;
  }

  /** The state's icon in its color, moving as the state does (see STATE_SHEET); a color chosen in the tile options wins. */
  private _styleState(): void {
    const tile = this._tile;
    if (!tile || !this._config) return;
    const phase = this._phaseNow ?? "off";
    const own = this._config.color && this._config.color !== "state";
    tile.setAttribute("prusa-phase", phase);
    tile.toggleAttribute("prusa-state-color", !own);
    tile.style.setProperty("--prusa-state-color", PRINTER_STATES[phase].color);
    const root = tile.shadowRoot;
    if (root && !adopt(root, (stateSheet ??= sheetOf(STATE_SHEET)))) console.warn("Prusa Connect card: could not color the state's icon");
  }

  /** What the status badge shows, or undefined: the first of the chosen statuses that applies. */
  private _statusBadge(): Badge | undefined {
    const hass = this._hass!, c = this._config!;
    const chosen: string[] = Array.isArray(c.status_badge) ? c.status_badge : defaultStatusBadges(hass, c.entity);
    const device = deviceOf(hass, c.entity);
    const active = device.tools.length > 1 && JOB_PHASES.includes(this._phaseNow ?? "")
      ? device.tools.find((n) => isOn(hass.states[device.roles[`tool_${n}_active`]])) : undefined;
    const server = hass.states[device.roles.server];
    const options: Record<string, Badge | undefined> = {
      active_tool: active !== undefined ? { text: String(active), color: ENABLED, label: `Active tool: ${active}` } : undefined,
      server_update: server?.state === "on" ? { icon: "mdi:arrow-up-bold", color: ENABLED, label: "Prusa Connect update available" } : undefined,
    };
    return chosen.map((option) => options[option]).find(Boolean);
  }

  /**
   * What the connection badge shows: Unavailable while the State sensor is,
   * disconnected while Prusa Connect does not reach the printer, otherwise
   * connected, in the enabled color.
   */
  private _connectionBadge(): Badge | undefined {
    const hass = this._hass!, c = this._config!;
    const device = deviceOf(hass, c.entity);
    const state = hass.states[device.roles.state];
    if (!state || state.state === "unavailable") return { icon: "mdi:close-thick", color: "#616161", label: "Unavailable" };
    if (c.connection_badge === false) return undefined;
    const connected = hass.states[device.roles.connected];
    if (!known(connected)) return undefined;
    return isOn(connected)
      ? { icon: "mdi:link-variant", color: ENABLED, label: "Connected to Prusa Connect" }
      : { icon: "mdi:link-variant-off", color: "#616161", label: "Printer disconnected from Prusa Connect" };
  }

  private _badge(kind: string, badge?: Badge): TemplateResult {
    return html`<span class="badge ${kind} ${badge ? "on" : ""}" role="img" title=${badge?.label ?? ""} aria-label=${badge?.label ?? nothing}
      style=${styleMap({ background: badge?.color })}><ha-state-icon aria-hidden="true" ?hidden=${!badge?.icon} .icon=${badge?.icon}
      .hass=${this._hass}></ha-state-icon><span class="text">${badge?.text ?? ""}</span></span>`;
  }

  /** The progress edge, as configured, for the printer's state: its classes, its place and fill, and the percentage. */
  private _edge(): { classes: string; style: Record<string, string>; sweep?: string; pct?: string; pctColor?: string } {
    const p = progressOptions(this._config);
    const phase = this._phaseNow;
    const showWhile: string[] = Array.isArray(p.show_while) ? p.show_while : PROGRESS_DEFAULTS.show_while;
    if (!phase || !this._hass || p.edge === "none" || !showWhile.includes(phase)) return { classes: "", style: {} };
    const raw = Number(this._hass.states[deviceOf(this._hass, this._config!.entity).roles.progress]?.state);
    const value = phase === "finished" ? 1 : Number.isFinite(raw) ? Math.max(0, Math.min(1, raw / 100)) : undefined;
    const determinate = value !== undefined;
    const color = this._edgeColor(p.color, phase, value);
    const thickness = Math.max(1, Math.min(24, Number(p.thickness) || PROGRESS_DEFAULTS.thickness));
    const clamp = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(100, Number(v))) : d);
    let start = clamp(p.starts_at, 0), end = clamp(p.ends_at, 100);
    if (start > end) [start, end] = [end, start];
    const counter = p.direction === "counterclockwise";
    const classes = ["on", determinate ? "" : "indeterminate"];
    let style: Record<string, string>;
    let sweep: string | undefined;
    if (p.edge === "around") {
      classes.push("around");
      const deg = Math.round((value ?? 0) * 36000) / 100;
      style = {
        padding: `${thickness}px`,
        background: !determinate ? color : counter
          ? `conic-gradient(from 0deg, ${TRACK} 0deg ${360 - deg}deg, ${color} ${360 - deg}deg 360deg)`
          : `conic-gradient(from 0deg, ${color} 0deg ${deg}deg, ${TRACK} ${deg}deg 360deg)`,
      };
    } else {
      const horizontal = p.edge === "top" || p.edge === "bottom";
      classes.push(horizontal ? "horizontal" : "vertical");
      const size = `${thickness}px`;
      const place: Record<string, Record<string, string>> = {
        top: { top: "0", left: "0", right: "0", height: size },
        bottom: { bottom: "0", left: "0", right: "0", height: size },
        left: { top: "0", bottom: "0", left: "0", width: size },
        right: { top: "0", bottom: "0", right: "0", width: size },
      };
      const direction = BAR_DIRECTION[p.edge][counter ? "counterclockwise" : "clockwise"];
      const stop = Math.round((start + (end - start) * (value ?? 0)) * 100) / 100;
      style = {
        ...place[p.edge],
        background: determinate
          ? `linear-gradient(${direction}, ${TRACK} 0%, ${TRACK} ${start}%, ${color} ${start}%, ${color} ${stop}%, ${TRACK} ${stop}%, ${TRACK} 100%)`
          : TRACK,
        transition: "background 3s linear",
      };
      sweep = color;
    }
    const pct = p.show_percentage && determinate ? `${Math.round(value! * 100)}%` : undefined;
    return { classes: classes.filter(Boolean).join(" "), style, sweep, pct, pctColor: color };
  }

  private _edgeColor(spec: string, phase: string, value?: number): string {
    if (spec === "thresholds" && value !== undefined) {
      if (value > 0.6) return "var(--success-color, #43a047)";
      if (value > 0.2) return "var(--warning-color, #ffa600)";
      return "var(--error-color, #db4437)";
    }
    if (!spec || spec === "state" || spec === "thresholds") return PRINTER_STATES[phase].color;
    return cssColor(spec);
  }

  /** The style's look now (see lookOf), or undefined for none. */
  private get _look(): Look | undefined {
    return this._config && this._hass ? lookOf(styleOptions(this._config, this._hass), this._hass) : undefined;
  }

  protected override render(): TemplateResult | typeof nothing {
    const c = this._config;
    if (!c) return nothing;
    const look = this._look;
    const door = look?.door;
    const style = styleOptions(c, this._hass);
    const bar = door && style.status_bar && this._phaseNow ? STATUS_BAR[this._phaseNow] : undefined;
    const edge = this._edge();
    const ready = !!this._hass;
    const frame: Record<string, string | undefined> = {
      "--prusa-body": look?.body, "--prusa-glass": door?.glass, "--prusa-edge": door?.edge,
      // A number field is a pane of the door's glass (see the features' styles)
      "--prusa-field": door && "var(--prusa-glass)", "--prusa-field-opacity": door && "1",
      "--prusa-field-text": door?.ink, "--prusa-field-edge": door && "var(--prusa-edge)",
    };
    return html`<div class="frame ${look ? "styled" : ""} ${door ? "glazed" : ""}" style=${styleMap(frame)}
      @pointerdown=${this._pointerDown} @ll-custom=${this._toggle}>
      <div class="clip under"><div id="body"></div><div id="door" data-bar=${bar?.[1] ?? nothing}
        style=${styleMap({ "--prusa-gloss": door ? glassReflections(door.glare, style.reflections) : "none", "--prusa-bar": bar?.[0] })}></div
      ><div id="areas"></div></div>
      ${this._tile ?? nothing}
      <div class="clip over"><div id="edge" class=${edge.classes} style=${styleMap(edge.style)}><div class="sweep"
        style=${styleMap({ background: edge.sweep })}></div></div><span id="pct" class=${edge.pct ? "on" : ""}
        style=${styleMap({ color: edge.pct ? edge.pctColor : undefined })}>${edge.pct ?? ""}</span></div>
      ${this._badge("status", ready ? this._statusBadge() : undefined)}
      ${this._badge("connection", ready ? this._connectionBadge() : undefined)}
    </div>`;
  }

  protected override updated(): void {
    const enabled = this._config?.enabled_color;
    if (enabled) this.style.setProperty("--prusa-enabled-color", cssColor(enabled));
    else this.style.removeProperty("--prusa-enabled-color");
    this._styleState();
    this._layout();
  }

  private get _frame(): HTMLElement | null {
    return this.renderRoot.querySelector(".frame");
  }

  private _layout(): void {
    if (!this._config || !this._frame) return;
    const door = this._look?.door;
    if (this._tile) {
      const look = this._look;
      this._tile.classList.toggle("dark", look?.tone === "dark");
      this._tile.classList.toggle("light", look?.tone === "light");
      this._tile.classList.toggle("solid", !!look && (this._config.features_style ?? DEFAULT_FEATURES_STYLE) !== "match");
      this._tile.style.setProperty("--prusa-channel-pad", `${CHANNEL_PAD[this._featuresStyle()]}px`);
      this._tile.style.setProperty("--prusa-window-margin", `${door ? WINDOW_MARGIN : 0}px`);
      this._styleDoorText(door);
    }
    this._arrange();
  }

  /** Everything placed by measuring the tile card: features, corners, door, areas and badges. */
  private _arrange(): void {
    this._removeDividers();
    this._placeFeatures();
    this._clampCorners();
    this._drawDoor();
    this._drawAreas();
    this._placeBadges();
  }

  /**
   * Place the features below the title in the tile card's feature grid
   * (see featurePlaces), only when the card's options call for it.
   */
  private _placeFeatures(): void {
    const group = findAllDeep(this._tile?.shadowRoot, 'hui-card-features[slot="features"]')[0] as HTMLElement | undefined;
    const all = [...(group?.shadowRoot?.querySelectorAll<HTMLElement & { feature?: Config }>("hui-card-feature") ?? [])];
    // A feature that shows nothing (none of its controls are offered) takes no place
    const items = all.filter((item) => item.style.display !== "none");
    const c = this._config!;
    const inline = (c.features_position ?? DEFAULT_FEATURES_POSITION) === "inline";
    const lastWide = c.last_feature_full_width !== false;
    const tall = (item: { feature?: Config }) => TALL_FEATURES[item.feature?.type] !== undefined;
    const placed = inline && items.length > 0 && (!lastWide || items.some(tall));
    const gap = placed && group ? parseFloat(getComputedStyle(group).rowGap) || 0 : 0;
    const { places, rows } = placed
      ? featurePlaces(items.map((item) => ({
        tall: tall(item), full: tall(item) && (item.feature!.full_width ?? TALL_FEATURES[item.feature!.type]) !== false, height: item.offsetHeight,
      })), gap, lastWide)
      : { places: [], rows: [] };
    const key = JSON.stringify([places, rows, all.map((item) => items.includes(item))]);
    if (group === this._placedGroup && key === this._placedKey) return;
    clearTimeout(this._placeTimer);
    this._placeTimer = setTimeout(() => {
      this._placedGroup = group;
      this._placedKey = key;
      if (!group) return;
      group.style.gridTemplateColumns = places.some((p) => p.columns === 2) && group.getAttribute("columns") !== "2" ? "repeat(2, minmax(0, 1fr))" : "";
      group.style.gridTemplateRows = rows.includes("1fr") ? rows.join(" ") : "";
      all.forEach((item) => {
        const place = places[items.indexOf(item)];
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
   * style's channel, as the xTool card has it.
   */
  private _styleDoorText(door?: Door): void {
    const root = this._tile?.shadowRoot;
    if (!root) return;
    this._doorSheet ??= new CSSStyleSheet();
    this._doorSheet.replaceSync(`
      hui-card-features[slot="features"] {
        margin-top: calc(var(--ha-card-feature-gap, 12px) - var(--prusa-window-margin, 0px) - var(--prusa-channel-pad, 0px));
      }
      ${door ? `ha-tile-info { ${door.text}; }` : ""}`);
    if (!adopt(root, this._doorSheet)) console.warn("Prusa Connect card: could not style the title on the door");
  }

  /** A box in the card's own pixels (the card can be scaled in the editor). */
  private _box(el: Element): { x: number; y: number; w: number; h: number } | null {
    const frame = this._frame!;
    const origin = frame.getBoundingClientRect();
    const scale = origin.width / frame.offsetWidth || 1;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    return { x: (r.left - origin.left) / scale, y: (r.top - origin.top) / scale, w: r.width / scale, h: r.height / scale };
  }

  /** The tile card's title row: its height (one row) and the middle of its icon, in the card's own pixels. */
  private _titleRow(): { height: number; middle: number } | null {
    const root = this._tile?.shadowRoot;
    const content = root && findDeep(root, "ha-tile-container")?.shadowRoot?.querySelector(".content");
    const icon = root && findDeep(root, "ha-tile-icon");
    const box = icon && this._box(icon);
    const height = content ? parseFloat(getComputedStyle(content).minHeight) : NaN;
    if (!box || !Number.isFinite(height) || !height) return null;
    return { height, middle: box.y + box.h / 2 };
  }

  /** The door covers the title row (and any feature beside it), 4 px inside its edges. */
  private _drawDoor(): void {
    const frame = this._frame!, door = this.renderRoot.querySelector<HTMLElement>("#door");
    if (!this._look?.door || !door) return;
    const W = frame.offsetWidth, H = frame.offsetHeight;
    if (!W || !H) return;
    let top = WINDOW_MARGIN, bottom = H - WINDOW_MARGIN;
    const row = this._titleRow();
    if (row) {
      top = Math.max(WINDOW_MARGIN, row.middle - row.height / 2 + WINDOW_MARGIN);
      bottom = Math.min(H - WINDOW_MARGIN, row.middle + row.height / 2 - WINDOW_MARGIN);
    }
    Object.assign(door.style, { left: `${WINDOW_MARGIN}px`, top: `${top}px`, width: `${W - 2 * WINDOW_MARGIN}px`, height: `${Math.max(0, bottom - top)}px` });
  }

  /** The card's corners: the theme's, but never rounder than half the title row. */
  private _clampCorners(): void {
    const frame = this._frame!;
    const row = this._titleRow();
    frame.style.removeProperty("--ha-card-border-radius");
    if (!row) return;
    const themed = parseFloat(getComputedStyle(frame).borderTopLeftRadius);
    if (Number.isFinite(themed) && themed > row.height / 2) frame.style.setProperty("--ha-card-border-radius", `${row.height / 2}px`);
  }

  /**
   * The areas the feature controls take, in the card's own pixels: each
   * key, field, slider and picture of this card's features on its own, so
   * the frame shows between them.
   */
  private _featureAreas(): { x: number; y: number; w: number; h: number; radius: number }[] {
    const root = this._tile?.shadowRoot;
    if (!root) return [];
    const areas: { x: number; y: number; w: number; h: number; radius: number }[] = [];
    for (const wrap of findAllDeep(root, "hui-card-feature")) {
      if (FEATURE_TAGS.includes((wrap.getRootNode() as ShadowRoot)?.host?.localName ?? "")) continue;
      this._watchAdded(wrap.shadowRoot);
      const inner: ParentNode = wrap.shadowRoot ?? wrap;
      const ours = findDeep(inner, FEATURE_TAGS.join(", "));
      this._watchAdded(ours?.shadowRoot);
      const keys = ours ? [...(ours.shadowRoot?.querySelectorAll(".key, .shot, .slide:not([hidden]), .field, ha-tile-icon, .graph") ?? [])]
        .filter((el) => !el.closest("[data-dropped]")) : [];
      const element = [...inner.children].find((child) => child.tagName !== "STYLE");
      for (const key of keys.length ? keys : element ? [element] : []) {
        const b = this._box(key);
        if (b) areas.push({ ...b, radius: key.localName === "ha-tile-icon" ? b.h / 2 : featureRadius(key, b.h) });
      }
    }
    this._watchAdded(root);
    return areas;
  }

  /** No divider before a feature in a second column; the feature beside the title keeps a steady height. */
  private _removeDividers(): void {
    const root = this._tile?.shadowRoot;
    if (!root) return;
    for (const group of findAllDeep(root, "hui-card-features")) {
      if (group.shadowRoot && !adopt(group.shadowRoot, (plainSheet ??= sheetOf(PLAIN_SHEET)))) {
        console.warn("Prusa Connect card: could not remove the feature dividers");
        return;
      }
    }
  }

  // Console: this card's buttons become keys
  private _styleControls(keys: boolean): void {
    for (const el of findAllDeep(this._tile?.shadowRoot, FEATURE_TAGS.join(", "))) el.toggleAttribute("prusa-console", keys);
  }

  // Draw again when elements are added in the tile card (features render late)
  private _watchAdded(root?: Node | null): void {
    if (!root || this._observed.has(root)) return;
    this._observed.add(root);
    this._mutations ??= new MutationObserver(() => {
      clearTimeout(this._areasTimer);
      this._areasTimer = setTimeout(() => this._layout(), 0);
    });
    this._mutations.observe(root, { childList: true, subtree: true });
  }

  /** The features style drawn: Match without a style. */
  private _featuresStyle(): string {
    return this._look ? this._config!.features_style ?? DEFAULT_FEATURES_STYLE : "match";
  }

  private _drawAreas(): void {
    const style = this._featuresStyle();
    const box = this.renderRoot.querySelector<HTMLElement>("#areas");
    if (!box) return;
    this._styleControls(style === "console");
    if (style === "match") {
      box.replaceChildren();
      this._areasKey = undefined;
    } else {
      const pad = CHANNEL_PAD[style];
      const areas = this._featureAreas().map((b) => ({
        x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad, radius: Math.min(b.radius + pad, (b.h + 2 * pad) / 2),
      }));
      const key = style + JSON.stringify(areas.map((a) => [a.x, a.y, a.w, a.h, a.radius].map(Math.round)));
      if (key !== this._areasKey) {
        this._areasKey = key;
        box.style.setProperty("--flat", this._look?.flat ?? "transparent");
        box.replaceChildren(...areas.map((a) => {
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
      this._arrange();
      setTimeout(check, 100);
    };
    setTimeout(check, 100);
  }

  // The badges sit on a circle at BADGE_RING of the icon's radius: the
  // status badge up and to the right, the connection badge down and to the right
  private _placeBadges(): void {
    const badges = [...this.renderRoot.querySelectorAll<HTMLElement>(".badge.on")];
    if (!badges.length) return;
    const icon = this._tile?.shadowRoot?.querySelector("ha-tile-icon");
    if (!icon) {
      if (this._tile && !this._badgeRetry) {
        this._badgeRetry = true;
        Promise.resolve(this._tile.updateComplete).then(() => {
          this._badgeRetry = false;
          if (this._tile?.shadowRoot?.querySelector("ha-tile-icon")) this._placeBadges();
        });
      }
      return;
    }
    const frame = this._frame!;
    const outer = frame.getBoundingClientRect(), box = icon.getBoundingClientRect();
    if (!box.width) return;
    const scale = outer.width / frame.offsetWidth || 1;
    const r = box.width / 2 / scale;
    const cx = (box.left - outer.left) / scale + r, cy = (box.top - outer.top) / scale + r;
    const ring = r * BADGE_RING * 0.7071;
    for (const badge of badges) {
      badge.style.left = `${cx + ring}px`;
      badge.style.top = `${badge.classList.contains("status") ? cy - ring : cy + ring}px`;
    }
  }
}
