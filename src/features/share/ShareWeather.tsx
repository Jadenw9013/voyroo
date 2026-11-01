"use client";

import { useEffect, useState } from "react";
import { describeSky, rainWords, toUnit, type TempUnit, type WeatherReport } from "@/domain/weather";
import { useTempUnit } from "@/client/prefs";
import { WeatherCredit, WeatherIcon } from "../weather/DayWeather";

/*
 * The weather lines on the viewing link: one request for the page (the token
 * is the access), then a line under each day in words, and the credit
 * Open-Meteo's licence asks for. Nothing shows if the weather can't be had.
 */

const reports = new Map<string, Promise<WeatherReport | null>>();

function load(tripId: string, token: string): Promise<WeatherReport | null> {
  const key = `${tripId}:${token}`;
  let p = reports.get(key);
  if (!p) {
    p = fetch(`/api/t/${encodeURIComponent(tripId)}/weather?token=${token}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<WeatherReport>) : null))
      .catch(() => null);
    reports.set(key, p);
  }
  return p;
}

function useReport(tripId: string, token: string): WeatherReport | null {
  const [report, setReport] = useState<WeatherReport | null>(null);
  useEffect(() => {
    let live = true;
    void load(tripId, token).then((r) => live && setReport(r));
    return () => {
      live = false;
    };
  }, [tripId, token]);
  return report;
}

/** "Typical: usually 75° / 54°F, dry season" under a day's heading. */
export function ShareWeatherLine({ tripId, token, date, unit: fallback }: { tripId: string; token: string; date: string; unit: TempUnit }) {
  const report = useReport(tripId, token);
  const [unit] = useTempUnit(fallback);
  const w = report?.days[date];
  if (!w) return null;
  const { words, sky } = describeSky(w);
  const rain = rainWords(w);
  const range = `${toUnit(w.hi, unit)}° / ${toUnit(w.lo, unit)}°${unit}`;
  const season = w.kind === "typical" && w.season ? `${w.season} season` : null;
  return (
    <p className="flex items-start gap-1.5 text-sm text-muted">
      <WeatherIcon sky={sky} className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">
        <span className="tnum">
          {w.kind === "typical" ? `Typical: usually ${range}` : `${words}, ${range}`}
        </span>
        {w.kind === "typical" ? (season ? `, ${season}` : `, ${words.toLowerCase()}`) : rain ? `, ${rain}` : ""}
      </span>
    </p>
  );
}

/** The credit, once, when there's weather on the page. */
export function ShareWeatherCredit({ tripId, token }: { tripId: string; token: string }) {
  const report = useReport(tripId, token);
  if (!report || !Object.keys(report.days).length) return null;
  return (
    <p className="text-sm text-muted">
      {report.years ? `Typical weather from ${report.years}. ` : ""}
      <WeatherCredit />
    </p>
  );
}
