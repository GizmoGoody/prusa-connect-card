/**
 * Stand-ins for the Home Assistant frontend parts the Prusa Connect card uses, for
 * testing the card in a plain browser page.
 *
 * They use Home Assistant's element names and structure. The hass object
 * holds two lasers as the integration registers them: an F2 Ultra UV (WS-V2,
 * no progress sensor), with each camera and its settings on its own device
 * and a SafetyPro IF2 2.0 on an accessory device, and a P2 with a progress
 * sensor.
 */

// The headless browser the tests run in draws no frames, so its
// ResizeObserver never reports. This one reports each observed element's
// new size on a timer, as the browser does after a frame.
window.ResizeObserver = class {
  constructor(callback) {
    this._callback = callback;
    this._sizes = new Map();
  }

  observe(el) {
    this._sizes.set(el, undefined);
    this._timer ??= setInterval(() => {
      const entries = [];
      for (const [target, size] of this._sizes) {
        const now = `${target.clientWidth}x${target.clientHeight}`;
        if (now !== size) {
          this._sizes.set(target, now);
          entries.push({ target, contentRect: target.getBoundingClientRect() });
        }
      }
      if (entries.length) this._callback(entries, this);
    }, 10);
  }

  unobserve(el) {
    this._sizes.delete(el);
  }

  disconnect() {
    this._sizes.clear();
    clearInterval(this._timer);
    this._timer = undefined;
  }
};


// The entities' own names, by translation key, as the integration's
// translations give them ({tool} is the tool's number)
const NAMES = {
  state: "State", progress: "Progress", time_remaining: "Time remaining", time_printing: "Print time", finish_time: "Finish time",
  job_name: "File", bed_temperature: "Bed temperature", bed_target_temperature: "Bed target temperature",
  axis_x: "X position", axis_y: "Y position", axis_z: "Z position", speed: "Print speed",
  pause: "Pause print", resume: "Resume print", stop: "Stop print", server: "Server", camera: "Camera {camera}",
  nozzle_temperature: "Tool {tool} nozzle temperature", nozzle_target_temperature: "Tool {tool} nozzle target temperature",
  material: "Tool {tool} material", nozzle_diameter: "Tool {tool} nozzle diameter", print_fan_speed: "Tool {tool} print fan speed",
  heatbreak_fan_speed: "Tool {tool} heatbreak fan speed", active: "Tool {tool} active", nozzle_high_flow: "Tool {tool} high-flow nozzle",
  nozzle_hardened: "Tool {tool} hardened nozzle",
  // Not offered by the integration yet: the names a future version may give them
  chamber_temperature: "Chamber temperature", chamber_target_temperature: "Chamber target temperature", chamber_fan: "Chamber fan",
  chamber_light: "Chamber light", flow: "Flow", home: "Home", disable_steppers: "Disable steppers", beep: "Beep", reset_printer: "Reset printer",
};

const TEMP = { unit_of_measurement: "°C", device_class: "temperature" };
const TARGET = (max) => ({ ...TEMP, min: 0, max, step: 1, mode: "box" });
const RPM = { unit_of_measurement: "rpm" };
const MM = { unit_of_measurement: "mm" };
const DIAGNOSTIC = ["nozzle_diameter", "print_fan_speed", "heatbreak_fan_speed", "nozzle_high_flow", "nozzle_hardened", "axis_x", "axis_y", "axis_z"];

/** A printer's own entities: [entity_id, translation_key, state, attributes]. */
function printer(id, { state, progress, bed, bedTarget, tools, extra = [] }) {
  const list = [
    [`sensor.${id}_state`, "state", state, { device_class: "enum", options: ["idle", "busy", "ready", "printing", "paused", "finished", "stopped", "attention", "error"] }],
    [`sensor.${id}_progress`, "progress", progress, { unit_of_measurement: "%" }],
    [`sensor.${id}_time_remaining`, "time_remaining", progress === "unknown" ? "unknown" : "62", { unit_of_measurement: "min", device_class: "duration" }],
    [`sensor.${id}_finish_time`, "finish_time", progress === "unknown" ? "unknown" : "2026-11-19T18:20:00+00:00", { device_class: "timestamp" }],
    [`sensor.${id}_job_name`, "job_name", progress === "unknown" ? "unknown" : "Fan_duct_0.4n_0.2mm_ASA_COREONE_2h05m.bgcode"],
    [`sensor.${id}_bed_temperature`, "bed_temperature", bed, TEMP],
    [`number.${id}_bed_target_temperature`, "bed_target_temperature", bedTarget, TARGET(120)],
    [`sensor.${id}_x_position`, "axis_x", "125.0", MM],
    [`sensor.${id}_y_position`, "axis_y", "105.0", MM],
    [`sensor.${id}_z_position`, "axis_z", "20.2", MM],
    [`number.${id}_print_speed`, "speed", "100", { unit_of_measurement: "%", min: 20, max: 999, step: 1, mode: "box" }],
    [`button.${id}_pause_print`, "pause", "unknown"],
    [`button.${id}_resume_print`, "resume", "unknown"],
    [`button.${id}_stop_print`, "stop", "unknown"],
    [`binary_sensor.${id}_connectivity`, null, "on", { device_class: "connectivity" }],
  ];
  tools.forEach(([temp, target, material, active], i) => {
    const n = i + 1, t = `${id}_tool_${n}`;
    list.push(
      [`sensor.${t}_nozzle_temperature`, "nozzle_temperature", temp, TEMP],
      [`number.${t}_nozzle_target_temperature`, "nozzle_target_temperature", target, TARGET(300)],
      [`sensor.${t}_material`, "material", material],
      [`sensor.${t}_nozzle_diameter`, "nozzle_diameter", "0.4", MM],
      [`sensor.${t}_print_fan_speed`, "print_fan_speed", n === 1 ? "4200" : "0", RPM],
      [`sensor.${t}_heatbreak_fan_speed`, "heatbreak_fan_speed", "6100", RPM],
      [`binary_sensor.${t}_active`, "active", active ? "on" : "off"],
      [`binary_sensor.${t}_high_flow_nozzle`, "nozzle_high_flow", n === 1 ? "on" : "off"],
      [`binary_sensor.${t}_hardened_nozzle`, "nozzle_hardened", "off"],
    );
  });
  return [...list, ...extra];
}

// The controls the integration does not offer yet, as a future version may offer them
const FUTURE = (id) => [
  [`sensor.${id}_chamber_temperature`, "chamber_temperature", "38.5", TEMP],
  [`number.${id}_chamber_target_temperature`, "chamber_target_temperature", "40", TARGET(55)],
  [`fan.${id}_chamber_fan`, "chamber_fan", "on", { preset_modes: ["auto"], preset_mode: null, percentage: 60, percentage_step: 1 }],
  [`light.${id}_chamber_light`, "chamber_light", "on", { supported_color_modes: ["brightness"], brightness: 200 }],
  [`number.${id}_flow`, "flow", "100", { unit_of_measurement: "%", min: 50, max: 200, step: 1, mode: "box" }],
  [`button.${id}_home`, "home", "unknown"],
  [`button.${id}_disable_steppers`, "disable_steppers", "unknown"],
  [`button.${id}_beep`, "beep", "unknown"],
  [`button.${id}_reset_printer`, "reset_printer", "unknown"],
];

const HUB = [["update.prusa_connect_server", "server", "off", { installed_version: "1.4.0", latest_version: "1.4.0" }]];
// Three printers on one Prusa Connect server, as the integration registers
// them, and a CORE One as a future version of the integration may offer it
const DEVICES = {
  dev_hub: { model: "Prusa Connect", via: null, entities: HUB },
  dev_core: {
    model: "CoreOne", via: "dev_hub",
    entities: [...printer("office_core_one", { state: "printing", progress: "42", bed: "104.6", bedTarget: "105", tools: [["259.8", "260", "ASA", true]] }),
      ["camera.office_core_one_camera_chamber", "camera", "idle", { access_token: "a", entity_picture: "/api/camera_proxy/camera.office_core_one_camera_chamber?token=a" }]],
  },
  dev_mk4: {
    model: "MK4S", via: "dev_hub",
    entities: printer("workshop_mk4s", { state: "idle", progress: "unknown", bed: "23.4", bedTarget: "0", tools: [["24.1", "0", "PLA", false]] }),
  },
  dev_xl: {
    model: "XL", via: "dev_hub",
    entities: [...printer("garage_xl", {
      state: "paused", progress: "57", bed: "60.2", bedTarget: "60",
      tools: [["215.1", "215", "PLA", false], ["170.0", "170", "PLA", true], ["150.2", "170", "PETG", false], ["24.0", "0", "PETG", false], ["24.3", "0", "PLA", false]],
    }),
    ["camera.garage_xl_camera_front", "camera", "idle", { access_token: "b" }], ["camera.garage_xl_camera_top", "camera", "idle", { access_token: "c" }]],
  },
  dev_future: {
    model: "CoreOne", via: "dev_hub",
    entities: printer("future_core_one", { state: "printing", progress: "42", bed: "104.6", bedTarget: "105", tools: [["259.8", "260", "ASA", true]], extra: FUTURE("future_core_one") }),
  },
};

window.makeHass = (changes = {}) => {
  const hass = {
    states: {},
    entities: {},
    devices: Object.fromEntries(Object.entries(DEVICES).map(([id, d]) => [id, { id, model: d.model, via_device_id: d.via, name: id }])),
    themes: { darkMode: true },
    calls: [],
    // The state as Home Assistant shows it: here with its unit
    formatEntityState(stateObj, state = stateObj.state) {
      const unit = stateObj.attributes.unit_of_measurement;
      return unit ? `${state} ${unit}` : state;
    },
    // The entity's own name (an entity name item of type entity), from its translation key
    formatEntityName(stateObj, item) {
      if (item?.type !== "entity") throw new Error(`formatEntityName stand-in: ${JSON.stringify(item)}`);
      const entry = hass.entities[stateObj.entity_id];
      const tool = stateObj.entity_id.match(/_tool_(\d+)_/)?.[1];
      const camera = stateObj.entity_id.match(/_camera_(\w+)$/)?.[1];
      if (!entry?.translation_key) return stateObj.attributes.device_class === "connectivity" ? "Connectivity" : "";
      return (NAMES[entry.translation_key] ?? "").replace("{tool}", tool).replace("{camera}", camera ? camera[0].toUpperCase() + camera.slice(1) : "");
    },
    callWS(message) {
      return Promise.reject(new Error(`callWS stand-in: ${JSON.stringify(message)}`));
    },
    // A call's target is recorded with its data, as one entity_id
    callService(domain, service, data, target) {
      hass.calls.push({ domain, service, data: { ...(data ?? {}), ...(target ?? {}) } });
      return Promise.resolve();
    },
  };
  const started = new Date(Date.now() - 728000).toISOString();
  for (const [device, { entities }] of Object.entries(DEVICES)) {
    for (const [entity_id, translation_key, state, attributes = {}] of entities) {
      const key = translation_key ?? undefined;
      hass.entities[entity_id] = {
        entity_id, device_id: device, platform: "prusa_connect", translation_key: key,
        entity_category: DIAGNOSTIC.includes(key) || !key ? "diagnostic" : undefined,
      };
      hass.states[entity_id] = { entity_id, state, attributes: { friendly_name: entity_id, ...attributes }, last_changed: started };
    }
  }
  for (const [entityId, change] of Object.entries(changes)) {
    const next = typeof change === "string" ? { state: change } : change;
    hass.states[entityId] = { ...hass.states[entityId], ...next, attributes: { ...hass.states[entityId].attributes, ...(next.attributes ?? {}) } };
  }
  hass.connection = { hass };
  return hass;
};

// Home Assistant's history graph card: holds its configuration and hass
customElements.define("hui-history-graph-card", class extends HTMLElement {
  setConfig(config) {
    this.config = config;
  }
});

// Home Assistant's named theme colors, which the features' buttons use
document.documentElement.style.cssText = [
  "--primary-color: #03a9f4", "--red-color: #f44336", "--green-color: #4caf50", "--amber-color: #ffc107",
  "--blue-color: #2196f3", "--cyan-color: #00bcd4", "--indigo-color: #3f51b5", "--teal-color: #009688",
].join(";");

// hui-timestamp-display: Home Assistant's timestamp display (the tile card loads it)
customElements.define("hui-timestamp-display", class extends HTMLElement {});

// hui-image: Home Assistant's image element (its picture cards load it); a
// page can leave it out (window.noHuiImage) to check that the card loads it
// As Home Assistant's, it fetches its picture only while it is on screen
// (not hidden), and again each time it comes back on screen; loads counts
// the pictures it fetched.
const PIXEL = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
window.defineHuiImage = () => customElements.define("hui-image", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = '<div><img alt="" style="display:block;width:100%;aspect-ratio:4/3"></div>';
    const img = this.shadowRoot.querySelector("img");
    this.loads = 0;
    Object.defineProperty(img, "naturalWidth", { get: () => (this.loads ? 400 : 0) });
    Object.defineProperty(img, "naturalHeight", { get: () => (this.loads ? 300 : 0) });
    this.updateComplete = Promise.resolve();
    // Counted before anyone else hears the picture load
    this.shadowRoot.addEventListener("load", () => (this.loads += 1), true);
    this._img = img;
  }

  // Home Assistant's uses an IntersectionObserver; the test browser runs on
  // virtual time, where those are late, so this checks the layout instead
  connectedCallback() {
    const look = () => {
      if (!this.isConnected) return;
      const visible = this.checkVisibility();
      if (visible && !this._visible) this._img.src = `${PIXEL}#${this.loads + 1}`;
      this._visible = visible;
      this._look = setTimeout(look, 10);
    };
    look();
  }

  disconnectedCallback() {
    clearTimeout(this._look);
  }
});
if (!window.noHuiImage) window.defineHuiImage();

// hui-select-options-card-feature: Home Assistant's select options feature
// (it brings Home Assistant's segmented control, as its module does)
customElements.define("hui-select-options-card-feature", class extends HTMLElement {
  connectedCallback() {
    this.style.cssText = "display:block;height:42px";
    if (!customElements.get("ha-control-select")) setTimeout(() => window.defineControlSelect(), 10);
  }
});

// ha-control-select: Home Assistant's segmented control. choose(value) is a
// tap on an option, which sends value-changed as Home Assistant's does
window.defineControlSelect = () => customElements.get("ha-control-select") || customElements.define("ha-control-select", class extends HTMLElement {
  connectedCallback() {
    this.style.cssText = "display:block;height:42px";
  }

  choose(value) {
    if (this.disabled) return;
    this.dispatchEvent(new CustomEvent("value-changed", { detail: { value } }));
  }
});

// Home Assistant's fan and numeric input features: a 42 px block. The
// numeric input feature brings Home Assistant's number buttons, as its
// module does
for (const name of ["fan-preset-modes", "fan-speed", "numeric-input"]) {
  customElements.define(`hui-${name}-card-feature`, class extends HTMLElement {
    connectedCallback() {
      this.style.cssText = "display:block;height:42px";
      if (name === "numeric-input" && !customElements.get("ha-control-number-buttons")) setTimeout(() => window.defineNumberButtons(), 10);
      if (name === "fan-speed" && !customElements.get("ha-control-select")) setTimeout(() => window.defineControlSelect(), 10);
    }
  });
}

// ha-control-number-buttons: Home Assistant's number buttons. press(n) is a
// tap on + (n > 0) or - (n < 0), which sends value-changed as Home Assistant's does
window.defineNumberButtons = () => customElements.get("ha-control-number-buttons") || customElements.define("ha-control-number-buttons", class extends HTMLElement {
  connectedCallback() {
    this.style.cssText = "display:block;height:42px";
  }

  press(n) {
    const value = Math.round((this.value + n * this.step) * 1000) / 1000;
    this.dispatchEvent(new CustomEvent("value-changed", { detail: { value: Math.min(this.max, Math.max(this.min, value)) } }));
  }
});

// ha-input: Home Assistant's input (its number entity row loads it)
window.defineInput = () => customElements.get("ha-input") || customElements.define("ha-input", class extends HTMLElement {});

// hui-light-brightness-card-feature: Home Assistant's light brightness
// feature. As Home Assistant's, its slider (min 1) sends value-changed,
// which the feature keeps to itself and sets the brightness with;
// slide(value) is a slide to that value
customElements.define("hui-light-brightness-card-feature", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = '<div class="slider" style="height:42px"></div>';
    this._slider = this.shadowRoot.firstElementChild;
    this._slider.min = 1;
    this._slider.addEventListener("value-changed", (ev) => {
      ev.stopPropagation();
      this.hass.callService("light", "turn_on", { entity_id: this.context.entity_id, brightness_pct: ev.detail.value });
    });
  }

  connectedCallback() {
    this.style.cssText = "display:block;height:42px";
  }

  slide(value) {
    this._slider.dispatchEvent(new CustomEvent("value-changed", { bubbles: true, composed: true, detail: { value } }));
  }
});

// ha-state-icon: Home Assistant's state icon, the entity's own icon (shown
// here as the entity_id and state it was given)
customElements.define("ha-state-icon", class extends HTMLElement {
  connectedCallback() {
    Object.assign(this.style, { display: "inline-block", width: "24px", height: "24px" });
  }

  set stateObj(stateObj) {
    this._stateObj = stateObj;
    this.setAttribute("entity", stateObj?.entity_id ?? "");
  }

  get stateObj() {
    return this._stateObj;
  }

  // An icon given in place of the entity's
  set icon(icon) {
    this._icon = icon;
    if (icon) this.setAttribute("icon", icon);
    else this.removeAttribute("icon");
  }

  get icon() {
    return this._icon;
  }
});

// ha-tile-icon: Home Assistant's tile icon (the tile card loads it), with
// its icon in the icon slot. Interactive, a tap sends an action event, as
// Home Assistant's action handler does
customElements.define("ha-tile-icon", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `<style>
      :host { display: block; width: 36px; height: 36px; border-radius: 50%; }
    </style><slot></slot><slot name="icon"></slot>`;
    this.addEventListener("click", () => {
      if (this.interactive) this.dispatchEvent(new CustomEvent("action", { bubbles: true, composed: true, detail: { action: "tap" } }));
    });
  }
});

// ha-icon: shows its icon name
customElements.define("ha-icon", class extends HTMLElement {
  connectedCallback() {
    // Only its own size: like Home Assistant's, it keeps what the card sets (such as --spin)
    Object.assign(this.style, { display: "inline-block", width: "22px", height: "22px" });
  }
});

// ha-control-switch: Home Assistant's toggle
customElements.define("ha-control-switch", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `<style>
      :host { display: block; height: var(--feature-height, 42px); }
      .switch { position: relative; height: 100%; border-radius: var(--feature-border-radius, 12px); padding: var(--control-switch-padding, 4px); }
      .switch .background { position: absolute; inset: 0; border-radius: inherit; background: #888; opacity: .2; }
      .switch .button { width: 50%; height: 100%; border-radius: 8px; background: #888; }
    </style><div class="switch"><div class="background"></div><div class="button"><ha-svg-icon></ha-svg-icon></div></div>`;
  }
});

// hui-card-feature: one feature, with Home Assistant's properties (feature,
// context, hass, color). The feature's element is made from its type, as
// Home Assistant does, and given hass, the context, the color and its configuration
customElements.define("hui-card-feature", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  // The tile card stand-in sets everything at once
  set setup({ config, hass, entityId }) {
    this.feature = config;
    this.context = { entity_id: entityId };
    this.hass = hass;
  }

  set feature(feature) {
    this._feature = feature;
    this._render();
  }

  get feature() {
    return this._feature;
  }

  set context(context) {
    this._context = context;
    if (this.element) this.element.context = context;
    this._render();
  }

  get context() {
    return this._context;
  }

  set hass(hass) {
    this._hass = hass;
    if (this.element) this.element.hass = hass;
    this._render();
  }

  get hass() {
    return this._hass;
  }

  _render() {
    if (this.element || !this._feature || !this._context || !this._hass) return;
    if (this._feature.type === "toggle") {
      this.shadowRoot.innerHTML = "<ha-control-switch></ha-control-switch>";
      this.element = this.shadowRoot.firstElementChild;
      return;
    }
    const type = this._feature.type;
    const element = document.createElement(type.startsWith("custom:") ? type.slice(7) : `hui-${type}-card-feature`);
    element.setConfig?.(this._feature);
    element.hass = this._hass;
    element.context = this._context;
    element.color = this.color;
    this.element = element;
    this.shadowRoot.replaceChildren(element);
  }
});

// hui-card-features: a group of features
customElements.define("hui-card-features", class extends HTMLElement {
  constructor() {
    super();
    // Home Assistant's styles (hui-card-features): a grid, a second
    // column with a divider before each feature in it, and a last feature
    // alone in its row across both columns (wide)
    this.attachShadow({ mode: "open" }).innerHTML = `<style>
      :host {
        --feature-height: 42px; --feature-columns: 1; --feature-border-radius: var(--ha-card-features-border-radius, 12px);
        --feature-button-spacing: 12px;
        --feature-column-gap: var(--ha-card-feature-column-gap, var(--ha-card-feature-gap, 12px));
        --feature-divider-inset: var(--ha-card-feature-divider-inset, 0px);
        position: relative; width: 100%; display: grid; grid-template-columns: minmax(0, 1fr);
        gap: var(--ha-card-feature-gap, 12px) var(--feature-column-gap); box-sizing: border-box; align-content: space-evenly;
      }
      :host([columns="2"]) { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      :host([columns="2"]) hui-card-feature:not(.wide) { --feature-columns: 2; }
      .wide { grid-column: 1 / -1; }
      .divided {
        box-sizing: border-box; margin-inline-start: calc(-1 * var(--feature-divider-inset));
        padding-inline-start: var(--feature-divider-inset); border-inline-start: var(--ha-card-feature-divider, 1px solid #f0f);
      }
    </style>`;
  }

  set setup({ features, hass, entityId, columns }) {
    if (columns > 1) this.setAttribute("columns", String(columns));
    this.items = features.map((config, index) => {
      const item = document.createElement("hui-card-feature");
      const column = index % columns;
      item.classList.toggle("divided", column > 0);
      item.classList.toggle("wide", column === 0 && index === features.length - 1);
      item.setup = { config, hass, entityId };
      return item;
    });
    this.shadowRoot.append(...this.items);
  }

  set hass(hass) {
    for (const item of this.items ?? []) item.hass = hass;
  }
});

// ha-tile-container: Home Assistant's tile layout, its structure and styles
// as they are (the title row's content, the feature beside it, the features
// below), so the card's layout is measured against the real one
customElements.define("ha-tile-container", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" }).innerHTML = `<style>
      :host { height: 100%; width: 100%; display: flex; flex-direction: column; justify-content: space-between; }
      .container { margin: calc(-1 * var(--ha-card-border-width, 1px)); display: flex; flex-direction: column; flex: 1; }
      .row { display: flex; flex-direction: column; flex: 1; min-width: 0; }
      .container.inline .row { flex-direction: row; }
      .content {
        position: relative; display: flex; flex-direction: row; align-items: center; padding: 0 10px;
        min-height: var(--row-height, 56px); flex: 1; min-width: 0; box-sizing: border-box; gap: 10px;
      }
      .vertical { flex-direction: column; text-align: center; justify-content: center; padding: 10px var(--ha-space-2, 8px); }
      .info { display: flex; width: 100%; min-width: 0; }
      .vertical .info, .vertical ::slotted([slot="info"]) { width: 100%; flex: none; }
      ::slotted([slot="icon"]) { position: relative; padding: 6px; margin: -6px; }
      ::slotted([slot="info"]) { position: relative; min-width: 0; box-sizing: border-box; }
      ::slotted([slot="features"]) { padding: 0 var(--ha-space-3, 12px) var(--ha-space-3, 12px) var(--ha-space-3, 12px); }
      .container.inline ::slotted([slot="features-inline"]) {
        width: calc(50% - var(--column-gap, 0px) / 2 - var(--ha-space-3, 12px)); --feature-columns: 2; flex: none;
        padding: 0 var(--ha-space-3, 12px); padding-inline-start: 0;
      }
      .container.inline:not(.has-features-below) ::slotted([slot="features-inline"]),
      .container.inline:not(.fixed-height) ::slotted([slot="features-inline"]) { --feature-height: var(--ha-space-9, 36px); }
      .container.inline.has-features-below ::slotted([slot="features"]) {
        --ha-card-feature-column-gap: calc(var(--column-gap, 0px) + var(--ha-space-3, 12px) * 2);
        --ha-card-feature-divider: 1px solid var(--ha-color-border-neutral-quiet, #888);
        --ha-card-feature-divider-inset: calc(var(--ha-space-3, 12px) + var(--column-gap, 0px) / 2);
      }
    </style><div class="container"><div class="row"><div class="content"><slot name="icon"></slot>
      <div class="info" id="info"><slot name="info"></slot></div></div><slot name="features-inline"></slot></div>
      <slot name="features"></slot></div>`;
  }

  /** featurePosition, vertical and whether features show below, as Home Assistant sets them. */
  set layout({ featurePosition, vertical, below }) {
    const container = this.shadowRoot.querySelector(".container");
    container.classList.toggle("inline", featurePosition === "inline");
    container.classList.toggle("has-features-below", featurePosition === "inline" && below);
    this.shadowRoot.querySelector(".content").classList.toggle("vertical", !!vertical);
  }
});

// hui-tile-card: the tile card, with the options the Prusa Connect card relies on,
// in Home Assistant's tile layout (ha-tile-container)
customElements.define("hui-tile-card", class extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.updateComplete = Promise.resolve();
  }

  static async getConfigElement() {
    return document.createElement("hui-tile-card-editor");
  }

  setConfig(config) {
    this.config = config;
    this.built = false;
    this.render();
  }

  set hass(hass) {
    this._hass = hass;
    this.render();
  }

  get hass() {
    return this._hass;
  }

  render() {
    if (!this.config || !this._hass) return;
    const stateObj = this._hass.states[this.config.entity];
    const picture = this.config.show_entity_picture ? stateObj.attributes.entity_picture : null;
    if (!this.built) {
      this.built = true;
      this.shadowRoot.innerHTML = `<style>
        :host { display: block; height: 100%; }
        ha-card { display: block; height: 100%; box-sizing: border-box; position: relative;
          background: var(--ha-card-background, var(--card-background-color, #222));
          border: 1px solid var(--ha-card-border-color, #444); border-radius: var(--ha-card-border-radius, 12px); }
        ha-tile-icon { display: block; width: 36px; height: 36px; border-radius: 50%; flex: none; }
        img { width: 36px; height: 36px; display: block; border-radius: 50%; }
        ha-tile-info { display: block; color: var(--primary-text-color, #fff); }
        .primary { font-size: 14px; line-height: 20px; font-weight: 500; }
        .secondary { font-size: 12px; line-height: 16px; }
      </style><ha-card><ha-tile-container><ha-tile-icon slot="icon"></ha-tile-icon>
        <ha-tile-info slot="info"><div class="primary">Printer</div><div class="secondary"></div></ha-tile-info></ha-tile-container></ha-card>`;
      // Like the tile card: features below, or with "inline" the first one beside the title
      const features = this.config.features ?? [];
      // Home Assistant's computeCardFeatureLayout: with "inline" the first beside the title, the rest below in up to two columns
      const inline = this.config.features_position === "inline";
      const beside = inline ? features.slice(0, 1) : [];
      const below = inline ? features.slice(1) : features;
      const container = this.shadowRoot.querySelector("ha-tile-container");
      container.layout = { featurePosition: this.config.features_position, vertical: this.config.vertical, below: below.length > 0 };
      this.groups = [];
      for (const [list, slot] of [[beside, "features-inline"], [below, "features"]]) {
        if (!list.length) continue;
        const group = document.createElement("hui-card-features");
        group.slot = slot;
        group.setup = { features: list, hass: this._hass, entityId: this.config.entity, columns: slot === "features" && inline ? Math.min(list.length, 2) : 1 };
        container.append(group);
        this.groups.push(group);
      }
    }
    this.shadowRoot.querySelector("ha-tile-icon").innerHTML = picture ? `<img src="${picture}">` : "icon";
    // The state content: the state and the attributes chosen
    const content = [].concat(this.config.state_content ?? ["state"]);
    this.shadowRoot.querySelector("ha-tile-info .secondary").textContent =
      content.map((name) => (name === "state" ? stateObj.state : stateObj.attributes[name])).filter(Boolean).join(" · ");
    for (const group of this.groups ?? []) group.hass = this._hass;
  }

  // Home Assistant's: a row for the title (two when vertical) and one for each feature below
  getGridOptions() {
    const features = this.config?.features ?? [];
    const inline = this.config?.features_position === "inline";
    const below = inline ? features.length - 1 : features.length;
    const rows = 1 + Math.ceil(below / (inline ? Math.max(Math.min(below, 2), 1) : 1)) + (this.config?.vertical ? 1 : 0);
    return { columns: 6, rows, min_columns: this.config?.vertical ? 3 : features.length && this.config?.features_position === "inline" ? 12 : 6, min_rows: rows };
  }
});

// hui-tile-card-editor: the tile card's editor, with its form layout in _schema
customElements.define("hui-tile-card-editor", class extends HTMLElement {
  constructor() {
    super();
    this._schema = () => [
      { name: "entity", selector: { entity: {} } },
      {
        name: "content", type: "expandable", flatten: true, schema: [
          { name: "name", selector: { entity_name: {} } },
          { name: "", type: "grid", schema: [{ name: "icon" }, { name: "color" }, { name: "show_entity_picture" }, { name: "hide_state" }] },
        ],
      },
    ];
  }

  // Like Home Assistant's, it refuses options it does not know
  setConfig(config) {
    const known = ["type", "view_layout", "layout_options", "grid_options", "visibility", "entity", "name", "icon", "color",
      "show_entity_picture", "hide_state", "state_content", "vertical", "tap_action", "hold_action", "double_tap_action",
      "icon_tap_action", "icon_hold_action", "icon_double_tap_action", "features", "features_position", "time_format"];
    const unknown = Object.keys(config).find((key) => !known.includes(key));
    if (unknown) throw new Error(`At path: ${unknown} -- Expected a value of type \`never\``);
    this.config = config;
    this.schemaNames = JSON.stringify(this._schema());
  }
});

// ha-form and ha-expansion-panel: hold what they are given
customElements.define("ha-form", class extends HTMLElement {});
customElements.define("ha-expansion-panel", class extends HTMLElement {});

window.cardHelperCalls = [];
window.loadCardHelpers = async () => ({
  createCardElement: (config) => {
    window.cardHelperCalls.push(config);
    // A picture card brings hui-image with it, as in Home Assistant
    if (config.type === "picture-entity" && !customElements.get("hui-image")) setTimeout(() => window.defineHuiImage(), 10);
    return document.createElement(config.type === "tile" ? "hui-tile-card" : config.type === "history-graph" ? "hui-history-graph-card" : "div");
  },
  // An entity row: a number row brings Home Assistant's input with it
  createRowElement: (config) => {
    window.cardHelperCalls.push({ row: config });
    if (!customElements.get("ha-input")) setTimeout(() => window.defineInput(), 10);
    return document.createElement("div");
  },
});

// Home Assistant's action handling (its action mixin and handle-action): a
// hass-action with a confirmation waits for an answer (window.confirming,
// answered with window.confirming.answer(true or false)); one without is
// performed at once, with the hass of the element that sent it
window.actions = [];
window.confirming = null;
document.addEventListener("hass-action", (ev) => {
  const action = ev.detail.config.tap_action;
  const hass = ev.composedPath()[0]._hass;
  window.actions.push(ev.detail);
  const perform = () => {
    const [domain, service] = action.perform_action.split(".");
    hass.callService(domain, service, action.data, action.target);
  };
  if (!action.confirmation) {
    perform();
    return;
  }
  window.confirming = {
    ...action.confirmation,
    answer: (ok) => {
      window.confirming = null;
      if (ok) perform();
    },
  };
});
