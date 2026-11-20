// Prusa lights: each light as a light's tile card shows it, Home
// Assistant's tile icon (a tap turns it on or off) and its light brightness
// feature. The icon and the slider are two choices, in one row, in the
// order chosen. With off_at_minimum, the slider at its minimum turns the
// light off.
import { css, html, type TemplateResult } from "lit";
import { entityName, isOn, performAction, type HomeAssistant } from "../ha";
import { controlOf, type Control } from "../printer/controls";
import type { Device } from "../printer/device";
import { PrusaElement } from "./base";
import { ITEM_MIN, rowStyles, RowFitter } from "./rows";

const LIGHTS = ["chamber_light"];
const BRIGHTNESS = "_brightness";
// A light's color: its own when it has one, daylight otherwise; Home Assistant's color for a light that is off
const DAYLIGHT = "rgb(214, 228, 255)";
const LIGHT_OFF = "var(--state-light-inactive-color, var(--state-inactive-color, var(--disabled-color, #bdbdbd)))";

/** Whether a light has a brightness. */
const dimmable = (hass: HomeAssistant, light: string) =>
  ((hass.states[light]?.attributes.supported_color_modes ?? []) as string[]).some((mode) => mode !== "onoff");

type El = HTMLElement & Record<string, any>;

/** A light's icon and slider, made once and kept while the feature shows them. */
class LightRow {
  readonly icon: El;
  readonly slide: El;
  private _state: El;
  private _slideIcon: El;
  private _control: El;

  constructor(private _feature: PrusaLights, private _entityId: string) {
    this.icon = document.createElement("ha-tile-icon") as El;
    this.icon.dataset.min = `${ITEM_MIN.key}`;
    this.icon.interactive = true;
    this.icon.actionHandlerOptions = { hasHold: false, hasDoubleClick: false };
    this._state = document.createElement("ha-state-icon") as El;
    this._state.slot = "icon";
    this.icon.append(this._state);
    this.icon.addEventListener("action", (ev) => {
      ev.stopPropagation();
      if ((ev as CustomEvent).detail?.action === "tap") performAction(_feature, "light.toggle", _entityId);
    });
    this.slide = document.createElement("div") as El;
    this.slide.className = "slide slider";
    this.slide.dataset.min = `${ITEM_MIN.slider}`;
    this._control = document.createElement("hui-card-feature") as El;
    this._control.feature = { type: "light-brightness" };
    this._control.context = { entity_id: _entityId };
    this._slideIcon = document.createElement("ha-state-icon") as El;
    this.slide.append(this._control, this._slideIcon);
    this.slide.addEventListener("value-changed", (ev) => {
      const slider = ev.composedPath()[0] as El;
      if (_feature.offAtMinimum && (ev as CustomEvent).detail?.value <= Number(slider?.min ?? 1)) {
        ev.stopPropagation();
        _feature.hass?.callService("light", "turn_off", { entity_id: _entityId });
      }
    }, true);
  }

  /** The light as it is now. */
  update(hass: HomeAssistant): void {
    const stateObj = hass.states[this._entityId];
    const rgb = stateObj?.attributes.rgb_color;
    const color = stateObj?.state === "on" ? (Array.isArray(rgb) ? `rgb(${rgb.join(", ")})` : DAYLIGHT) : LIGHT_OFF;
    const name = entityName(hass, this._entityId);
    this.icon.style.setProperty("--tile-icon-color", color);
    this.icon.accessibleLabel = name;
    if (name) this.icon.title = name;
    for (const icon of [this._state, this._slideIcon]) {
      icon.hass = hass;
      icon.stateObj = stateObj;
    }
    this._slideIcon.classList.toggle("off", !isOn(stateObj));
    this.slide.hidden = !dimmable(hass, this._entityId);
    this.slide.title = `${name ?? ""} brightness`;
    this.slide.style.setProperty("--feature-color", color);
    this._control.color = color;
    this._control.hass = hass;
  }
}

export class PrusaLights extends PrusaElement {
  static override label = "Lights";
  static override pickerName = "Prusa lights";
  static override form = {
    label: "Controls",
    options: [{
      name: "off_at_minimum", label: "Off at minimum", default: false,
      helper: "Moving a light's slider to its minimum (1%) turns the light off.",
    }],
  };

  /** Each light's icon and slider: "<light>" and "<light>_brightness". */
  static override controlIds(): string[] {
    return LIGHTS.flatMap((light) => [light, `${light}${BRIGHTNESS}`]);
  }

  static override controlFor(id: string, device: Device): { control?: Control; entityId?: string } {
    const light = id.endsWith(BRIGHTNESS) ? id.slice(0, -BRIGHTNESS.length) : id;
    const base = LIGHTS.includes(light) ? controlOf(light) : undefined;
    if (!base) return { control: undefined };
    const part = light === id ? "icon" : "brightness";
    return { control: { ...base, id, part, option: part === "brightness" ? `${base.option} brightness` : base.option }, entityId: device.roles[light] };
  }

  static override nameOf(id: string, device: Device, hass: HomeAssistant): string {
    const { control, entityId } = this.controlFor(id, device);
    if (!control) return id;
    const name = entityName(hass, entityId) ?? controlOf(control.role)?.option ?? id;
    return control.part === "brightness" ? `${name} brightness` : name;
  }

  static override styles = [rowStyles, css`
    :host { display: block; min-width: 0; max-width: 100%; }
    ha-tile-icon { flex: none; }
    .row > ha-tile-icon {
      flex: 1 1 0; min-width: ${ITEM_MIN.key}px; display: block; height: 100%;
      --tile-icon-size: 100%; --ha-tile-icon-border-radius: var(--feature-border-radius, 12px);
    }
    .row > ha-tile-icon:active { transform: none; }
    .slide { display: block; min-width: 0; border-radius: var(--feature-border-radius, 12px); }
    .slide[hidden] { display: none; }
    .slide.slider { position: relative; isolation: isolate; }
    .slide.slider > ha-state-icon {
      position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); pointer-events: none;
      --mdc-icon-size: 22px; color: var(--primary-text-color); mix-blend-mode: overlay; display: flex;
    }
    .slide.slider > ha-state-icon.off { opacity: .45; }
  `];

  private _lights = new Map<string, LightRow>();
  private _fitter = new RowFitter();

  get offAtMinimum(): boolean {
    return this._config?.off_at_minimum === true;
  }

  protected override render(): TemplateResult {
    const device = this._device;
    const items = this._chosen().map((id) => this._type.controlFor(id, device))
      .filter(({ control, entityId }) => control && entityId)
      .map(({ control, entityId }) => {
        if (!this._lights.has(entityId!)) this._lights.set(entityId!, new LightRow(this, entityId!));
        const light = this._lights.get(entityId!)!;
        light.update(this._hass!);
        return control!.part === "icon" ? light.icon : light.slide;
      })
      // A light without a brightness has no slider
      .filter((el) => !el.hidden);
    this._showNothing(items.length === 0);
    return html`<div class="row" role="group" aria-label=${this._type.label}>${items}</div>`;
  }

  protected override updated(): void {
    this._fitter.fit(this.renderRoot.querySelectorAll<HTMLElement>(".row"));
  }
}
