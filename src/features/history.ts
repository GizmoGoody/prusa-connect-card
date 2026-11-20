// Prusa history: Home Assistant's own history graph card of the heaters'
// readings and targets, with its options (hours_to_show, logarithmic_scale,
// expand_legend, min_y_axis, max_y_axis, fit_y_data) in the same editor
// fields as its own editor, each heater in its color (Prusa Connect's
// palette, or the one given under Colors) and its target the same color
// dimmed, each line named short in the legend. Timespan: a field under the
// graph that shows the hours shown in minutes; tap to type, or press and
// slide, to change them while the page is open.
import { css, html, nothing, type TemplateResult } from "lit";
import type { Config, HassEntity, HomeAssistant } from "../ha";
import { heaterIds, targetOf, type Control } from "../printer/controls";
import { deviceOf, type Device } from "../printer/device";
import { historyName } from "../printer/history";
import { PrusaElement, type FeatureForm } from "./base";
import { ITEM_MIN } from "./rows";
import { featureStyles } from "./styles";

type Card = HTMLElement & { setConfig(config: Config): void; hass?: HomeAssistant };

// As Home Assistant's history graph card: an hour unless set
const DEFAULT_HOURS = 1;
// The timespan field: a minute to a week, in minutes
const TIMESPAN: Control = { id: "timespan", role: "timespan", kind: "field", option: "Timespan", decimals: 0 } as Control;
const TIMESPAN_MAX = 7 * 24 * 60;

const hoursOf = (c: Config): number => (Number(c.hours_to_show) > 0 ? Number(c.hours_to_show) : DEFAULT_HOURS);

export class PrusaHistory extends PrusaElement {
  static override label = "History";
  static override pickerName = "Prusa history";
  static override controlsKey = "entities";
  static override form = { label: "Entities" };

  static override controlIds(device: Device): string[] {
    return heaterIds(device).flatMap((reading) => [reading, targetOf(reading)]);
  }

  /** The editor: the lines shown, then Home Assistant's history graph options as its own editor has them, then Colors and the layout. */
  static override editor(hass: HomeAssistant, entityId?: string): FeatureForm {
    const base = super.editor(hass, entityId);
    const device = deviceOf(hass, entityId);
    const heaters = heaterIds(device);
    return {
      pending: base.pending,
      schema: [
        ...base.schema,
        {
          name: "", type: "grid", schema: [
            { name: "hours_to_show", label: "Hours to show", selector: { number: { min: 0, step: "any", mode: "box" } } },
            { name: "logarithmic_scale", label: "Logarithmic scale", selector: { boolean: {} } },
            { name: "expand_legend", label: "Expand legend", selector: { boolean: {} } },
            { name: "timespan", label: "Timespan control", selector: { boolean: {} } },
          ],
        },
        {
          name: "", type: "grid", schema: [
            { name: "min_y_axis", label: "Minimum Y axis", selector: { number: { mode: "box", step: "any" } } },
            { name: "max_y_axis", label: "Maximum Y axis", selector: { number: { mode: "box", step: "any" } } },
          ],
        },
        {
          name: "fit_y_data", label: "Fit Y axis to the data", selector: { boolean: {} },
          visible: { condition: "or", conditions: [{ field: "min_y_axis", operator: "exists" }, { field: "max_y_axis", operator: "exists" }] },
        },
        {
          name: "colors", type: "expandable", title: "Colors",
          schema: heaters.map((id) => ({
            name: id, label: historyName(id, device),
            helper: "Its target is the same color, dimmed. The heater's field in Prusa temperatures shows it in these colors too.",
            selector: { ui_color: {} },
          })),
        },
        {
          name: "full_width", label: "Full width",
          helper: "The features sit beside the title in two columns. On: the graph stretches across both. Off: it takes one column.",
          selector: { boolean: {} },
        },
      ],
      // Numbers left empty stay empty, as in Home Assistant's own editor (the graph shows an hour)
      data: (c) => ({
        ...base.data(c),
        hours_to_show: c.hours_to_show, min_y_axis: c.min_y_axis, max_y_axis: c.max_y_axis,
        logarithmic_scale: c.logarithmic_scale === true, expand_legend: c.expand_legend === true, timespan: c.timespan === true,
        fit_y_data: c.fit_y_data === true, colors: c.colors ?? {}, full_width: c.full_width === true,
      }),
    };
  }

  static override styles = [featureStyles, css`
    :host { display: block; min-width: 0; max-width: 100%; height: 100%; }
    .graph {
      display: flex; flex-direction: column; height: var(--prusa-history-height, 240px); box-sizing: border-box;
      --ha-card-background: transparent; --card-background-color: transparent; --ha-card-box-shadow: none;
      --ha-card-border-width: 0; --ha-card-border-color: transparent; --ha-card-backdrop-filter: none;
      border-radius: var(--feature-border-radius, 12px); overflow: hidden;
      background: var(--prusa-feature-backing, var(--prusa-feature-scrim, transparent));
    }
    /* Home Assistant's history graph card sizes its chart from its own height: it needs a box of a set height (not a minimum) to fill, or the chart is drawn 0 px tall */
    .graph > * { display: block; flex: 1 1 auto; min-height: 0; height: 100%; }
    .rows { margin-top: var(--ha-card-feature-gap, 12px); }
  `];

  private _graph?: Card;
  private _loading = false;
  private _shown?: string;
  // The timespan set with the field (minutes), and the hours it was set from
  private _minutes?: number;
  private _minutesFrom?: number;

  /** The hours shown: the timespan set on the dashboard, or else Hours to show. */
  private _hours(): number {
    const hours = hoursOf(this._config!);
    if (this._minutesFrom !== hours) {
      this._minutes = undefined;
      this._minutesFrom = hours;
    }
    return this._minutes !== undefined ? this._minutes / 60 : hours;
  }

  /** The history graph card's configuration: a fixed height (grid_options rows) makes its chart fill the feature; the legend is Home Assistant's. */
  private _graphConfig(): Config | undefined {
    const device = this._device;
    const ids = this._chosen().filter((id) => this._type.controlIds(device).includes(id) && device.roles[id]);
    if (!ids.length) return undefined;
    const colors = this._heaterColors();
    const colorOf = (id: string) => {
      const heater = colors[id.replace("_target_temperature", "_temperature")];
      return heater && (id.endsWith("_target_temperature") ? heater.target : heater.reading);
    };
    const c = this._config!;
    return {
      type: "history-graph",
      entities: ids.map((id) => ({ entity: device.roles[id], name: historyName(id, device), color: colorOf(id) })),
      hours_to_show: this._hours(), grid_options: { rows: 4 },
      ...(c.expand_legend === true ? { expand_legend: true } : {}),
      ...(c.logarithmic_scale === true ? { logarithmic_scale: true } : {}),
      ...(Number.isFinite(c.min_y_axis) ? { min_y_axis: c.min_y_axis } : {}),
      ...(Number.isFinite(c.max_y_axis) ? { max_y_axis: c.max_y_axis } : {}),
      ...(c.fit_y_data === true ? { fit_y_data: true } : {}),
    };
  }

  /** The timespan field: the hours shown, in minutes, as an entity's number would be. */
  private _timespan(): TemplateResult | typeof nothing {
    if (this._config?.timespan !== true) return nothing;
    const source: HassEntity = {
      entity_id: "", state: String(Math.round(this._hours() * 60)),
      attributes: { min: 1, max: TIMESPAN_MAX, step: 1, unit_of_measurement: "min" },
    };
    const set = (minutes: number) => {
      this._minutes = minutes;
      this.requestUpdate();
    };
    return html`<div class="rows"><div class="row"><prusa-field data-key="timespan" data-min=${ITEM_MIN.field}
      .control=${TIMESPAN} .source=${source} .set=${set} .hass=${this._hass}></prusa-field></div></div>`;
  }

  protected override render(): TemplateResult {
    const config = this._graphConfig();
    this._showNothing(!config);
    const key = config && JSON.stringify(config);
    if (key && key !== this._shown) {
      this._shown = key;
      if (this._graph) this._graph.setConfig(config!);
      else if (!this._loading) {
        // Home Assistant's history graph card, made by its card helpers as a dashboard makes it
        this._loading = true;
        window.loadCardHelpers?.().then((helpers) => {
          this._graph = helpers.createCardElement(JSON.parse(this._shown!)) as Card;
          this.requestUpdate();
        });
      }
    }
    if (this._graph) this._graph.hass = this._hass;
    return html`<div class="graph">${this._graph}</div>${this._timespan()}`;
  }
}
