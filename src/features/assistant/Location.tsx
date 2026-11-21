"use client";

import { useEffect, useId, useRef, useState } from "react";
import { approximateLocation, LOCATION_MAX_AGE_MS, type LocationReading } from "@/domain/assistantLocation";
import { Icon } from "@/ui/Icon";

type LocationState =
  | { status: "idle" | "locating" }
  | { status: "ready"; point: LocationReading }
  | { status: "unavailable"; message: string };

const EXPIRED = "That location has expired. Get your location again or type a place name.";

/** A snapshot for the next message. Never put coordinates in the chat transcript or browser storage. */
export function useAssistantLocation() {
  const [state, setState] = useState<LocationState>({ status: "idle" });
  const attempt = useRef(0);
  useEffect(() => () => { attempt.current++; }, []);
  useEffect(() => {
    if (state.status !== "ready") return;
    const remaining = Math.max(0, state.point.timestamp + LOCATION_MAX_AGE_MS - Date.now());
    const timer = window.setTimeout(() => setState({ status: "unavailable", message: EXPIRED }), remaining);
    return () => window.clearTimeout(timer);
  }, [state]);

  function clear() {
    attempt.current++;
    setState({ status: "idle" });
  }

  function locate() {
    if (!navigator.geolocation || !window.isSecureContext) {
      setState({ status: "unavailable", message: "This browser can’t get your location here. Type a place name instead." });
      return;
    }
    const current = ++attempt.current;
    setState({ status: "locating" });
    navigator.geolocation.getCurrentPosition(({ coords, timestamp }) => {
      if (current !== attempt.current) return;
      const { latitude, longitude, accuracy } = coords;
      const point = approximateLocation({ latitude, longitude, accuracy, timestamp }, Date.now());
      setState(point ? { status: "ready", point } : {
        status: "unavailable", message: "Your device couldn’t provide a fresh, accurate location. Try again or type a place name.",
      });
    }, (failure) => {
      if (current !== attempt.current) return;
      const reason = failure.code === 1 ? "Location access is off for this site." : failure.code === 3 ? "Location lookup timed out." : "Your device couldn’t find its location.";
      setState({ status: "unavailable", message: `${reason} You can type a place name instead.` });
    }, { enableHighAccuracy: false, maximumAge: 0, timeout: 12_000 });
  }
  // Recheck at send time, including after a suspended mobile tab resumes.
  function takePoint() {
    if (state.status !== "ready") return undefined;
    clear();
    return approximateLocation(state.point, Date.now()) ?? undefined;
  }
  return { state, locate, clear, takePoint };
}

export function LocationControl({ location, disabled }: { location: ReturnType<typeof useAssistantLocation>; disabled: boolean }) {
  const { state, clear, locate } = location;
  const descriptionId = useId();
  const ready = state.status === "ready";
  const locating = state.status === "locating";
  const buttonText = ready ? "Remove location" : locating ? "Cancel lookup" : "Use my location";
  let explanation = "Shares approximate location with Google for this question.";
  if (ready) {
    const { accuracy, timestamp } = state.point;
    const distance = accuracy < 1000 ? `${accuracy} m` : `${(accuracy / 1000).toFixed(1)} km`;
    const time = new Date(timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    explanation = `Location ready · within about ${distance} at ${time}. Shared when you send.`;
  } else if (locating) explanation = "Finding your location…";
  else if (state.status === "unavailable") explanation = state.message;

  return <div className="flex min-w-0 flex-wrap items-center gap-x-3">
    <button type="button" aria-describedby={descriptionId} onClick={ready || locating ? clear : locate} disabled={disabled && !ready && !locating} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 text-sm font-semibold text-accent disabled:opacity-50">
      <Icon name="pin" className="size-4" />{buttonText}
    </button>
    <p id={descriptionId} role="status" className="min-w-32 flex-1 text-xs leading-snug text-muted">{explanation}</p>
  </div>;
}
