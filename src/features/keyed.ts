// The features made only of rows of keys: Prusa print, temperatures,
// nozzles, movement and utilities.
import { JOB_PHASES } from "../const";
import type { HomeAssistant } from "../ha";
import { controlOf, heaterIds, pairOf, targetOf } from "../printer/controls";
import type { Device } from "../printer/device";
import { PrusaFeature } from "./base";
import { itemsOf, type Item } from "./keys";

// The print: Pause print or Resume print (one key), the keys on their own,
// Stop print (asking first), and the job's read-outs
export class PrusaPrint extends PrusaFeature {
  static override label = "Print";
  static override pickerName = "Prusa print";
  static override controls = ["pause_resume", "pause", "resume", "stop", "progress", "time_remaining", "time_printing", "finish_time", "job_name"];
  static override defaults = ["pause_resume", "stop", "time_remaining", "progress"];
  static override form = {
    label: "Controls",
    helper: "Pause print or Resume print is one key: Resume print while the print is paused, Pause print otherwise.",
    options: [{ name: "ask_before_stopping", label: "Ask before stopping a print" }],
  };
}

// Temperatures: each heater's reading, its target (a field), or both as one
// control; the chamber fan; Presets and Cool down. The row wraps onto more
// lines, so every heater shows.
export class PrusaTemperatures extends PrusaFeature {
  static override label = "Temperatures";
  static override pickerName = "Prusa temperatures";
  static override wraps = true;
  static override form = {
    label: "Controls",
    helper: "A heater and its target shows the temperature over its target. Tap it to type a target, press and slide to change it, or hold it to turn that heater off (hold again for the target it had). Presets set every nozzle and the bed; Cool down turns every heater off.",
    options: [{ name: "animate_fan", label: "Animate fan", helper: "The chamber fan's icon turns while it runs, faster at a higher speed." }],
  };

  static override controlIds(device: Device): string[] {
    return [...heaterIds(device).flatMap((reading) => [pairOf(reading), reading, targetOf(reading)]), "chamber_fan", "presets", "cool_down"];
  }

  static override defaultsFor(device: Device): string[] {
    return [...heaterIds(device).map(pairOf), "chamber_fan", "presets", "cool_down"];
  }
}

// Nozzles: one row for each tool, the controls chosen of each
const NOZZLE_KEYS = ["material", "nozzle_diameter", "nozzle_high_flow", "nozzle_hardened", "active", "print_fan_speed", "heatbreak_fan_speed"];

export class PrusaNozzles extends PrusaFeature {
  static override label = "Nozzles";
  static override pickerName = "Prusa nozzles";
  static override display = false;
  static override controls = NOZZLE_KEYS;
  static override defaults = ["material", "nozzle_diameter", "active", "print_fan_speed"];
  static override form = {
    label: "Controls",
    helper: "Each tool has a row of its own.",
    options: [{ name: "animate_fan", label: "Animate fan", helper: "A fan's icon turns while the fan runs." }],
  };

  /** A control as the first tool that has it has it. */
  static override controlFor(id: string, device: Device) {
    const n = device.tools.find((tool) => device.roles[`tool_${tool}_${id}`]) ?? 1;
    const control = controlOf(`tool_${n}_${id}`);
    return { control, entityId: control && device.roles[control.role] };
  }

  /** Each control by its entity's name, without its tool (Tool 1 material: Material). */
  static override nameOf(id: string, device: Device, hass: HomeAssistant): string {
    const name = super.nameOf(id, device, hass).replace(/^Tool \d+\s+/i, "");
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  /** Active only for a printer with more than one tool. */
  static override offered(device: Device, hass: HomeAssistant) {
    return super.offered(device, hass).filter((o) => o.value !== "active" || device.tools.length > 1);
  }

  protected override _lines(): Item[][] {
    const moment = this._moment(), { device } = moment;
    const chosen = this._chosen().filter((id) => NOZZLE_KEYS.includes(id) && (id !== "active" || device.tools.length > 1));
    return device.tools.map((n) => chosen.flatMap((id) => {
      const control = controlOf(`tool_${n}_${id}`);
      const entityId = control && device.roles[control.role];
      return control && entityId ? itemsOf(this, control, entityId, moment) : [];
    }));
  }
}

// Movement: print speed and flow (fields), the positions, Home and Disable
// steppers. Only Z while printing (on by default): X and Y hide during a print.
export class PrusaMovement extends PrusaFeature {
  static override label = "Movement";
  static override pickerName = "Prusa movement";
  static override controls = ["speed", "flow", "axis_z", "axis_x", "axis_y", "home", "disable_steppers"];
  static override defaults = ["speed", "flow", "axis_z", "axis_x", "axis_y"];
  static override form = {
    label: "Controls",
    helper: "Print speed and flow are fields: tap one to type a value, or press and slide on it.",
    options: [
      { name: "only_z_while_printing", label: "Only Z while printing", helper: "X and Y hide while a print is under way." },
      { name: "units", label: "Units", default: false, helper: "The positions show their unit (mm)." },
    ],
  };

  protected override _lines(): Item[][] {
    const moment = this._moment();
    const onlyZ = this._config!.only_z_while_printing !== false && JOB_PHASES.includes(moment.phase);
    return [this._chosen().filter((id) => !(onlyZ && (id === "axis_x" || id === "axis_y"))).flatMap((id) => this._controlKey(id, moment))];
  }
}

// Utilities, as Prusa Connect names them: Beep and Reset printer (asking first)
export class PrusaUtilities extends PrusaFeature {
  static override label = "Utilities";
  static override pickerName = "Prusa utilities";
  static override controls = ["beep", "reset_printer"];
  static override form = {
    label: "Controls",
    options: [{ name: "ask_before_resetting", label: "Ask before resetting the printer" }],
  };
}
