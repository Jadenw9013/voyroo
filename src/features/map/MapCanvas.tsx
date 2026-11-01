"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { getVersion, Map as MapLibre, Marker, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { boundsOf, clusterPoints, distanceM, type Cluster, type LatLng } from "@/domain/geo";
import { Icon } from "@/ui/Icon";
import { PinButton, GroupButton, type MapPin } from "./pins";
import { buildStyle, readPalette, routeData } from "./style";

/*
 * The map itself: MapLibre GL, loaded only when a map comes into view (it is
 * this module, imported on demand). Pins are real buttons placed as markers,
 * so they're in the tab order with names; the canvas underneath is keyboard
 * pannable (arrows) and zoomable (+/-). Everything else, the card and the
 * lists, lives in TripMap around it.
 */

// MapLibre 6 runs tile parsing in a module worker it expects next to its own
// file; bundled, that isn't there, so it's copied to /vendor at install.
setWorkerUrl(`/vendor/maplibre-gl-worker-${getVersion()}.mjs`);

export interface MapCanvasProps {
  label: string;
  pins: MapPin[];
  /** What "fit all" frames: usually the pins, minus flights landing far away. */
  frame: LatLng[];
  /** Changes when the set of pins does (a new day picked): frames them again. */
  frameKey: string;
  route: [number, number][] | null;
  selected: string | null;
  onSelect: (id: string) => void;
  /** Pins on the same spot, tapped together. */
  onGroup: (ids: string[]) => void;
  /** Placing an item by hand: tapping the map, or "Put the pin here" for the centre. */
  picking: { title: string } | null;
  onPick: (at: LatLng) => void;
  onCancelPick: () => void;
  /** Inline on a page: two fingers to move, so the page still scrolls. */
  cooperative: boolean;
  onFullScreen?: () => void;
  onError: () => void;
}

class MarkerPool {
  private all = new Map<string, { marker: Marker; el: HTMLDivElement; added: boolean }>();
  /** The element for a pin or group, made the first time it's asked for. */
  element(key: string): HTMLDivElement {
    let entry = this.all.get(key);
    if (!entry) {
      const el = document.createElement("div");
      el.className = "map-pin";
      entry = { el, marker: new Marker({ element: el, anchor: "bottom" }), added: false };
      this.all.set(key, entry);
    }
    return entry.el;
  }
  get(key: string) {
    return this.all.get(key);
  }
  keepOnly(keys: Set<string>) {
    for (const [key, { marker }] of this.all) {
      if (!keys.has(key)) {
        marker.remove();
        this.all.delete(key);
      }
    }
  }
  clear() {
    this.all.clear();
  }
}

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
/** Room around framed pins: a label reaches ~110px either side of its point, and the controls take the right edge. */
function padding(w: number, h: number) {
  const side = Math.min(110, Math.max(24, w * 0.22));
  return { top: Math.min(64, h * 0.2), bottom: Math.min(48, h * 0.12), left: side, right: Math.min(side + 56, w * 0.36) };
}
const roomOf = (map: MapLibre) => padding(map.getContainer().clientWidth, map.getContainer().clientHeight);

export default function MapCanvas(props: MapCanvasProps) {
  const { label, pins, frame, frameKey, route, selected, onSelect, onGroup, picking, onPick, onCancelPick, cooperative, onFullScreen, onError } = props;
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  // One marker element per pin or group, made on first render and reused; React fills them through portals.
  const [markers] = useState(() => new MarkerPool());
  const me = useRef<Marker | null>(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(2);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const latest = useRef({ frame, route, onPick, picking });
  useEffect(() => {
    latest.current = { frame, route, onPick, picking };
  });

  const fit = useCallback((animate = true) => {
    const map = mapRef.current;
    const b = boundsOf(latest.current.frame);
    if (!map || !b) return;
    const single = b[0][0] === b[1][0] && b[0][1] === b[1][1];
    if (single) map.easeTo({ center: b[0], zoom: Math.max(map.getZoom(), 13), duration: animate && !reduceMotion() ? 600 : 0 });
    else map.fitBounds(b, { padding: roomOf(map), maxZoom: 14, duration: animate && !reduceMotion() ? 700 : 0 });
  }, []);

  // Create the map once.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let map: MapLibre;
    try {
      const b = boundsOf(latest.current.frame);
      map = new MapLibre({
        container: el,
        style: buildStyle(readPalette(), routeData(latest.current.route)),
        ...(b ? { bounds: b, fitBoundsOptions: { padding: padding(el.clientWidth, el.clientHeight), maxZoom: 13 } } : { center: [0, 20], zoom: 1.2 }),
        // Drawn below instead, in the app's colors and type, always visible.
        attributionControl: false,
        cooperativeGestures: cooperative,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
        maxPitch: 0,
        maxZoom: 18,
        renderWorldCopies: false,
        locale: {
          "CooperativeGesturesHandler.WindowsHelpText": "Use Ctrl + scroll to zoom the map",
          "CooperativeGesturesHandler.MacHelpText": "Use ⌘ + scroll to zoom the map",
          "CooperativeGesturesHandler.MobileHelpText": "Use two fingers to move the map, or open it full screen",
        },
      });
    } catch {
      onError();
      return;
    }
    mapRef.current = map;
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.getCanvas().setAttribute("aria-label", `${label}. Use arrow keys to move and plus or minus to zoom.`);
    const onZoom = () => setZoom(Math.round(map.getZoom() * 2) / 2);
    // Ready once the style is in, not once every tile is: offline, with no tiles to fetch,
    // the pins still go up on a blank map.
    map.once("style.load", () => {
      (map.getSource("route") as GeoJSONSource | undefined)?.setData(routeData(latest.current.route));
      setReady(true);
      onZoom();
    });
    map.on("zoomend", onZoom);
    map.on("error", (e) => {
      if (/webgl/i.test(String(e.error?.message ?? ""))) onError();
    });
    map.on("click", (e) => {
      // Taps on pins bubble here too; only the bare map places a pin.
      if ((e.originalEvent.target as Element | null)?.closest?.(".maplibregl-marker")) return;
      if (latest.current.picking) latest.current.onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    return () => {
      markers.clear();
      me.current = null;
      map.remove();
      mapRef.current = null;
    };
    // The map is made once; later changes go through the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Light, Dark or Sunlight changed: redraw the base map in the new colors.
  useEffect(() => {
    if (!ready) return;
    const redraw = () => mapRef.current?.setStyle(buildStyle(readPalette(), routeData(latest.current.route)));
    const watch = new MutationObserver(redraw);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-sunlight"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", redraw);
    return () => {
      watch.disconnect();
      media.removeEventListener("change", redraw);
    };
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    (mapRef.current?.getSource("route") as GeoJSONSource | undefined)?.setData(routeData(route));
  }, [ready, route]);

  // A different set of pins (another day): frame them.
  useEffect(() => {
    if (ready) fit();
  }, [ready, frameKey, fit]);

  useEffect(() => {
    const canvas = mapRef.current?.getCanvasContainer();
    canvas?.classList.toggle("map-picking", !!picking);
  }, [picking, ready]);

  const clusters: Cluster[] = useMemo(() => clusterPoints(pins, zoom), [pins, zoom]);
  const byId = useMemo(() => new Map(pins.map((p) => [p.id, p])), [pins]);

  // Show the chosen pin: bring it into view, close enough to stand on its own.
  useEffect(() => {
    const map = mapRef.current;
    const pin = selected ? byId.get(selected) : null;
    if (!map || !ready || !pin) return;
    const inGroup = clusters.some((c) => c.ids.length > 1 && c.ids.includes(pin.id));
    const visible = map.getBounds().contains([pin.lng, pin.lat]);
    if (inGroup || !visible) map.easeTo({ center: [pin.lng, pin.lat], zoom: inGroup ? Math.min(16, map.getZoom() + 3) : map.getZoom(), duration: reduceMotion() ? 0 : 500 });
    // Only when the choice changes, not on every regroup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    markers.keepOnly(new Set(clusters.map((c) => c.key)));
    // Added in order, so Tab goes through the pins the way the day runs.
    for (const c of clusters) {
      const entry = markers.get(c.key);
      if (!entry) continue;
      entry.marker.setLngLat([c.lng, c.lat]);
      if (!entry.added) {
        entry.marker.addTo(map);
        entry.added = true;
        // The button inside carries the name; a label on the wrapper would only repeat it.
        entry.el.removeAttribute("aria-label");
        entry.el.removeAttribute("role");
      }
      entry.el.style.zIndex = c.ids.includes(selected ?? "") ? "3" : c.ids.length > 1 ? "2" : "1";
    }
  }, [clusters, ready, selected, markers]);

  const openGroup = (c: Cluster) => {
    const map = mapRef.current;
    if (!map) return;
    const points = c.ids.map((id) => byId.get(id)!).filter(Boolean);
    const spread = Math.max(...points.map((p) => distanceM(points[0], p)));
    // Same spot, or as close as the map goes: list them instead of zooming.
    if (spread < 40 || map.getZoom() >= 16) return onGroup(c.ids);
    const b = boundsOf(points)!;
    map.fitBounds(b, { padding: roomOf(map), maxZoom: 17, duration: reduceMotion() ? 0 : 600 });
  };

  const zoomBy = (d: number) => mapRef.current?.easeTo({ zoom: mapRef.current.getZoom() + d, duration: reduceMotion() ? 0 : 250 });

  const locate = () => {
    if (!navigator.geolocation) return setNote("This browser can't share your location.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const map = mapRef.current;
        if (!map) return;
        const at: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        if (!me.current) {
          const dot = document.createElement("div");
          dot.className = "map-me";
          dot.setAttribute("role", "img");
          dot.setAttribute("aria-label", "You are here");
          me.current = new Marker({ element: dot }).setLngLat(at).addTo(map);
        } else me.current.setLngLat(at);
        map.easeTo({ center: at, zoom: Math.max(map.getZoom(), 13), duration: reduceMotion() ? 0 : 600 });
      },
      () => {
        setLocating(false);
        setNote("Couldn't get your location. Check that location is allowed for this site.");
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 5000);
    return () => clearTimeout(t);
  }, [note]);

  const group = "flex flex-col divide-y divide-line overflow-hidden rounded-full border border-line bg-surface text-ink shadow-lift";
  const control = "flex size-11 items-center justify-center hover:bg-sunken disabled:opacity-60";

  return (
    <div className="relative size-full">
      <div ref={box} className="trip-map size-full" />
      {ready &&
        clusters.map((c) => {
          const el = markers.element(c.key);
          if (c.ids.length === 1) {
            const pin = byId.get(c.ids[0]);
            return pin ? createPortal(<PinButton pin={pin} selected={selected === pin.id} onClick={() => onSelect(pin.id)} />, el, c.key) : null;
          }
          const group = c.ids.map((id) => byId.get(id)!).filter(Boolean);
          return createPortal(<GroupButton pins={group} selected={!!selected && c.ids.includes(selected)} onClick={() => openGroup(c)} />, el, c.key);
        })}

      <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
        {onFullScreen && (
          <div className={group}>
            <button type="button" onClick={onFullScreen} aria-label="Open the map full screen" className={control}>
              <Icon name="expand" className="size-5" />
            </button>
          </div>
        )}
        {/* Fingers pinch; a mouse gets buttons (inline, the wheel needs Ctrl so the page still scrolls). */}
        <div className={`${group} pointer-coarse:hidden`}>
          <button type="button" onClick={() => zoomBy(1)} aria-label="Zoom in" className={control} disabled={!ready}>
            <Icon name="plus" className="size-5" />
          </button>
          <button type="button" onClick={() => zoomBy(-1)} aria-label="Zoom out" className={control} disabled={!ready}>
            <Icon name="minus" className="size-5" />
          </button>
        </div>
        <div className={group}>
          <button type="button" onClick={() => fit()} aria-label="Show all pins" className={control} disabled={!ready || !frame.length}>
            <Icon name="fit" className="size-5" />
          </button>
          <button type="button" onClick={locate} aria-label="Show where I am" className={control} disabled={!ready || locating}>
            <Icon name="locate" className="size-5" />
          </button>
        </div>
      </div>

      {picking && (
        <>
          <div aria-hidden="true" className="pointer-events-none absolute top-1/2 left-1/2 z-10 -translate-x-1/2 -translate-y-full text-accent">
            <Icon name="pin" className="size-10 drop-shadow" />
          </div>
          <div role="region" aria-label="Place a pin" className="absolute inset-x-3 bottom-9 z-20 flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3 text-ink shadow-lift">
            <p className="text-base font-semibold">Tap the map where {picking.title} is, or move the map and put the pin in the middle.</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const c = mapRef.current?.getCenter();
                  if (c) onPick({ lat: c.lat, lng: c.lng });
                }}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-accent px-4 font-bold text-on-accent"
              >
                <Icon name="pin" className="size-4" />
                Put the pin here
              </button>
              <button type="button" onClick={onCancelPick} className="inline-flex min-h-11 items-center rounded-xl px-3 font-semibold text-accent hover:bg-sunken">
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      <p className="absolute right-0 bottom-0 z-10 rounded-tl-lg bg-surface px-2 py-0.5 text-[11px] leading-5 text-muted">
        <a href="https://openfreemap.org" target="_blank" rel="noreferrer" className="underline">
          OpenFreeMap
        </a>{" "}
        <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer" className="underline">
          © OpenMapTiles
        </a>{" "}
        Data from{" "}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" className="underline">
          OpenStreetMap
        </a>
      </p>

      {note && (
        <p role="status" className="absolute inset-x-3 top-3 z-20 mr-14 rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink shadow-lift">
          {note}
        </p>
      )}
    </div>
  );
}
