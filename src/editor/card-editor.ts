// The card's editor: the printer (a device of the integration), the tile
// card's own editor without the options the card decides, and the card's
// own options under Prusa.
import { css, html, LitElement, type TemplateResult } from "lit";
import { DOMAIN, ENABLED_COLOR, STATE_COLORS, TILE_EDITOR_TYPE } from "../const";
import { fire, select, StatesProvider, type Config, type HomeAssistant } from "../ha";
import { PREVIEW_OPEN } from "../card/card";
import {
  DEFAULT_FEATURES_POSITION, DEFAULT_FEATURES_STYLE, defaultStatusBadges, DIRECTIONS, EDGES, FEATURES_STYLES, minimal, OWN_KEYS,
  PROGRESS_DEFAULTS, progressOptions, SHOW_WHILE, statusBadgesOf, tileConfig,
} from "../card/options";
import { printerState, sensorAttributes } from "../printer/device";
import { FAMILY_OPTIONS } from "../printer/families";
import { lookOf, styleOptions } from "../printer/look";

// Tile card options this card sets itself, so they are left out of its editor:
// the printer is chosen above it (as a device), and the icon is the state's
const HIDDEN_TILE_OPTIONS = ["entity", "icon", "show_entity_picture"];

function hideOptions(schema: Config[]): Config[] {
  return schema
    .filter((item) => !HIDDEN_TILE_OPTIONS.includes(item.name))
    .map((item) => (Array.isArray(item.schema) ? { ...item, schema: hideOptions(item.schema) } : item));
}

/**
 * The tile card's editor, with the options above left out. It is the tile
 * card's own editor class, so it keeps every future change to it.
 */
function tileEditorType(): string | null {
  if (customElements.get(TILE_EDITOR_TYPE)) return TILE_EDITOR_TYPE;
  const Base = customElements.get("hui-tile-card-editor") as (new () => HTMLElement & { _schema?: unknown }) | undefined;
  if (!Base) return null;
  customElements.define(TILE_EDITOR_TYPE, class extends Base {
    constructor() {
      super();
      const original = this._schema;
      if (typeof original !== "function") return;
      let lastIn: unknown, lastOut: unknown;
      this._schema = (...args: unknown[]) => {
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

/** hass with the card's entity carrying the printer's sensors as attributes, so State content can offer every one. */
function withSensorAttributes(hass: HomeAssistant, entityId?: string): HomeAssistant {
  const stateObj = entityId ? hass.states[entityId] : undefined;
  if (!stateObj) return hass;
  const attributes = { ...sensorAttributes(hass, entityId!, true), ...stateObj.attributes };
  return { ...hass, states: { ...hass.states, [entityId!]: { ...stateObj, attributes } } };
}

type TileEditor = HTMLElement & { hass?: HomeAssistant; lovelace?: unknown; setConfig(config: Config): void };
type TileCard = { getConfigElement(): Promise<TileEditor> };

const label = (s: Config) => s.label ?? s.title ?? s.name;
const helper = (s: Config) => s.helper;

export class PrusaConnectCardEditor extends LitElement {
  static override styles = css`
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
  `;

  private _hass?: HomeAssistant;
  private _config?: Config;
  private _lovelace?: unknown;
  private _tileEditor?: TileEditor;
  private _loading?: Promise<void>;
  private _statesProvider = new StatesProvider(this);

  constructor() {
    super();
    // A new editor: its preview starts expanded
    PREVIEW_OPEN.clear();
  }

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    this._setTileEditorHass();
    this.requestUpdate();
  }

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  set lovelace(lovelace: unknown) {
    this._lovelace = lovelace;
    if (this._tileEditor) this._tileEditor.lovelace = lovelace;
  }

  get lovelace(): unknown {
    return this._lovelace;
  }

  setConfig(config: Config): void {
    this._config = minimal(config, this._hass);
    this._setTileEditorHass();
    this._setTileEditorConfig();
    this.requestUpdate();
    if (JSON.stringify(this._config) !== JSON.stringify(config)) this._fire();
  }

  /** The tile editor gets Home Assistant's own hass; the states context, which its State content picker reads, carries the card's attributes. */
  private _setTileEditorHass(): void {
    if (!this._hass) return;
    this._statesProvider.states = withSensorAttributes(this._hass, this._config?.entity).states;
    if (this._tileEditor) this._tileEditor.hass = this._hass;
  }

  private async _setTileEditorConfig(): Promise<void> {
    this._loading ??= this._loadTileEditor();
    await this._loading;
    if (this._config) this._tileEditor?.setConfig(tileConfig(this._config));
  }

  private async _loadTileEditor(): Promise<void> {
    const helpers = await window.loadCardHelpers!();
    helpers.createCardElement({ type: "tile", entity: this._config?.entity });
    await customElements.whenDefined("hui-tile-card");
    const original = await (customElements.get("hui-tile-card") as unknown as TileCard).getConfigElement();
    const type = tileEditorType();
    const editor = type ? document.createElement(type) as TileEditor : original;
    editor.id = "tile";
    editor.addEventListener("config-changed", (ev) => {
      // The tile card's options changed: keep ours and pass the whole card on
      ev.stopPropagation();
      const c = this._config!;
      const own = Object.fromEntries(OWN_KEYS.filter((k) => k in c).map((k) => [k, c[k]]));
      const next: Config = { ...(ev as CustomEvent).detail.config, ...own, type: c.type };
      delete next.show_entity_picture;
      this._config = minimal(next, this._hass);
      this._fire();
      this.requestUpdate();
      editor.setConfig(tileConfig(this._config));
    });
    if (this._lovelace) editor.lovelace = this._lovelace;
    this._tileEditor = editor;
    this._setTileEditorHass();
    this.requestUpdate();
  }

  protected override render(): TemplateResult {
    const c = this._config;
    const hass = this._hass;
    const style = c ? styleOptions(c, hass) : undefined;
    const look = c && style && hass ? lookOf(style, hass) : undefined;
    return html`
      <ha-form id="printer" .hass=${hass} .schema=${c ? this._printerSchema() : []} .data=${{ device: c && hass?.entities?.[c.entity]?.device_id }}
        .computeLabel=${label} @value-changed=${this._printerChanged}></ha-form>
      ${this._tileEditor ?? html`<div id="tile"></div>`}
      <ha-expansion-panel outlined expanded>
        <div slot="header" role="heading" aria-level="3">Prusa</div>
        <div class="content">
          <ha-form id="style" .hass=${hass} .schema=${style ? this._styleSchema(style.family, !!look?.door) : []}
            .data=${style ? { family: style.family, frame: style.frame ?? "", door: style.door ?? "", status_bar: style.status_bar } : {}}
            .computeLabel=${label} .computeHelper=${helper} @value-changed=${this._styleChanged}></ha-form>
          <div class="row" id="row" style=${look?.door ? "" : "display: none"}><ha-button id="randomize" @click=${this._randomize}>Randomize reflections</ha-button></div>
          <ha-form id="form" .hass=${hass} .schema=${c ? this._schema(c, !!look) : []} .data=${c ? this._data(c) : {}}
            .computeLabel=${label} .computeHelper=${helper} @value-changed=${this._changed}></ha-form>
        </div>
      </ha-expansion-panel>`;
  }

  private _printerSchema(): Config[] {
    return [{
      name: "device", label: "Printer", required: true,
      selector: { device: { integration: DOMAIN, entity: [{ integration: DOMAIN, domain: "sensor", device_class: "enum" }] } },
    }];
  }

  private _styleSchema(family: string, door: boolean): Config[] {
    return [
      {
        name: "family", label: "Style",
        helper: "Defaults to your printer's family. None follows your theme. Custom uses the frame and door colors below.",
        selector: select(FAMILY_OPTIONS),
      },
      ...(family !== "none" ? [{
        type: "grid", name: "", schema: [
          { name: "frame", label: "Frame color", helper: "Such as #434242. Empty: the family's own.", selector: { text: {} } },
          { name: "door", label: "Door color", helper: "Such as #141619. Adds a door to any family. Empty: the family's own (only the CORE Family has one).", selector: { text: {} } },
        ],
      }] : []),
      ...(door ? [{
        name: "status_bar", label: "RGB status bar",
        helper: "The door lights up as the printer's RGB status bar does: blue while printing, green when finished, yellow pulsing when paused or needing attention, red pulsing on an error, and dark otherwise.",
        selector: { boolean: {} },
      }] : []),
    ];
  }

  private _schema(c: Config, styled: boolean): Config[] {
    return [
      ...(styled ? [{
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
        selector: { select: { multiple: true, reorder: true, mode: "dropdown", options: statusBadgesOf(this._hass, c.entity).map(([value, text]) => ({ value, label: text })) } },
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
            selector: { select: { multiple: true, mode: "list", options: SHOW_WHILE.map(([value, text]) => ({ value, label: text })) } },
          },
        ],
      },
    ];
  }

  private _data(c: Config): Config {
    return {
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

  private _printerChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    const state = printerState(this._hass, ev.detail.value?.device);
    if (state && state !== this._config?.entity) this._update({ entity: state });
  }

  private _styleChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    this._update({ style: { ...(this._config?.style ?? {}), ...ev.detail.value } });
  }

  private _randomize(): void {
    this._update({ style: { ...(this._config?.style ?? {}), reflections: 1 + Math.floor(Math.random() * 99999) } });
  }

  private _changed(ev: CustomEvent): void {
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
  }

  private _update(changes: Config): void {
    this._config = minimal({ ...this._config, ...changes }, this._hass);
    this.requestUpdate();
    if ("entity" in changes) {
      this._setTileEditorHass();
      this._setTileEditorConfig();
    }
    this._fire();
  }

  private _fire(): void {
    fire(this, "config-changed", { config: this._config });
  }
}

