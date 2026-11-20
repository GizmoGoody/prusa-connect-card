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
  /* A heater and its target as one field: the reading over the target (Off at 0), centered */
  .field.pair { justify-content: center; gap: 6px; padding: 0 10px; }
  .field.pair ha-state-icon { margin-right: 0; }
  .field.pair .two { line-height: 1.15; flex: 0 1 auto; text-align: center; }
  .field.pair .heat { display: flex; justify-content: center; gap: 2px; }
  .field.pair .now { font-variant-numeric: tabular-nums; }
  .field.pair .target { display: flex; justify-content: center; min-width: 0; font-size: 11px; font-weight: 400; color: var(--secondary-text-color); }
  .field.pair .target input { flex: 0 1 auto; text-align: center; }
  .field.pair .target input::placeholder { color: inherit; opacity: 1; text-transform: uppercase; letter-spacing: .03em; }
  .field.pair .target .unit { flex: 0 1 auto; }
  .field.pair.unset .unit { display: none; }
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
