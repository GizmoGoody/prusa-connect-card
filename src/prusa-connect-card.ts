// Prusa Connect dashboard card and tile features, for the prusa_connect
// integration (Prusa Connect, on premise). The card and its features follow
// the xTool card's design: Home Assistant's tile card, wrapped, with
// features that work in any tile card for a printer.
//
// Tile features (each a section of the printer's page in Prusa Connect):
// - custom:prusa-print         Pause print, Resume print, Stop print, and the job's read-outs
// - custom:prusa-temperatures  each heater's reading, its target, or both as one control;
//                              the chamber fan; presets; cool down
// - custom:prusa-history       Home Assistant's history graph of the temperatures
// - custom:prusa-nozzles       one row for each tool: material, nozzle, active, fan speeds
// - custom:prusa-movement      print speed and flow, X, Y and Z, home, disable steppers
// - custom:prusa-lights        the chamber light's icon and brightness slider
// - custom:prusa-utilities     beep and reset printer
// - custom:prusa-cameras       a camera, with keys to switch and a crop set with two taps
//
// Some controls are not offered by the integration yet (see PENDING in
// printer/controls.ts): they show once the integration adds their entities.
import { printBadge } from "@gizmogoody/card-badge";
import { CARD_TYPE, EDITOR_TYPE, FEATURE_EDITOR_TYPE, VERSION } from "./const";
import { define } from "./ha";
import { PrusaConnectCard } from "./card/card";
import { PrusaConnectCardEditor } from "./editor/card-editor";
import { PrusaFeatureEditor } from "./editor/feature-editor";
import { PrusaField } from "./features/field";
import { FEATURES } from "./features";
import { deviceOf, isPrusa } from "./printer/device";

if (!customElements.get(CARD_TYPE)) {
  define("prusa-field", PrusaField);
  for (const [tag, feature] of Object.entries(FEATURES)) define(tag, feature);
  define(FEATURE_EDITOR_TYPE, PrusaFeatureEditor);
  define(CARD_TYPE, PrusaConnectCard);
  define(EDITOR_TYPE, PrusaConnectCardEditor);

  window.customCardFeatures = window.customCardFeatures || [];
  window.customCardFeatures.push(...Object.values(FEATURES).map((feature) => ({
    type: feature.type,
    name: feature.pickerName,
    isSupported: (hass: Parameters<typeof deviceOf>[0], context?: { entity_id?: string }) =>
      isPrusa(hass, context?.entity_id) && feature.supports(deviceOf(hass, context?.entity_id), hass!),
    configurable: true,
  })));

  window.customCards = window.customCards || [];
  window.customCards.push({
    type: CARD_TYPE,
    name: "Prusa Connect",
    description: "A tile card for a printer in Prusa Connect: its state, a progress edge, status and connection badges, and an optional Prusa style.",
    preview: true,
    documentationURL: "https://github.com/GizmoGoody/prusa-connect-card#configuration",
  });

  printBadge({
    icon: "🖨️",
    name: "Prusa Connect Card",
    version: VERSION,
    description: "Prusa printers at a glance: job, temperatures, history and cameras.",
    repo: "prusa-connect-card",
  });
}
