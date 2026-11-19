/**
 * Checks for the Prusa Connect card test pages. A page runs its checks in an async
 * function passed to runChecks(); the results go into <pre id="report">,
 * whose data-result is "pass" or "fail" (read by run_card_tests.py).
 */

const problems = [];
const passed = [];
window.addEventListener("error", (ev) => problems.push(`Page error: ${ev.message} (${ev.filename}:${ev.lineno})`));
window.addEventListener("unhandledrejection", (ev) => problems.push(`Unhandled promise rejection: ${ev.reason}`));
const consoleError = console.error;
console.error = (...args) => {
  problems.push(`console.error: ${args.join(" ")}`);
  consoleError(...args);
};
// The card warns instead of failing when it cannot style a part; a test fails on it
const consoleWarn = console.warn;
console.warn = (...args) => {
  problems.push(`console.warn: ${args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : a)).join(" ")}`);
  consoleWarn(...args);
};

window.check = (title, ok, message) => (ok ? passed.push(`${title}: ${message}`) : problems.push(`${title}: ${message}`));
window.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Elements matching a selector anywhere inside an element and its shadow roots. */
window.deep = (el, selector) => {
  const roots = [el, ...(el.shadowRoot ? [el.shadowRoot] : [])];
  const out = [];
  for (const root of roots) {
    out.push(...root.querySelectorAll(selector));
    for (const child of root.querySelectorAll("*")) if (child.shadowRoot) out.push(...deep(child, selector));
  }
  return [...new Set(out)];
};

/**
 * Add a Prusa Connect card to the page: without a printer style and expanded at
 * load unless the test sets them (the card's defaults are the printer's style
 * and collapsed: see the "defaults" checks, which use addDefaultCard).
 */
window.addCard = (title, config, options) => addDefaultCard(title, { style: { family: "none" }, expanded_at_load: true, ...config }, options);

/** Add a Prusa Connect card to the page, with the card's own defaults. */
window.addDefaultCard = (title, config, { height = 120, width = 420, hass } = {}) => {
  const figure = document.createElement("figure");
  figure.innerHTML = `<figcaption>${title}</figcaption>`;
  const cell = document.createElement("div");
  cell.style.cssText = `width:${width}px;height:${typeof height === "number" ? `${height}px` : height}`;
  const card = document.createElement("prusa-connect-card");
  card.setConfig({ type: "custom:prusa-connect-card", entity: "sensor.office_core_one_state", ...config });
  card.hass = hass ?? makeHass();
  cell.append(card);
  figure.append(cell);
  document.getElementById("cards").append(figure);
  return card;
};

/** Add Home Assistant's tile card (the stand-in, in its real layout) to the page, in a cell of the same size. */
window.addCoreTile = (title, config, { height = 120, width = 420, hass } = {}) => {
  const figure = document.createElement("figure");
  figure.innerHTML = `<figcaption>${title}</figcaption>`;
  const cell = document.createElement("div");
  cell.style.cssText = `width:${width}px;height:${typeof height === "number" ? `${height}px` : height}`;
  const tile = document.createElement("hui-tile-card");
  tile.setConfig({ type: "tile", entity: "sensor.office_core_one_state", ...config });
  tile.hass = hass ?? makeHass();
  cell.append(tile);
  figure.append(cell);
  document.getElementById("cards").append(figure);
  return tile;
};

/** A grid cell's height for rows (Home Assistant's sections: 56 px rows, 8 px apart). */
window.rowsHeight = (rows) => rows * 56 + (rows - 1) * 8;

/** Add one feature on its own (as in a plain tile card) to the page. */
window.addFeature = (config, { hass, entityId = "sensor.office_core_one_state" } = {}) => {
  const element = document.createElement(config.type.replace("custom:", ""));
  element.setConfig(config);
  element.hass = hass ?? makeHass();
  element.context = { entity_id: entityId };
  const cell = document.createElement("div");
  cell.style.cssText = "width:420px;margin:8px 0";
  cell.append(element);
  document.getElementById("cards").append(cell);
  return element;
};

window.runChecks = (checks) => {
  setTimeout(async () => {
    try {
      await checks();
    } catch (err) {
      problems.push(`Checks failed: ${err.message} ${err.stack}`);
    }
    const report = document.getElementById("report");
    report.dataset.result = problems.length ? "fail" : "pass";
    report.textContent = [...problems.map((p) => `FAIL ${p}`), ...passed.map((p) => `ok   ${p}`)].join("\n");
  }, 300);
};
