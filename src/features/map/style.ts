import type { StyleSpecification } from "maplibre-gl";

/*
 * The base map, drawn from OpenFreeMap's vector tiles (OpenMapTiles schema,
 * no key) in the app's own colors. The colors are read from the design
 * tokens at runtime, so Light, Dark and Sunlight each get a matching map
 * without a second set of hex values to keep in step. Only what helps find
 * your way is drawn: land, water, parks, roads, borders and place names.
 */

export const TILES = "https://tiles.openfreemap.org/planet";
export const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";

type RGB = [number, number, number];

export interface Palette {
  land: string;
  water: string;
  park: string;
  built: string;
  minor: string;
  major: string;
  casing: string;
  border: string;
  label: string;
  labelStrong: string;
  waterLabel: string;
  halo: string;
  route: string;
  routeCasing: string;
  sunlight: boolean;
}

const css = (c: RGB) => `rgb(${c.map((n) => Math.round(n)).join(",")})`;
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] * t + b[0] * (1 - t), a[1] * t + b[1] * (1 - t), a[2] * t + b[2] * (1 - t)];

/** A token's computed color as numbers: light-dark() and Sunlight overrides already resolved by the browser. */
function readToken(probe: HTMLElement, name: string): RGB {
  probe.style.color = `var(--${name})`;
  const m = /rgba?\(([\d.]+),?\s*([\d.]+),?\s*([\d.]+)/.exec(getComputedStyle(probe).color);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [128, 128, 128];
}

export function readPalette(): Palette {
  const probe = document.createElement("span");
  probe.style.display = "none";
  document.body.appendChild(probe);
  try {
    const t = (n: string) => readToken(probe, n);
    const canvas = t("canvas");
    const surface = t("surface");
    const sunken = t("sunken");
    const ink = t("ink");
    const muted = t("muted");
    const line = t("line");
    const accent = t("accent");
    const flight = t("k-flight");
    const activity = t("k-activity");
    const sunlight = document.documentElement.hasAttribute("data-sunlight");
    const dark = (canvas[0] + canvas[1] + canvas[2]) / 3 < 100;
    return {
      land: css(canvas),
      water: css(mix(flight, canvas, sunlight ? 0.22 : dark ? 0.22 : 0.16)),
      park: css(mix(activity, canvas, sunlight ? 0.1 : dark ? 0.12 : 0.1)),
      built: css(mix(sunken, canvas, 0.6)),
      minor: css(sunlight ? mix(ink, canvas, 0.35) : dark ? line : surface),
      major: css(sunlight ? surface : dark ? mix(muted, canvas, 0.35) : surface),
      casing: css(sunlight ? ink : dark ? canvas : line),
      border: css(mix(muted, canvas, sunlight ? 1 : 0.6)),
      label: css(sunlight ? ink : muted),
      labelStrong: css(ink),
      waterLabel: css(sunlight ? ink : flight),
      halo: css(canvas),
      route: css(accent),
      routeCasing: css(canvas),
      sunlight,
    };
  } finally {
    probe.remove();
  }
}

const NAME = ["coalesce", ["get", "name_en"], ["get", "name:latin"], ["get", "name"]];
const polygon = ["match", ["geometry-type"], ["MultiPolygon", "Polygon"], true, false];
const lineGeom = ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false];

export type RouteData = GeoJSON.Feature<GeoJSON.LineString> | GeoJSON.FeatureCollection;

export const emptyRoute = (): GeoJSON.FeatureCollection => ({ type: "FeatureCollection", features: [] });

export function routeData(coords: [number, number][] | null): RouteData {
  return coords && coords.length > 1 ? { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } } : emptyRoute();
}

export function buildStyle(p: Palette, route: RouteData = emptyRoute()): StyleSpecification {
  const halo = p.sunlight ? 2 : 1.4;
  const text = (size: unknown, color: string, font = "Noto Sans Regular") => ({
    layout: { "text-field": NAME, "text-font": [font], "text-size": size, "text-max-width": 8 },
    paint: { "text-color": color, "text-halo-color": p.halo, "text-halo-width": halo },
  });
  const layers = [
    { id: "background", type: "background", paint: { "background-color": p.land } },
    { id: "park", type: "fill", source: "omt", "source-layer": "park", filter: polygon, paint: { "fill-color": p.park } },
    {
      id: "landcover",
      type: "fill",
      source: "omt",
      "source-layer": "landcover",
      filter: ["match", ["get", "class"], ["wood", "grass", "farmland"], true, false],
      paint: { "fill-color": p.park, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 6, 0.4, 12, 0.8] },
    },
    { id: "built", type: "fill", source: "omt", "source-layer": "landuse", filter: ["match", ["get", "class"], ["residential", "suburb", "neighbourhood", "commercial"], true, false], maxzoom: 15, paint: { "fill-color": p.built } },
    { id: "water", type: "fill", source: "omt", "source-layer": "water", filter: ["all", polygon, ["!=", ["get", "brunnel"], "tunnel"]], paint: { "fill-color": p.water } },
    { id: "waterway", type: "line", source: "omt", "source-layer": "waterway", filter: lineGeom, minzoom: 8, paint: { "line-color": p.water, "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.5, 14, 2] } },
    {
      id: "roads-minor",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["all", lineGeom, ["match", ["get", "class"], ["minor", "service", "track", "path"], true, false]],
      minzoom: 12,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": p.minor, "line-width": ["interpolate", ["exponential", 1.5], ["zoom"], 12, 0.6, 18, 9] },
    },
    {
      id: "roads-major-casing",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["all", lineGeom, ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary"], true, false]],
      minzoom: 7,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": p.casing, "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 7, 1.2, 18, 18] },
    },
    {
      id: "roads-major",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      filter: ["all", lineGeom, ["match", ["get", "class"], ["motorway", "trunk", "primary", "secondary", "tertiary"], true, false]],
      minzoom: 5,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": p.major, "line-width": ["interpolate", ["exponential", 1.4], ["zoom"], 5, 0.5, 18, 14] },
    },
    {
      id: "border",
      type: "line",
      source: "omt",
      "source-layer": "boundary",
      filter: ["all", ["==", ["get", "admin_level"], 2], ["!=", ["get", "maritime"], 1]],
      paint: { "line-color": p.border, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.8, 12, 2], "line-dasharray": [3, 2] },
    },
    { id: "route-casing", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.routeCasing, "line-width": 7, "line-opacity": 0.9 } },
    { id: "route", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": p.route, "line-width": 3.5, "line-dasharray": [1.6, 1.4] } },
    { id: "water-name", type: "symbol", source: "omt", "source-layer": "water_name", ...text(["interpolate", ["linear"], ["zoom"], 6, 11, 12, 14], p.waterLabel, "Noto Sans Italic") },
    {
      id: "road-name",
      type: "symbol",
      source: "omt",
      "source-layer": "transportation_name",
      filter: ["match", ["get", "class"], ["primary", "secondary", "tertiary", "minor"], true, false],
      minzoom: 14,
      layout: { "symbol-placement": "line", "text-field": NAME, "text-font": ["Noto Sans Regular"], "text-size": 11 },
      paint: { "text-color": p.label, "text-halo-color": p.halo, "text-halo-width": halo },
    },
    { id: "village", type: "symbol", source: "omt", "source-layer": "place", filter: ["match", ["get", "class"], ["village", "suburb", "neighbourhood", "hamlet"], true, false], minzoom: 10, ...text(["interpolate", ["linear"], ["zoom"], 10, 11, 14, 13], p.label) },
    { id: "town", type: "symbol", source: "omt", "source-layer": "place", filter: ["==", ["get", "class"], "town"], minzoom: 7, ...text(["interpolate", ["linear"], ["zoom"], 7, 11, 12, 15], p.labelStrong) },
    { id: "city", type: "symbol", source: "omt", "source-layer": "place", filter: ["==", ["get", "class"], "city"], minzoom: 4, ...text(["interpolate", ["linear"], ["zoom"], 4, 12, 10, 17], p.labelStrong, "Noto Sans Bold") },
    { id: "country", type: "symbol", source: "omt", "source-layer": "place", filter: ["==", ["get", "class"], "country"], maxzoom: 8, ...text(["interpolate", ["linear"], ["zoom"], 2, 11, 6, 15], p.label, "Noto Sans Bold") },
  ];
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      omt: { type: "vector", url: TILES },
      route: { type: "geojson", data: route },
    },
    layers,
  } as StyleSpecification;
}
