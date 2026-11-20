// The features' editor: one element; the form is the feature's (its static editor).
import { html, LitElement, nothing, type TemplateResult } from "lit";
import { PENDING_URL } from "../const";
import { fire, same, type Config, type FeatureContext, type HomeAssistant } from "../ha";
import { FEATURES } from "../features";

const label = (s: Config) => s.label ?? s.name;
const helper = (s: Config) => s.helper;

export class PrusaFeatureEditor extends LitElement {
  private _hass?: HomeAssistant;
  private _context?: FeatureContext;
  private _config?: Config;

  set hass(hass: HomeAssistant) {
    this._hass = hass;
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

  setConfig(config: Config): void {
    this._config = config;
    this.requestUpdate();
  }

  private _form() {
    return this._hass && this._config
      ? FEATURES[`${this._config.type ?? ""}`.replace(/^custom:/, "")]?.editor(this._hass, this._context?.entity_id) : undefined;
  }

  protected override render(): TemplateResult | typeof nothing {
    const form = this._form();
    if (!form) return nothing;
    const pending = form.pending;
    return html`${pending.length ? html`<ha-alert alert-type="info" style="display: block; margin-bottom: 16px">
      Not offered by the Prusa Connect integration yet: ${pending.join(", ")}. They show here once it offers them. Add your support to
      <a href=${PENDING_URL} target="_blank" rel="noreferrer">the request for them</a> on the integration's repository.</ha-alert>` : nothing}
      <ha-form .hass=${this._hass} .schema=${form.schema} .data=${form.data(this._config!)} .computeLabel=${label} .computeHelper=${helper}
        @value-changed=${this._changed}></ha-form>`;
  }

  /** Only what differs from the feature's defaults is written. */
  private _changed(ev: CustomEvent): void {
    ev.stopPropagation();
    const form = this._form();
    if (!form) return;
    const value: Config = { ...ev.detail.value };
    const defaults = form.data({ type: this._config!.type });
    for (const [key, option] of Object.entries(value)) {
      if ((key in defaults && same(option, defaults[key])) || option === undefined || option === "") delete value[key];
    }
    this._config = { type: this._config!.type, ...value };
    fire(this, "config-changed", { config: this._config });
    this.requestUpdate();
  }
}
