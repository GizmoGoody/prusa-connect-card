import { css } from "lit";

export const cardStyles = css`
  :host { display: block; height: 100%; }
  .frame {
    position: relative; height: 100%; box-sizing: border-box; isolation: isolate;
    border-radius: var(--ha-card-border-radius, var(--ha-border-radius-lg, 12px));
  }
  .clip { position: absolute; inset: 0; border-radius: inherit; overflow: hidden; pointer-events: none; }
  .clip.over { z-index: 2; }
  .tile { position: relative; display: block; height: 100%; --ha-card-feature-divider: none; }

  /* The style: the frame behind everything, the door behind the title */
  #body, #door { position: absolute; display: none; }
  .styled #body { display: block; inset: 0; background: var(--prusa-body); }
  .styled.glazed #door {
    display: block; overflow: hidden; border-radius: max(4px, calc(var(--ha-card-border-radius, 12px) - 5px));
    background: var(--prusa-glass); box-shadow: var(--prusa-edge);
  }
  #door::after { content: ""; position: absolute; inset: 0; background: var(--prusa-gloss); }
  /* The RGB status bar's light, rising from the bottom of the door */
  #door::before {
    content: ""; position: absolute; inset: 0; opacity: 0; pointer-events: none;
    background: radial-gradient(120% 90% at 50% 125%, rgb(var(--prusa-bar, 0 0 0) / .65) 0%, rgb(var(--prusa-bar, 0 0 0) / 0) 65%);
  }
  #door[data-bar]::before { opacity: 1; }
  #door[data-bar="warning"]::before { animation: prusa-bar 2s ease-in-out infinite; }
  #door[data-bar="error"]::before { animation: prusa-bar 1s ease-in-out infinite; }
  @keyframes prusa-bar { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { #door[data-bar]::before { animation: none; } }
  .styled::after {
    content: ""; position: absolute; inset: 0; border-radius: inherit; pointer-events: none; z-index: 3;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, .3), inset 0 -1px 0 rgba(0, 0, 0, .4);
  }
  .styled .tile {
    --ha-card-background: transparent; --card-background-color: transparent;
    --ha-card-box-shadow: none; --ha-card-border-color: transparent; --ha-card-backdrop-filter: none;
  }
  .tile.dark {
    --primary-text-color: rgba(255, 255, 255, .95); --secondary-text-color: rgba(235, 235, 240, .7);
    --disabled-text-color: rgba(255, 255, 255, .38);
    --prusa-text: rgba(255, 255, 255, .95); text-shadow: 0 1px 2px rgba(0, 0, 0, .8);
    --prusa-feature-scrim: rgba(0, 0, 0, .45);
  }
  .tile.light {
    --primary-text-color: rgba(0, 0, 0, .85); --secondary-text-color: rgba(40, 40, 48, .62);
    --disabled-text-color: rgba(0, 0, 0, .38);
    --prusa-text: rgba(0, 0, 0, .85); --prusa-feature-scrim: rgba(255, 255, 255, .45);
  }
  .tile.dark.solid { --prusa-feature-backing: #1e1f22; }
  .tile.light.solid { --prusa-feature-backing: #eceef1; }
  #areas { position: absolute; inset: 0; }
  .area { position: absolute; box-sizing: border-box; }
  .area.flat { background: var(--flat); box-shadow: 0 0 3px 1px var(--flat); }
  .area.console {
    background: linear-gradient(180deg, rgba(0, 0, 0, .22), rgba(0, 0, 0, .08));
    box-shadow:
      inset 0 2px 3px rgba(0, 0, 0, .55), inset 0 1px 1px rgba(0, 0, 0, .4),
      inset 0 -1px 0 rgba(255, 255, 255, .14), 0 1px 0 rgba(255, 255, 255, .18);
  }

  /* The progress edge */
  #edge { position: absolute; display: none; overflow: hidden; }
  #edge.on { display: block; }
  #edge.around {
    inset: 0; border-radius: inherit; box-sizing: border-box;
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask-composite: exclude;
  }
  #edge .sweep { position: absolute; display: none; border-radius: 3px; }
  #edge.indeterminate .sweep { display: block; }
  #edge.indeterminate.horizontal .sweep { top: 0; bottom: 0; width: 30%; animation: sweep-x 2.2s ease-in-out infinite; }
  #edge.indeterminate.vertical .sweep { left: 0; right: 0; height: 30%; animation: sweep-y 2.2s ease-in-out infinite; }
  #edge.indeterminate.around { animation: pulse 2s ease-in-out infinite; }
  @keyframes sweep-x { from { left: -30%; } to { left: 100%; } }
  @keyframes sweep-y { from { top: -30%; } to { top: 100%; } }
  @keyframes pulse { 0%, 100% { opacity: .35; } 50% { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    #edge.indeterminate .sweep, #edge.indeterminate.around { animation: none; }
    #edge.indeterminate.horizontal .sweep { left: 35%; }
    #edge.indeterminate.vertical .sweep { top: 35%; }
  }
  #pct {
    position: absolute; right: 16px; bottom: 12px; display: none;
    font: 700 14px/1 var(--ha-font-family-body, inherit); text-shadow: 0 1px 3px rgba(0, 0, 0, .8);
  }
  #pct.on { display: block; }

  /* The badges on the icon: the status badge at the top right, the connection badge at the bottom right */
  .badge {
    position: absolute; z-index: 3; width: 18px; height: 18px; margin: -9px 0 0 -9px; box-sizing: border-box;
    display: none; place-items: center; border-radius: 50%; pointer-events: none; overflow: hidden; line-height: 0;
    border: 2px solid var(--prusa-badge-ring, var(--ha-card-background, var(--card-background-color, #fff)));
    color: #fff; font: 700 10px/1 var(--ha-font-family-body, inherit); text-shadow: none;
  }
  .badge.on { display: grid; }
  .badge ha-state-icon {
    position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
    --mdc-icon-size: 12px; --ha-icon-display: flex;
  }
  .badge ha-state-icon[hidden] { display: none; }
  .badge .text { position: relative; line-height: 1; }
  .badge .text:empty { display: none; }
  .styled .badge { --prusa-badge-ring: rgba(0, 0, 0, .55); }
`;

// The state's icon in its color, from inside the tile card: its icon moves
// as the state does (a nozzle that bobs while printing, an alert that
// blinks). If Home Assistant renames that part, the icon stays still.
export const STATE_SHEET = `
  :host([prusa-state-color]) ha-tile-icon { --tile-icon-color: var(--prusa-state-color) !important; }
  :host([prusa-phase="printing"]) ha-tile-icon ha-state-icon { animation: prusa-bob 1.6s ease-in-out infinite; }
  :host([prusa-phase="idle"]) ha-tile-icon ha-state-icon { animation: prusa-breathe 3.2s ease-in-out infinite; }
  :host([prusa-phase="attention"]) ha-tile-icon ha-state-icon,
  :host([prusa-phase="error"]) ha-tile-icon ha-state-icon { animation: prusa-blink 1.2s step-end infinite; }
  @keyframes prusa-bob { 0%, 100% { transform: translateY(-1.5px); } 50% { transform: translateY(1.5px); } }
  @keyframes prusa-breathe { 0%, 100% { opacity: .55; } 50% { opacity: 1; } }
  @keyframes prusa-blink { 50% { opacity: .35; } }
  @media (prefers-reduced-motion: reduce) { ha-tile-icon ha-state-icon { animation: none !important; } }`;

// No divider before a feature in a second column; the feature beside the title keeps a steady height
export const PLAIN_SHEET = `
  .divided { border-inline-start: none !important; margin-inline-start: 0 !important; padding-inline-start: 0 !important; }
  :host([slot="features-inline"]) { --feature-height: var(--ha-space-9, 36px) !important; }`;
