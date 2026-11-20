// Rows of a feature's items: each item takes at least its minimum width, and
// a row that does not wrap leaves out the items that do not fit.
import { css, unsafeCSS } from "lit";

// The narrowest each kind of item in a row may be (px): a key as Home
// Assistant's tile icon; a field, read-out and slider need room for their numbers
export const ITEM_MIN = { key: 36, readout: 72, field: 72, slider: 72, wide: 120 };

/** An item's narrowest width (px). */
const itemMin = (el: Element): number => Number((el as HTMLElement).dataset.min) || ITEM_MIN.key;

/**
 * Fit a row's items into its width, in order: each takes at least its
 * minimum, and from the first that does not fit on, the items are left out
 * (data-dropped). A row that wraps leaves none out.
 */
export function fitRow(row: HTMLElement): void {
  const width = row.clientWidth;
  if (!width) return;
  if (row.classList.contains("wraps")) {
    for (const item of row.children) item.removeAttribute("data-dropped");
    return;
  }
  const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
  let used = 0, shown = 0, full = false;
  for (const item of row.children) {
    if ((item as HTMLElement).hidden) continue;
    const need = itemMin(item) + (shown ? gap : 0);
    full ||= used + need > width + 0.5;
    item.toggleAttribute("data-dropped", full);
    if (!full) {
      used += need;
      shown += 1;
    }
  }
}

/** Fits rows now and whenever their width changes. */
export class RowFitter {
  private _observer = new ResizeObserver((entries) => entries.forEach((entry) => fitRow(entry.target as HTMLElement)));
  private _rows = new WeakSet<Element>();

  fit(rows: Iterable<HTMLElement>): void {
    for (const row of rows) {
      if (!this._rows.has(row)) {
        this._rows.add(row);
        this._observer.observe(row);
      }
      fitRow(row);
    }
  }
}

// One line of items that fills the row (see fitRow), or (wraps) a grid of
// equal cells, as many as fit
export const rowStyles = css`
  .rows { display: flex; flex-direction: column; gap: var(--ha-card-feature-gap, 12px); }
  .row { display: flex; flex-wrap: nowrap; align-items: center; column-gap: var(--feature-button-spacing, 12px); height: var(--feature-height, 42px); }
  .row.wraps {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(${unsafeCSS(ITEM_MIN.field)}px, 1fr)); height: auto;
    gap: var(--ha-card-feature-gap, 12px) var(--feature-button-spacing, 12px);
  }
  .row.wraps > * { height: var(--feature-height, 42px); min-width: 0; }
  .row [data-dropped] { display: none !important; }
  .row .key { flex: 1 1 0; min-width: ${unsafeCSS(ITEM_MIN.key)}px; }
  .row .slide { flex: 2 1 0; min-width: ${unsafeCSS(ITEM_MIN.slider)}px; }
  .row .field { flex: 1 1 0; min-width: ${unsafeCSS(ITEM_MIN.field)}px; }
  .row .field.readout.wide { flex: 2 1 0; min-width: ${unsafeCSS(ITEM_MIN.wide)}px; }
`;
