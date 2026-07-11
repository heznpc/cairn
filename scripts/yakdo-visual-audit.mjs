#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { renderSVG } from "../dist/render.js";
import { THEMES } from "../dist/render/theme.js";

const outDir = resolve("tmp/visual-audit");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const TEMPLATES = ["standard", "compact", "minimal", "schematic", "badge"];
const THEME_NAMES = ["paper", "mono", "civic", "invitation"];

const fixtures = [
  {
    name: "dense-seoul-block",
    width: 600,
    height: 400,
    layout: {
      center: { lat: 37.5, lon: 127, label: "스튜디오" },
      landmarks: [
        landmark("exit7", "7번 출구", 37.50055, 127.00045, "station_exit", 0.95, { ref: "7" }),
        landmark("station", "역삼역", 37.50045, 127.00055, "station", 1),
        landmark("hospital", "서울대학교병원헬스케어센터", 37.5002, 127.0003, "hospital", 0.7),
        landmark("food", "호천당 역삼점", 37.4996, 126.9992, "restaurant", 0.45),
        landmark("store", "CU 역삼휴게소점", 37.4994, 127.0001, "convenience", 0.5),
      ],
      roads: [
        road("teheran-west", "테헤란로", "primary", [
          [37.5002, 126.9978],
          [37.5006, 126.999],
          [37.5001, 127.0004],
          [37.5005, 127.002],
        ]),
        road("teheran-duplicate", "테헤란로", "primary", [
          [37.50005, 126.9978],
          [37.50045, 126.999],
          [37.49995, 127.0004],
          [37.50035, 127.002],
        ]),
        road("nonhyeon", "논현로", "secondary", [
          [37.5011, 127.00085],
          [37.499, 127.0002],
        ]),
        road("near-tertiary", undefined, "tertiary", [
          [37.49995, 126.9996],
          [37.4997, 127.0002],
          [37.4999, 127.0015],
        ]),
        road("far-stub", "짧은샛길", "tertiary", [
          [37.50095, 126.999],
          [37.5005, 126.99905],
        ]),
        road("residential-noise", "이면도로", "residential", [
          [37.4997, 126.9985],
          [37.4994, 126.9992],
          [37.4992, 127.0001],
        ]),
      ],
      bbox: { north: 37.5012, south: 37.4988, east: 127.0014, west: 126.9986 },
    },
  },
];

const failures = [];

for (const fixture of fixtures) {
  for (const template of TEMPLATES) {
    for (const themeName of THEME_NAMES) {
      const artifactName = `${fixture.name}-${template}-${themeName}`;
      const svg = renderSVG(fixture.layout, {
        width: fixture.width,
        height: fixture.height,
        template,
        theme: themeName,
      });
      const svgPath = resolve(outDir, `${artifactName}.svg`);
      writeFileSync(svgPath, svg, "utf8");
      maybeRenderPng(svgPath, resolve(outDir, `${artifactName}.png`));

      auditSvg(artifactName, svg, template, themeName, THEMES[themeName], failures);
    }
  }
}

if (failures.length > 0) {
  console.error("yakdo visual audit failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`yakdo visual audit passed (${fixtures.length} fixture${fixtures.length === 1 ? "" : "s"} × ${TEMPLATES.length} templates × ${THEME_NAMES.length} themes)`);
console.log(`artifacts: ${outDir}`);

function landmark(id, name, lat, lon, category, importance, tags = {}) {
  return { id, name, lat, lon, category, importance, tags };
}

function road(id, name, roadClass, points) {
  const out = {
    id,
    class: roadClass,
    points: points.map(([lat, lon]) => ({ lat, lon })),
  };
  if (name) out.name = name;
  return out;
}

function auditSvg(name, svg, template, themeName, theme, out) {
  expectNot(name, svg, 'stroke-dasharray=', "dashed connector lines make the map read like AI relationship UI", out);
  expectNot(name, svg, 'fill="#fffdf8" stroke="#e3ddd0"', "rounded label pills are UI chrome, not print yakdo labeling", out);
  expectNot(name, svg, 'rx="3" fill="#d63b31"', "destination label must not regress to a rounded UI chip", out);
  expect(name, svg, `data-template="${template}"`, "SVG should identify its composition template", out);
  expect(name, svg, `data-theme="${themeName}"`, "SVG should identify its visual theme", out);

  const roadCoreCount = count(svg, /data-road-layer="core"/g);
  const roadBudget = template === "standard" ? 5 : template === "compact" ? 3 : template === "schematic" ? 4 : 0;
  if (roadCoreCount > roadBudget) out.push(`${name}: expected <=${roadBudget} road spines, got ${roadCoreCount}`);

  const landmarkIconCount = count(svg, /data-landmark-icon="/g);
  const landmarkBudget = template === "standard" ? 5 : template === "compact" ? 2 : template === "schematic" ? 4 : 1;
  if (landmarkIconCount > landmarkBudget) {
    out.push(`${name}: expected <=${landmarkBudget} landmark icons, got ${landmarkIconCount}`);
  }

  const haloCount = count(svg, new RegExp(`stroke="${escapeRegExp(theme.background)}" stroke-width="4"`, "g"));
  const labelFillCount = count(svg, /<text [^>]*fill="(?!none)[^"]*"[^>]*>/g);
  const minHaloCount = template === "standard" ? 4 : template === "compact" ? 3 : template === "schematic" ? 4 : 2;
  if (haloCount < minHaloCount) out.push(`${name}: expected at least ${minHaloCount} haloed print labels, got ${haloCount}`);
  if (labelFillCount < haloCount) {
    out.push(`${name}: halo text count (${haloCount}) exceeds filled label count (${labelFillCount})`);
  }

  const markerColors = new Set(
    [...svg.matchAll(/data-landmark-icon="[^"]+"[^>]*(?:stroke|fill)="(#[0-9a-fA-F]{6})"/g)]
      .map((match) => match[1].toLowerCase()),
  );
  const allowed = new Set([theme.landmark, theme.transit, theme.exit].map((color) => color.toLowerCase()));
  for (const color of markerColors) {
    if (!allowed.has(color)) {
      out.push(`${name}: non-print landmark icon color ${color}`);
    }
  }
  auditMarkerRoadSeparation(name, svg, out);

  expect(name, svg, "© OpenStreetMap contributors", "visible OSM attribution is required", out);
  expect(name, svg, 'data-approach-arrow="core"', "diagram output should preserve the final approach cue", out);
  expect(name, svg, 'data-destination-label="true"', "diagram output should preserve the destination callout", out);
  if (template === "minimal") {
    expect(name, svg, 'data-route-strip="true"', "minimal preset should use the dedicated route-strip template", out);
    expect(name, svg, 'data-strip-route="core"', "minimal route-strip should preserve a clear route line", out);
    expect(name, svg, 'data-strip-road="anchor"', "minimal route-strip should retain one road anchor for wayfinding context", out);
    expect(name, svg, `fill="${theme.background}" stroke="${theme.destination}"`, "minimal destination callout should use an outlined print label", out);
    expectNot(name, svg, 'data-road-layer="core"', "minimal preset should remove the road skeleton, not just road labels", out);
    expectNot(name, svg, `stroke="${theme.frame}"`, "minimal preset should remove the printed frame for a route-only silhouette", out);
    expectNot(name, svg, 'data-landmark-icon="hospital"', "minimal preset should remove secondary landmark icons", out);
    expectNot(name, svg, 'data-landmark-icon="convenience"', "minimal preset should remove secondary landmark icons", out);
  }
  if (template === "schematic") {
    expect(name, svg, 'data-road-geometry="orthogonal"', "schematic preset should use right-angle road geometry", out);
    expect(name, svg, ">테헤란로</text>", "schematic preset should keep road labels for print wayfinding", out);
  }
  if (template === "badge") {
    expect(name, svg, 'data-badge-map="true"', "badge preset should use the destination-first inset template", out);
    expect(name, svg, 'data-badge-road="primary"', "badge preset should retain a main road anchor", out);
    expect(name, svg, 'data-badge-route="core"', "badge preset should preserve a clear route line", out);
    expectNot(name, svg, 'data-road-layer="core"', "badge preset should not reuse the full map road skeleton", out);
  }
  if (template === "compact") {
    expect(name, svg, ">테헤란로</text>", "compact preset should keep the main road label instead of becoming an empty map", out);
    expectNot(name, svg, 'data-landmark-icon="hospital"', "compact preset should prefer approach landmarks over secondary POIs", out);
    expectNot(name, svg, 'data-landmark-icon="convenience"', "compact preset should prefer approach landmarks over secondary POIs", out);
  }
  if (template === "standard" || template === "compact" || template === "schematic" || template === "badge") {
    expect(name, svg, `fill="${theme.destination}"`, `${template} destination callout should keep strong destination fill`, out);
  }
}

function expect(name, svg, needle, message, out) {
  if (!svg.includes(needle)) out.push(`${name}: ${message}`);
}

function expectNot(name, svg, needle, message, out) {
  if (svg.includes(needle)) out.push(`${name}: ${message}`);
}

function count(svg, pattern) {
  return svg.match(pattern)?.length ?? 0;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function auditMarkerRoadSeparation(name, svg, out) {
  const markers = [...svg.matchAll(
    /<circle cx="(-?[\d.]+)" cy="(-?[\d.]+)" r="([\d.]+)" data-landmark-marker="([^"]+)"[^>]*>/g,
  )].map((match) => ({
    x: Number(match[1]),
    y: Number(match[2]),
    radius: Number(match[3]),
    id: match[4],
  }));
  const roads = [...svg.matchAll(
    /<path data-road-layer="casing" d="([^"]+)"[^>]*stroke-width="([\d.]+)"[^>]*>/g,
  )].flatMap((match) => {
    const points = [...match[1].matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)]
      .map((point) => ({ x: Number(point[1]), y: Number(point[2]) }));
    const segments = [];
    for (let index = 1; index < points.length; index++) {
      segments.push({
        start: points[index - 1],
        end: points[index],
        halfWidth: Number(match[2]) / 2,
      });
    }
    return segments;
  });

  for (const marker of markers) {
    for (const road of roads) {
      const distance = pointSegmentDistance(marker, road.start, road.end);
      const required = marker.radius + road.halfWidth + 3;
      if (distance + 0.1 < required) {
        out.push(
          `${name}: landmark marker ${marker.id} overlaps a protected road corridor (${distance.toFixed(1)}px < ${required.toFixed(1)}px)`,
        );
        break;
      }
    }
  }
}

function pointSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(
    0,
    Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared),
  );
  return Math.hypot(
    point.x - (start.x + t * dx),
    point.y - (start.y + t * dy),
  );
}

function maybeRenderPng(svgPath, pngPath) {
  const rsvg = spawnSync("which", ["rsvg-convert"], { encoding: "utf8" });
  if (rsvg.status !== 0) return;
  mkdirSync(dirname(pngPath), { recursive: true });
  execFileSync(rsvg.stdout.trim(), [svgPath, "-o", pngPath], { stdio: "ignore" });
}
