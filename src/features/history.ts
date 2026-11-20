// Prusa history: Home Assistant's own history graph card of the heaters'
// readings and targets, with its options (hours_to_show, min_y_axis,
// max_y_axis, fit_y_data), in Prusa Connect's chart palette, each line
// named short in the legend.
import { css, html, type TemplateResult } from "lit";
import { darkMode, type Config, type HomeAssistant } from "../ha";
import { heaterIds, targetOf } from "../printer/controls";
import type { Device } from "../printer/device";
import { historyColors, historyName } from "../printer/history";
import { PrusaElement } from "./base";

type Card = HTMLElement & { setConfig(config: Config): void; hass?: HomeAssistant };

export class PrusaHistory extends PrusaElement {
  static override label = "History";
  static override pickerName = "Prusa history";
  static override controlsKey = "entities";
  static override form = {
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

  static override controlIds(device: Device): string[] {
    return heaterIds(device).flatMap((reading) => [reading, targetOf(reading)]);
  }

  static override styles = css`
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
  `;

  private _graph?: Card;
  private _loading = false;
  private _shown?: string;

  /** The history graph card's configuration: a fixed height (grid_options rows) makes its chart fill the feature; the legend is Home Assistant's, which fits itself to the room and expands with a tap. */
  private _graphConfig(): Config | undefined {
    const device = this._device;
    const ids = this._chosen().filter((id) => this._type.controlIds(device).includes(id) && device.roles[id]);
    if (!ids.length) return undefined;
    const colors = historyColors(ids, darkMode(this._hass));
    const c = this._config!;
    return {
      type: "history-graph",
      entities: ids.map((id, i) => ({ entity: device.roles[id], name: historyName(id, device), color: colors[i] })),
      hours_to_show: Number(c.hours_to_show) || 1, grid_options: { rows: 4 },
      ...(Number.isFinite(c.min_y_axis) ? { min_y_axis: c.min_y_axis } : {}),
      ...(Number.isFinite(c.max_y_axis) ? { max_y_axis: c.max_y_axis } : {}),
      ...(c.fit_y_data === true ? { fit_y_data: true } : {}),
    };
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
    return html`<div class="graph">${this._graph}</div>`;
  }
}
