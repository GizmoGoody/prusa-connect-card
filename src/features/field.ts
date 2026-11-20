// A number field (a heater's target, print speed, flow): a tap types in it,
// and a press and slide changes it (set when the slide ends). A heater and
// its target show as one field: the reading on top, tinted as Prusa
// Connect tints it, and the target under it (Off at 0); a hold turns that
// heater off, and another hold sets the target it had.
import { html, LitElement, nothing } from "lit";
import { entityName, known, usable, type HassEntity, type HomeAssistant } from "../ha";
import { heaterState } from "../printer/device";
import type { Control } from "../printer/controls";
import { HEAT_WORDS } from "./keys";

// Sliding a field: no change within this distance of the press (px), and a
// new value every tick (ms) while the pointer is held, faster the farther it
// is from where the press started
const SCRUB_DEAD_ZONE = 6;
const SCRUB_TICK = 50;
const SCRUB_SCALE = 60;
const SCRUB_POWER = 1.5;
// A press held this long without sliding is a hold (ms), as Home Assistant's own hold
const HOLD_TIME = 500;

// Each heater's last target before a hold turned it off
const HEATER_TARGETS = new Map<string, number>();

// A field is in the number color, as Home Assistant's number features are
const NUMBER_ON = "var(--state-number-active-color, var(--state-active-color, var(--primary-color, #03a9f4)))";

interface Scrub {
  change: (steps: number) => void;
  done: () => void;
  hold?: () => void;
}

/**
 * Press, then slide: while the pointer is held the value changes, faster
 * the farther the pointer is from where the press started; right or up
 * raises it. A tap is left to the field, to type in. A press held without
 * sliding is a hold, and the click after it does not open the field.
 */
function scrub(el: HTMLElement, handlers: () => Scrub): void {
  let start: { x: number; y: number } | undefined, at = { x: 0, y: 0 };
  let timer: ReturnType<typeof setInterval> | undefined, holding: ReturnType<typeof setTimeout> | undefined, held = false;
  const blur = () => el.querySelector("input")?.blur();
  const begin = (ev: PointerEvent) => {
    try {
      el.setPointerCapture(ev.pointerId);
    } catch {
      // A pointer the browser no longer tracks: the slide follows the moves the element gets
    }
    clearTimeout(holding);
    el.classList.add("sliding");
    timer = setInterval(() => {
      const distance = (at.x - start!.x) - (at.y - start!.y);
      const beyond = Math.max(0, Math.abs(distance) - SCRUB_DEAD_ZONE);
      if (beyond) handlers().change(Math.sign(distance) * (beyond / SCRUB_SCALE) ** SCRUB_POWER);
    }, SCRUB_TICK);
  };
  const stop = (ev: PointerEvent) => {
    if (!start) return;
    const sliding = timer !== undefined;
    clearTimeout(holding);
    clearInterval(timer);
    timer = undefined;
    start = undefined;
    el.classList.remove("sliding");
    if (el.hasPointerCapture?.(ev.pointerId)) el.releasePointerCapture(ev.pointerId);
    if (sliding) handlers().done();
  };
  el.addEventListener("pointerdown", (ev) => {
    if (el.classList.contains("disabled") || ev.button !== 0) return;
    start = at = { x: ev.clientX, y: ev.clientY };
    held = false;
    const hold = handlers().hold;
    if (hold) {
      holding = setTimeout(() => {
        if (!start || timer !== undefined) return;
        held = true;
        start = undefined;
        blur();
        hold();
      }, HOLD_TIME);
    }
  });
  el.addEventListener("click", (ev) => {
    if (!held) return;
    held = false;
    ev.preventDefault();
    ev.stopPropagation();
  }, true);
  el.addEventListener("pointermove", (ev) => {
    if (!start) return;
    at = { x: ev.clientX, y: ev.clientY };
    if (timer === undefined && Math.hypot(at.x - start.x, at.y - start.y) > SCRUB_DEAD_ZONE) {
      blur();
      begin(ev);
    }
  });
  el.addEventListener("pointerup", stop);
  el.addEventListener("pointercancel", stop);
  el.addEventListener("lostpointercapture", stop);
}

/** The decimals a number shows: the control's, or as many as its step has (0.1: 1, 1: 0). */
function decimalsOf(control: Control | undefined, stateObj?: HassEntity): number {
  if (control?.decimals !== undefined) return control.decimals;
  const step = String(stateObj?.attributes.step ?? 1);
  return step.includes(".") ? step.split(".")[1].length : 0;
}

export class PrusaField extends LitElement {
  control?: Control;
  // The number entity the field sets, and a heater's reading (a pair)
  entity?: string;
  reading?: string;
  hass?: HomeAssistant;
  // Whether the printer is on: the field cannot be used while it is off
  active = true;
  private _pending?: number;
  private _shown = "";

  static override properties = {
    control: { attribute: false }, entity: { attribute: false }, reading: { attribute: false },
    hass: { attribute: false }, active: { attribute: false },
  };

  constructor() {
    super();
    scrub(this, () => ({ change: (steps) => this._slide(steps), done: () => this._release(), hold: this._pair ? () => this._hold() : undefined }));
  }

  // Drawn in the feature's own shadow root, in the feature's styles
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  private get _pair(): boolean {
    return this.control?.kind === "pair";
  }

  private get _state(): HassEntity | undefined {
    return this.entity ? this.hass?.states[this.entity] : undefined;
  }

  private _value(): number {
    return Number(this._state?.state);
  }

  private get _input(): HTMLInputElement | null {
    return this.querySelector("input");
  }

  // A heater's target of 0 is Off: an empty field, which shows Off
  private _format(value?: number): string {
    if (value === undefined) return "";
    if (this._pair && value === 0) return "";
    return Number.isFinite(value) ? value.toFixed(decimalsOf(this.control, this._state)) : "";
  }

  private get _usable(): boolean {
    return !!this.hass && usable(this.hass, this.entity) && this.active;
  }

  protected override render() {
    const hass = this.hass, stateObj = this._state;
    if (!hass || !this.control) return nothing;
    const unit = stateObj?.attributes.unit_of_measurement ?? "";
    const input = html`<input type="text" inputmode="decimal" enterkeyhint="done" placeholder=${this._pair ? "Off" : ""}
      aria-label=${entityName(hass, this.entity) ?? this.control.option ?? ""} ?disabled=${!this._usable}
      @keydown=${this._key} @change=${this._typed} @click=${(ev: Event) => ev.stopPropagation()}>`;
    if (!this._pair) {
      return html`${this.control.icon === true ? html`<ha-state-icon .hass=${hass} .stateObj=${stateObj}></ha-state-icon>` : nothing}${input}<span class="unit">${unit}</span>`;
    }
    const reading = hass.states[this.reading ?? ""];
    const state = this._heat();
    const arrow = state === "heating" ? "mdi:arrow-up" : state === "cooling" ? "mdi:arrow-down" : undefined;
    return html`<ha-state-icon .hass=${hass} .stateObj=${reading}></ha-state-icon><span class="two"
      ><span class="heat"><span class="now">${known(reading) ? hass.formatEntityState(reading) : ""}</span>${arrow ? html`<ha-icon class="arrow" .icon=${arrow}></ha-icon>` : nothing}</span
      ><span class="target">${input}<span class="unit">${unit}</span></span></span>`;
  }

  /** A heater's state (see heaterState), or undefined while its reading is not known. */
  private _heat(): string | undefined {
    const reading = this.hass?.states[this.reading ?? ""];
    return known(reading) ? heaterState(Number(reading.state), this._value(), !!this.control?.chamber) : undefined;
  }

  protected override updated(): void {
    const hass = this.hass;
    if (!hass || !this.control) return;
    this._shown = this._format(this._value());
    this.style.setProperty("--feature-color", NUMBER_ON);
    this.classList.add("field", "drag");
    this.classList.toggle("pair", this._pair);
    this.classList.toggle("disabled", !this._usable);
    let name: string;
    if (this._pair) {
      const state = this._heat();
      for (const s of ["heating", "cooling", "at_temperature", "off"]) this.classList.toggle(s, state === s);
      this.classList.toggle("unset", (this._pending ?? this._value()) === 0);
      const reading = hass.states[this.reading ?? ""], stateObj = this._state;
      const words = state ? HEAT_WORDS[state] : undefined;
      name = `${entityName(hass, this.reading) ?? this.control.option ?? ""}: ${reading ? hass.formatEntityState(reading) : ""}${words ? `, ${words}` : ""}. `
        + `Target: ${stateObj ? hass.formatEntityState(stateObj) : ""}. Tap to type, press and slide, or hold to turn it off or on`;
    } else {
      name = `${entityName(hass, this.entity) ?? this.control.option ?? ""}. Tap to type, or press and slide`;
    }
    if (this.title !== name) this.title = name;
    if (this.getAttribute("aria-label") !== name) this.setAttribute("aria-label", name);
    // The number shown, unless it is being typed in
    const input = this._input;
    const focused = (this.getRootNode() as ShadowRoot | Document).activeElement === input;
    if (input && (this._pending !== undefined || !focused)) input.value = this._format(this._pending ?? this._value());
  }

  private _key = (ev: KeyboardEvent) => {
    ev.stopPropagation();
    const input = this._input!;
    if (ev.key === "Enter") input.blur();
    if (ev.key === "Escape") {
      input.value = this._shown;
      input.blur();
    }
  };

  /** A heater held: off, or back to the last target set while it is off. */
  private _hold(): void {
    const value = this._value();
    if (!this.entity) return;
    if (value > 0) {
      HEATER_TARGETS.set(this.entity, value);
      this._commit(0);
    } else if (HEATER_TARGETS.has(this.entity)) {
      this._commit(HEATER_TARGETS.get(this.entity)!);
    }
  }

  private _slide(steps: number): void {
    const stateObj = this._state;
    const value = this._pending ?? this._value();
    if (!stateObj || !Number.isFinite(value)) return;
    const { min = -Infinity, max = Infinity, step = 1 } = stateObj.attributes;
    this._pending = Math.min(max, Math.max(min, value + steps * Math.max(step, 10 ** -decimalsOf(this.control, stateObj))));
    this._input!.value = this._format(this._pending);
    this.classList.toggle("unset", this._pair && this._pending === 0);
  }

  private _release(): void {
    const pending = this._pending;
    this._pending = undefined;
    if (pending !== undefined) this._commit(pending);
  }

  private _typed = () => {
    const input = this._input!;
    const typed = input.value.trim();
    // A heater's target typed empty or "off" is Off
    if (this._pair && (typed === "" || /^off$/i.test(typed))) {
      this._commit(0);
      return;
    }
    const value = Number(typed.replace(",", "."));
    if (typed === "" || !Number.isFinite(value)) {
      input.value = this._shown;
      return;
    }
    this._commit(value);
  };

  /** Set the number, rounded to what it shows and kept within its range. */
  private _commit(value: number): void {
    const stateObj = this._state;
    if (!stateObj || !this.hass) return;
    const factor = 10 ** decimalsOf(this.control, stateObj);
    const { min = -Infinity, max = Infinity } = stateObj.attributes;
    const next = Math.min(max, Math.max(min, Math.round(value * factor) / factor));
    if (next !== this._value()) this.hass.callService("number", "set_value", { entity_id: this.entity, value: next });
    else if (this._input) this._input.value = this._shown;
  }
}
