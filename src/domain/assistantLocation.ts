import { validLatLng } from "./geo";

export const LOCATION_MAX_AGE_MS = 10 * 60_000;

export interface LocationReading {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
}

/** Apply the same freshness and precision rules on the device and at the API boundary. */
export function approximateLocation(raw: unknown, nowMs: number): LocationReading | null {
  if (!raw || typeof raw !== "object") return null;
  const { latitude, longitude, accuracy, timestamp } = raw as Record<string, unknown>;
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp) || timestamp <= nowMs - LOCATION_MAX_AGE_MS || timestamp > nowMs + 60_000) return null;
  if (typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 50_000) return null;
  if (typeof latitude !== "number" || typeof longitude !== "number" || !validLatLng(latitude, longitude)) return null;
  const lat = Math.round(latitude * 1000) / 1000;
  const lng = Math.round(longitude * 1000) / 1000;
  if (!validLatLng(lat, lng)) return null;
  return { latitude: lat, longitude: lng, accuracy: Math.max(100, Math.ceil(accuracy)), timestamp };
}
