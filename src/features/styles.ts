// The features' look: keys, read-outs and fields, as Home Assistant's own
// features draw them, in the theme's radius and spacing.
import { css, unsafeCSS } from "lit";
import { ENABLED } from "../const";
import { rowStyles } from "./rows";

const enabled = unsafeCSS(ENABLED);

// Console (the prusa-console attribute): the buttons become keys that press in
const keyStyles = css`
  :host([prusa-console]) .key {
    background-image: linear-gradient(180deg, rgba(255,255,255,.35), rgba(255,255,255,0) 45%, rgba(0,0,0,.18));
    box-shadow: inset 0 1px 0 rgba(255,255,255,.55), inset 0 -2px 2px rgba(0,0,0,.3), 0 2px 3px rgba(0,0,0,.5);
    transition: transform 120ms ease-in-out, box-shadow 120ms ease-in-out;
  }
  :host([prusa-console]) .key:not(:disabled):active,
  :host([prusa-console]) .key:not(:disabled)[aria-pressed="true"] {
    transform: translateY(1px);
    background-image: linear-gradient(180deg, rgba(0,0,0,.28), rgba(0,0,0,.06) 40%, rgba(255,255,255,.1));
    box-shadow: inset 0 3px 6px rgba(0,0,0,.55), inset 0 1px 2px rgba(0,0,0,.4), inset 0 -1px 0 rgba(255,255,255,.25);
  }
  :host([prusa-console]) .key:disabled { background-image: none; box-shadow: none; transform: none; }
`;

export const featureStyles = [rowStyles, css`
  :host { display: block; min-width: 0; max-width: 100%; }
  .field {
    position: relative; display: flex; align-items: center; justify-content: center; gap: 2px; height: 100%; box-sizing: border-box;
    padding: 0 6px; border-radius: var(--feature-border-radius, 12px); overflow: hidden; cursor: text;
    color: var(--prusa-text, var(--primary-text-color)); font-weight: var(--ha-font-weight-medium, 500);
  }
  .field::before { content: ""; position: absolute; inset: 0; background: var(--feature-color, ${enabled}); opacity: .2; }
  /* On a style with a door, a number field is a pane of the door's glass, in its text color */
  .field:not(.readout):not(.disabled) { color: var(--prusa-field-text, var(--prusa-text, var(--primary-text-color))); box-shadow: var(--prusa-field-edge, none); }
  .field:not(.readout):not(.disabled)::before { background: var(--prusa-field, var(--feature-color, ${enabled})); opacity: var(--prusa-field-opacity, .2); }
  .field:focus-within { outline: 2px solid var(--feature-color, ${enabled}); outline-offset: 2px; }
  .field > * { position: relative; }
  .field input {
    flex: 1 1 0; width: 0; min-width: 0; margin: 0; padding: 0; border: 0; outline: none; background: transparent;
    font: inherit; color: inherit; text-align: right; font-variant-numeric: tabular-nums;
  }
  .field .unit { flex: 1 1 0; min-width: 0; text-align: left; opacity: .8; white-space: nowrap; }
  .field ha-state-icon { flex: none; --mdc-icon-size: 22px; margin-right: 4px; }
  .field.disabled { cursor: default; color: var(--disabled-text-color, #bdbdbd); }
  .field.disabled::before { background: var(--disabled-color, #bdbdbd); opacity: .2; }
  .field.drag { touch-action: none; cursor: ew-resize; }
  .field.sliding::before { opacity: .45; }
  /* A read-out: a field that is only shown, its icon in its color; a tap opens it */
  .field.readout { cursor: pointer; gap: 6px; padding: 0 6px; font-size: var(--ha-font-size-s, 12px); min-width: 0; }
  .field.readout::before { background: var(--c, ${enabled}); }
  .field.readout:focus-visible { outline: 2px solid var(--c, ${enabled}); outline-offset: 2px; }
  .field.readout ha-state-icon, .field.readout ha-icon { flex: none; --mdc-icon-size: 22px; color: var(--c, ${enabled}); }
  .field.readout span { font-variant-numeric: tabular-nums; }
  /* A flag that is off: in the quiet tone */
  .field.readout.dim { color: var(--secondary-text-color); }
  .field.readout.dim ha-state-icon { color: var(--secondary-text-color); }
  .field.readout.dim::before { background: var(--disabled-color, #bdbdbd); }
  /* A heater, as Prusa Connect draws it: the tint says what it does, the
     arrow which way the number goes, and it pulses while it heats. Off reads
     in the quiet tone, with Off under the number */
  .heat { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
  .heat .arrow { --mdc-icon-size: 14px; margin-left: -3px; }
  .heating .heat { color: var(--prusa-heating); animation: prusa-heating 2s ease-in-out infinite; }
  .heating ha-state-icon { color: var(--prusa-heating); }
  .cooling .heat, .cooling ha-state-icon { color: var(--prusa-cooling); }
  .off .heat, .off ha-state-icon { color: var(--secondary-text-color); }
  .two { display: grid; line-height: 1.1; min-width: 0; text-align: left; }
  .note { font-size: 10px; font-weight: 400; color: var(--secondary-text-color); text-transform: uppercase; letter-spacing: .03em; }
  @keyframes prusa-heating { 0%, 100% { opacity: 1; } 50% { opacity: .45; } }
  /* A heater and its target as one field: the numbers alone (the units are implied), centered on each other */
  .field.pair { justify-content: center; gap: 6px; padding: 0 8px; }
  .field.pair .icon { position: relative; display: flex; flex: none; overflow: visible; }
  .field.pair ha-state-icon { margin-right: 0; }
  .field.pair .two { display: flex; flex-direction: column; line-height: 1.15; flex: 0 1 auto; min-width: 0; text-align: center; overflow: visible; }
  .field.pair .heat { display: flex; justify-content: center; overflow: visible; }
  /* The reading is the field's point: it is never shrunk or cut short */
  .field.pair .now { flex: none; overflow: visible; text-overflow: clip; font-variant-numeric: tabular-nums; }
  /* The higher number on top: the target while it is above the reading */
  .field.pair .two.above .target { order: -1; }
  /* In the heater's history colors: the reading's, and its target's (dimmed) */
  .field.pair .heat, .field.pair ha-state-icon { color: var(--prusa-reading, inherit); }
  .field.pair .target { color: var(--prusa-target, var(--secondary-text-color)) !important; }
  /* Heating or cooling: an arrow over the icon, red or blue, outlined so it stands off the icon */
  .field.pair .arrow {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); --mdc-icon-size: 28px; pointer-events: none;
    filter: drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000) drop-shadow(0 0 1.5px #000) drop-shadow(0 0 3px rgba(0, 0, 0, .7));
  }
  /* At its target: the reading alone, larger, filling the field (a tap brings the target back, to type in) */
  .field.pair .two.settled .target { display: none; }
  .field.pair { container-type: inline-size; }
  /* As large as the field has room for (beside the icon), up to half as large again */
  .field.pair .two.settled .now, .field.pair .two.sliding .target { font-size: clamp(1em, calc((100cqi - 48px) / 3), 1.5em); line-height: 1; }
  /* Sliding: the target alone, in the field's own weight and the reading's color (not dimmed) */
  .field.pair .two.sliding .heat { display: none; }
  .field.pair .two.sliding .target { font-weight: inherit; color: var(--prusa-reading, inherit) !important; }
  .field.pair.heating .arrow { color: var(--red-color, #f44336); }
  .field.pair.cooling .arrow { color: var(--blue-color, #2196f3); }
  .field.pair .target { display: flex; justify-content: center; min-width: 0; font-size: 11px; font-weight: 400; }
  .field.pair .target input { flex: 0 1 auto; text-align: center; }
  .field.pair .target input::placeholder { color: inherit; opacity: 1; text-transform: uppercase; letter-spacing: .03em; }
  .key {
    min-width: 0; height: 100%; padding: 0 4px; border: 0; cursor: pointer; box-sizing: border-box;
    position: relative; overflow: hidden; display: flex; align-items: center; justify-content: center; gap: 6px;
    border-radius: var(--feature-border-radius, 12px);
    background: var(--prusa-feature-backing, var(--prusa-feature-scrim, transparent));
    color: var(--prusa-text, var(--primary-text-color)); font: inherit; font-size: var(--ha-font-size-s, 12px); font-weight: 500;
  }
  .key::before { content: ""; position: absolute; inset: 0; background: var(--c, ${enabled}); opacity: .2; transition: opacity 180ms ease-in-out; }
  .key[aria-pressed="false"]::before { background: var(--disabled-color, #bdbdbd); }
  .key:hover::before { opacity: .35; }
  .key[aria-pressed="true"]::before { opacity: 1; }
  .key[aria-pressed="true"] { color: var(--prusa-on-color, #fff); }
  .key:focus-visible { outline: 2px solid var(--c, ${enabled}); outline-offset: 2px; }
  .key:disabled, .key.disabled { cursor: default; color: var(--disabled-text-color, #bdbdbd); }
  .key:disabled::before, .key:disabled:hover::before, .key.disabled::before { background: var(--disabled-color, #bdbdbd); opacity: .2; }
  .key > * { position: relative; }
  .key ha-icon, .key ha-state-icon { flex: none; --mdc-icon-size: 22px; }
  .key .mod { font-weight: 700; font-size: 13px; margin-left: -4px; }
  /* A key that opens a menu (Presets): the browser's own list, over the whole key */
  .key select { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font: inherit; }
  .key select:disabled { cursor: default; }
  /* A fan's icon turns while it runs, faster at a higher speed */
  .spin { animation: prusa-spin var(--spin, 1.2s) linear infinite; }
  @keyframes prusa-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .spin, .heating .heat { animation: none; } }
  span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
`, keyStyles];
