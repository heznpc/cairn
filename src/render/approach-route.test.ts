import { describe, expect, it } from "vitest";
import type { Road } from "../types.js";
import { buildApproachRoute, canInferFootAccess, polylineLength } from "./approach-route.js";

const project = (lat: number, lon: number): [number, number] => [lon * 10, lat * 10];
const base = { project, startTrim: 5, endTrim: 5 };
const road = (id: string, nodes: Array<[string, number, number]>, tags = { highway: "footway" } as Record<string, string>): Road => ({
  id,
  class: "path",
  tags,
  nodes: nodes.map(([id, x, y]) => ({ id, lat: y / 10, lon: x / 10 })),
  // Deliberately simplified: the middle node must survive in the routing graph.
  points: [nodes[0], nodes[nodes.length - 1]].map(([, x, y]) => ({ lat: y / 10, lon: x / 10 })),
});

describe("buildApproachRoute", () => {
  it("follows shared nodes, including junctions removed by display simplification", () => {
    const route = buildApproachRoute({
      ...base,
      start: { x: 0, y: -20 },
      startAnchor: { x: 0, y: 0 },
      destination: { x: 100, y: 100 },
      roads: [
        road("a", [["1", 0, 0], ["2", 100, 0], ["3", 200, 0]]),
        road("b", [["2", 100, 0], ["4", 100, 100]]),
      ],
    });
    expect(route?.mode).toBe("osm-network");
    expect(route?.points).toContainEqual({ x: 100, y: 0 });
    expect(polylineLength(route!.points)).toBeGreaterThan(200);
  });

  it.each<Record<string, string>>([
    { highway: "footway", bridge: "yes", layer: "1" },
    { highway: "footway", tunnel: "yes", layer: "-1" },
    { highway: "footway" },
  ])("never connects geometric crossings without a shared node: %j", (tags) => {
    const route = buildApproachRoute({
      ...base,
      start: { x: -100, y: 0 },
      destination: { x: 0, y: 100 },
      roads: [
        road("a", [["1", -100, 0], ["2", 0, 0], ["3", 100, 0]], tags),
        road("b", [["4", 0, -100], ["5", 0, 0], ["6", 0, 100]]),
      ],
    });
    expect(route?.mode).toBe("direct");
    expect(route?.points).toHaveLength(2);
  });

  it("does not merge coincident endpoints with different node IDs", () => {
    expect(buildApproachRoute({
      ...base,
      start: { x: 0, y: 0 },
      destination: { x: 100, y: 100 },
      roads: [
        road("a", [["1", 0, 0], ["2", 100, 0]]),
        road("b", [["3", 100, 0], ["4", 100, 100]]),
      ],
    })?.mode).toBe("direct");
  });

  it("connects a bridge to ground level at its shared endpoint", () => {
    expect(buildApproachRoute({
      ...base,
      start: { x: 0, y: 0 },
      destination: { x: 100, y: 100 },
      roads: [
        road("bridge", [["1", 0, 0], ["2", 100, 0]], { highway: "footway", layer: "1", bridge: "yes" }),
        road("ground", [["2", 100, 0], ["3", 100, 100]]),
      ],
    })?.mode).toBe("osm-network");
  });

  it("splits a single segment at both snapped endpoints, in either direction", () => {
    for (const [startX, endX] of [[20, 80], [80, 20]]) {
      const direction = Math.sign(endX - startX);
      expect(buildApproachRoute({
        ...base,
        start: { x: startX, y: 0 },
        destination: { x: endX, y: 0 },
        roads: [road("a", [["1", 0, 0], ["2", 100, 0]])],
      })).toEqual({
        mode: "osm-network",
        points: [{ x: startX + 5 * direction, y: 0 }, { x: endX - 5 * direction, y: 0 }],
        networkPoints: [{ x: startX + 5 * direction, y: 0 }, { x: endX - 5 * direction, y: 0 }],
      });
    }
  });

  it("uses a directional cue for a legacy road without topology", () => {
    const legacy = road("a", [["1", 0, 0], ["2", 100, 0]]);
    delete legacy.nodes;
    expect(buildApproachRoute({
      ...base, start: { x: 0, y: 0 }, destination: { x: 100, y: 0 }, roads: [legacy],
    })).toEqual({ mode: "direct", points: [{ x: 5, y: 0 }, { x: 95, y: 0 }] });
  });

  it("separates unverified endpoint connectors from the connected network", () => {
    const route = buildApproachRoute({
      ...base,
      start: { x: 0, y: -20 }, startAnchor: { x: 0, y: 0 },
      destination: { x: 120, y: 100 },
      roads: [road("a", [["1", 0, 0], ["2", 100, 0], ["3", 100, 100]])],
    });
    expect(route?.mode).toBe("osm-network");
    expect(route?.points[0]).toEqual({ x: 0, y: -15 });
    expect(route?.points.at(-1)).toEqual({ x: 115, y: 100 });
    expect(route?.networkPoints).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
  });

  it("does not call two endpoint connectors to the same snap a network route", () => {
    expect(buildApproachRoute({
      ...base, start: { x: -30, y: 0 }, destination: { x: 0, y: -30 },
      roads: [road("a", [["1", 0, 0], ["2", 100, 100]])],
    })?.mode).toBe("direct");
  });

  it("falls back instead of building an unbounded graph", () => {
    const oversized = road("large", [["1", 0, 0], ["2", 100, 0]]);
    oversized.nodes = Array.from({ length: 12002 }, (_, index) => ({ id: String(index), lat: 0, lon: index / 200 }));
    expect(buildApproachRoute({
      ...base, start: { x: 0, y: 0 }, destination: { x: 100, y: 0 }, roads: [oversized],
    })?.mode).toBe("direct");
  });

  it("does not use restricted ways to bridge otherwise disconnected roads", () => {
    const roads = [
      road("a", [["1", 0, 0], ["2", 30, 0]]),
      road("private", [["2", 30, 0], ["3", 70, 0]], { highway: "service", foot: "no" }),
      road("b", [["3", 70, 0], ["4", 100, 0]]),
    ];
    expect(buildApproachRoute({ ...base, start: { x: 0, y: 0 }, destination: { x: 100, y: 0 }, roads })?.mode).toBe("direct");
    roads[1].tags!.foot = "yes";
    expect(buildApproachRoute({ ...base, start: { x: 0, y: 0 }, destination: { x: 100, y: 0 }, roads })?.mode).toBe("osm-network");
  });

  it("rejects inconsistent node coordinates, distant snaps, excessive detours and off-canvas routes", () => {
    const roads = [
      road("a", [["1", 0, 0], ["2", 100, 0]]),
      road("b", [["2", 100, 0], ["3", 100, 100], ["4", 0, 100]]),
    ];
    const options = { ...base, start: { x: 0, y: 0 }, destination: { x: 0, y: 100 }, roads };
    expect(buildApproachRoute(options)?.mode).toBe("osm-network");
    expect(buildApproachRoute({ ...options, maxDetourRatio: 2 })?.mode).toBe("direct");
    expect(buildApproachRoute({ ...options, bounds: { width: 80, height: 200 } })?.mode).toBe("direct");
    expect(buildApproachRoute({ ...options, startAnchor: { x: -200, y: 0 } })?.mode).toBe("direct");
    roads[1].nodes![0].lon += 1;
    expect(buildApproachRoute(options)?.mode).toBe("direct");
  });

  it("omits a cue that cannot remain legible after trimming", () => {
    expect(buildApproachRoute({
      ...base, start: { x: 0, y: 0 }, destination: { x: 20, y: 0 }, roads: [], startTrim: 8, endTrim: 8,
    })).toBeNull();
  });
});

describe("way-level foot access", () => {
  it.each<Record<string, string>>([
    { highway: "footway", foot: "no" },
    { highway: "service", access: "private" },
    { highway: "residential", foot: "use_sidepath" },
    { highway: "path", foot: "destination" },
    { highway: "motorway" },
    { highway: "trunk", access: "yes" },
    { highway: "pedestrian", area: "yes" },
    { highway: "path", "access:conditional": "no @ (night)" },
    { highway: "path", "foot:conditional": "yes @ (Mo-Fr)" },
    { highway: "path", "oneway:foot": "yes" },
    { highway: "footway", indoor: "yes" },
  ])("excludes restrictions and unsupported semantics: %j", (tags) => {
    expect(canInferFootAccess(road("a", [["1", 0, 0], ["2", 100, 0]], tags))).toBe(false);
  });

  it.each<Record<string, string>>([
    { highway: "service", access: "private", foot: "yes" },
    { highway: "footway", foot: "designated" },
    { highway: "path", foot: "permissive" },
    { highway: "steps" },
    { highway: "pedestrian" },
    { highway: "residential", oneway: "yes" },
  ])("honors foot overrides and supported defaults: %j", (tags) => {
    expect(canInferFootAccess(road("a", [["1", 0, 0], ["2", 100, 0]], tags))).toBe(true);
  });
});
