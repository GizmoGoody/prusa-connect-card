import { describe, expect, it } from "vitest";
import { featurePlaces } from "../../src/card/layout";
import { innerTileConfig, minimal } from "../../src/card/options";

const small = { tall: false, full: false, height: 36 };

describe("featurePlaces (L-1: half width, as the xTool card places features)", () => {
  it("alternates left and right, and stretches a last feature alone in its row", () => {
    const { places } = featurePlaces([small, small, small], 12, true);
    expect(places).toEqual([
      { column: "1", row: "1", columns: 2 }, { column: "2", row: "1", columns: 2 }, { column: "1 / -1", row: "2", columns: 1 },
    ]);
  });
  it("leaves a last feature alone in one column without Last feature full width", () => {
    expect(featurePlaces([small, small, small], 12, false).places[2]).toEqual({ column: "1", row: "2", columns: 2 });
  });
  it("fills the column beside a tall feature, one feature per row", () => {
    const { places, rows } = featurePlaces([{ tall: true, full: false, height: 200 }, small, small], 12, true);
    expect(places).toEqual([
      { column: "1", row: "1 / span 2", columns: 2 }, { column: "2", row: "1", columns: 2 }, { column: "2", row: "2", columns: 2 },
    ]);
    expect(rows).toEqual(["auto", "1fr"]);
  });
  it("never leaves an empty half before a full width feature, whatever Last feature full width is (L-1)", () => {
    expect(featurePlaces([small, { tall: true, full: true, height: 200 }], 12, false).places[0]).toEqual({ column: "1 / -1", row: "1", columns: 1 });
  });
  it("gives a full width feature both columns", () => {
    expect(featurePlaces([{ tall: true, full: true, height: 200 }, small], 12, true).places[0]).toEqual({ column: "1 / -1", row: "1", columns: 1 });
  });
});

describe("options (O-1: saved without defaults)", () => {
  it("leaves out every option at its default", () => {
    expect(minimal({ entity: "sensor.a", collapsible: true, features_style: "console", connection_badge: true, expanded_at_load: false }))
      .toEqual({ entity: "sensor.a" });
  });
  it("keeps only the progress edge options that differ", () => {
    expect(minimal({ entity: "sensor.a", progress_edge: { edge: "top", thickness: 6 } })).toEqual({ entity: "sensor.a", progress_edge: { thickness: 6 } });
  });
});

describe("the tile card inside (K-1: collapsible, features inline)", () => {
  const config = { entity: "sensor.a", features: [{ type: "custom:prusa-print" }, { type: "custom:prusa-temperatures" }] };
  it("collapsed: only the feature beside the title", () => expect(innerTileConfig(config, false).features).toEqual([config.features[0]]));
  it("expanded: every feature, and a tap toggles", () => {
    const tile = innerTileConfig(config, true);
    expect(tile.features).toHaveLength(2);
    expect(tile.tap_action).toEqual({ action: "fire-dom-event", prusa_connect_card: "toggle" });
    expect(tile.features_position).toBe("inline");
    expect(tile.state_content).toEqual(["state", "progress", "time_remaining"]);
  });
});
