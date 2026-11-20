import { describe, expect, it } from "vitest";
import { controlOf, heaterIds, pairOf, targetOf } from "../../src/printer/controls";
import { heaterState, type Device } from "../../src/printer/device";
import { familyOf } from "../../src/printer/families";
import { dim, heaterColors, historyColors, historyName } from "../../src/printer/history";
import { lookOf, styleOptions } from "../../src/printer/look";

const device = (tools: number[]): Device => ({ entities: [], roles: {}, tools, cameras: [], profile: { family: "core", model: "" }, ids: [] });

describe("heaterState (H-2: as Prusa Connect works it out)", () => {
  it("is at temperature within 2 °C of its target", () => expect(heaterState(199, 200)).toBe("at_temperature"));
  it("heats below and cools above", () => {
    expect(heaterState(100, 200)).toBe("heating");
    expect(heaterState(205, 200)).toBe("cooling");
  });
  it("with no target: cooling above 40 °C, off below", () => {
    expect(heaterState(50, 0)).toBe("cooling");
    expect(heaterState(25, 0)).toBe("off");
  });
  it("a chamber with no target is off whatever the air", () => expect(heaterState(50, 0, true)).toBe("off"));
  it("unknown without a reading", () => expect(heaterState(NaN, 200)).toBe("unknown"));
});

describe("controls (T-1: ids follow the integration's entities)", () => {
  it("a tool's heater and its target as one control", () => {
    const control = controlOf("tool_2_nozzle_temperature_and_target")!;
    expect(control.kind).toBe("pair");
    expect(control.tool).toBe(2);
    expect(control.parts).toEqual(["tool_2_nozzle_temperature", "tool_2_nozzle_target_temperature"]);
  });
  it("each heater: every nozzle, the bed and the chamber", () => {
    expect(heaterIds(device([1, 2]))).toEqual(["tool_1_nozzle_temperature", "tool_2_nozzle_temperature", "bed_temperature", "chamber_temperature"]);
    expect(pairOf("bed_temperature")).toBe("bed_temperature_and_target");
    expect(targetOf("bed_temperature")).toBe("bed_target_temperature");
  });
  it("an unknown control is none", () => expect(controlOf("tool_1_laser")).toBeUndefined());
});

describe("history (G-1, G-2: Prusa Connect's palette, targets dimmed, short names)", () => {
  it("dims a color half way to the background", () => {
    expect(dim("#fd5000", true)).toBe("#873109");
    expect(dim("#000000", false)).toBe("#808080");
  });
  it("gives each heater a color and its target the same, dimmed", () => {
    expect(historyColors(["tool_1_nozzle_temperature", "tool_1_nozzle_target_temperature", "bed_temperature", "bed_target_temperature"], true))
      .toEqual(["#fd5000", "#873109", "#547aeb", "#33467e"]);
  });
  it("keeps each heater's color whichever lines are shown, unless one is given (H-7, G-5)", () => {
    const heaters = ["tool_1_nozzle_temperature", "bed_temperature"];
    expect(heaterColors(heaters, true)).toEqual({ tool_1_nozzle_temperature: "#fd5000", bed_temperature: "#547aeb" });
    expect(heaterColors(heaters, true, { bed_temperature: "#4caf50" }).bed_temperature).toBe("#4caf50");
  });
  it("names each line short", () => {
    expect(historyName("tool_1_nozzle_temperature", device([1]))).toBe("Nozzle");
    expect(historyName("tool_2_nozzle_target_temperature", device([1, 2]))).toBe("Nozzle 2 target");
    expect(historyName("bed_temperature", device([1]))).toBe("Bed");
    expect(historyName("chamber_target_temperature", device([1]))).toBe("Chamber target");
  });
});

describe("styles (Y-1: one per family; only the CORE family has a door)", () => {
  it("finds the family of each model", () => {
    expect(familyOf("COREONE")).toBe("core");
    expect(familyOf("CoreOne")).toBe("core");
    expect(familyOf("MK4S")).toBe("mk");
    expect(familyOf("MINI+")).toBe("mini");
    expect(familyOf("XL")).toBe("xl");
    expect(familyOf("Pro HT90")).toBe("ht90");
    expect(familyOf("Ender 3")).toBe("none");
  });
  it("gives the CORE family a door, and any family one when a door color is given", () => {
    expect(lookOf(styleOptions({ style: { family: "core" } }))?.door).toBeDefined();
    expect(lookOf(styleOptions({ style: { family: "mk" } }))?.door).toBeUndefined();
    expect(lookOf(styleOptions({ style: { family: "mk", door: "#202020" } }))?.door).toBeDefined();
    expect(lookOf(styleOptions({ style: { family: "none" } }))).toBeUndefined();
  });
  it("has the status bar on by default", () => expect(styleOptions({ style: { family: "core" } }).status_bar).toBe(true));
});
