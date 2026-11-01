"use client";

import { defaultTempUnit, describeSky, rainWords, toUnit, type DayWeather as Day, type Sky, type TempUnit } from "@/domain/weather";
import { formatTime, localParts, monthDay, todayIn } from "@/domain/time";
import { useTempUnit } from "@/client/prefs";
import { useTrip } from "@/client/store";
import { useWeather } from "@/client/weather";

/*
 * A day's weather in words as well as a picture: "Partly cloudy, 75°/54°F,
 * 30% chance of rain". Past the forecast it says what's typical, labelled as
 * such. Open-Meteo's data licence asks for credit next to it.
 */

const SKY: Record<Sky, string> = {
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  partly: "M12 2v2M4.9 4.9l1.4 1.4M20 12h2M17.7 6.3l1.4-1.4M15.9 13.1A4 4 0 0 0 8.1 10M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6z",
  cloud: "M17.5 19H9a7 7 0 1 1 6.7-9h1.8a4.5 4.5 0 1 1 0 9z",
  fog: "M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2M16 17H7M17 21H9",
  drizzle: "M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2M8 19v1M8 14v1M16 19v1M16 14v1M12 21v1M12 16v1",
  rain: "M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2M16 14v6M8 14v6M12 16v6",
  snow: "M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2M8 15h.01M8 19h.01M12 17h.01M12 21h.01M16 15h.01M16 19h.01",
  storm: "M6 16.3A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 .5 9M13 11l-4 6h6l-4 6",
};

export function WeatherIcon({ sky, className = "size-5" }: { sky: Sky; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d={SKY[sky]} />
    </svg>
  );
}

/** "75° / 54°F": the high, then the low. */
function HighLow({ w, unit }: { w: Day; unit: TempUnit }) {
  return (
    <span className="tnum whitespace-nowrap">
      <span className="sr-only">High and low: </span>
      {toUnit(w.hi, unit)}° / {toUnit(w.lo, unit)}°{unit}
    </span>
  );
}

function useDay(date: string) {
  const { tripId, trip } = useTrip();
  const { report } = useWeather(tripId, trip);
  const [unit] = useTempUnit(defaultTempUnit(trip));
  return { w: report?.days[date] ?? null, report, unit, trip };
}

const seasonWords = (w: Day) => (w.kind === "typical" && w.season ? `${w.season === "rainy" ? "Rainy" : "Dry"} season` : null);

/** "Dry season, rain on about 3 days in 10": the parts there are, first letter up. */
function sentence(parts: (string | null)[]): string {
  const s = parts.filter(Boolean).join(", ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** When the forecast is from, in the trip's time: "as of 2:15 PM", or "as of Oct 30, 2:15 PM" once it's old. */
export function asOfWords(asOf: number, tz: string, now = Date.now()): string {
  const at = localParts(asOf, tz);
  return at.date === todayIn(tz, now) ? `as of ${formatTime(at.time)}` : `as of ${monthDay(at.date)}, ${formatTime(at.time)}`;
}

export function WeatherCredit({ className = "" }: { className?: string }) {
  return (
    <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className={`underline decoration-line underline-offset-2 hover:text-accent ${className}`}>
      Weather data by Open-Meteo.com
    </a>
  );
}

/** Today: the day's weather in a few words under its heading, where it's for, and how fresh it is. */
export function DayWeatherCard({ date }: { date: string }) {
  const { w, report, unit, trip } = useDay(date);
  if (!w || !report) return null;
  const { words, sky } = describeSky(w);
  const rain = rainWords(w);
  const typical = w.kind === "typical";
  const season = seasonWords(w);
  const detail = sentence([season, rain]);
  const source = typical ? `Typical for ${w.place ?? "these dates"}, ${report.years ?? "past years"}` : `Forecast for ${w.place ?? "here"} ${asOfWords(report.asOf, trip.tz)}`;
  return (
    <section aria-label="Weather" className="flex items-start gap-3">
      <WeatherIcon sky={sky} className="mt-0.5 size-6 text-ink" />
      <div className="min-w-0 flex-1">
        <p className="text-base">
          <span className="font-semibold">{typical ? "Usually" : words}</span> <HighLow w={w} unit={unit} />
          {detail && <span>. {detail}</span>}
        </p>
        <p className="text-sm text-muted">
          {source}. <WeatherCredit />
        </p>
      </div>
    </section>
  );
}

/** Plan: one quiet line under a day's heading. */
export function DayWeatherLine({ date }: { date: string }) {
  const { w, unit } = useDay(date);
  if (!w) return null;
  const { words, sky } = describeSky(w);
  const rain = rainWords(w);
  const season = seasonWords(w);
  return (
    <p className="mt-1 flex items-start gap-1.5 text-sm text-muted">
      <WeatherIcon sky={sky} className="mt-0.5 size-4 shrink-0" />
      <span className="min-w-0">
        {w.kind === "typical" ? (
          <>
            Typical: usually <HighLow w={w} unit={unit} />
            {season ? `, ${season.toLowerCase()}` : `, ${words.toLowerCase()}`}
          </>
        ) : (
          <>
            {words}, <HighLow w={w} unit={unit} />
            {rain ? `, ${rain}` : ""}
          </>
        )}
      </span>
    </p>
  );
}

/** Plan: once under the days, where the forecast is from and how fresh it is. */
export function WeatherFootnote() {
  const { tripId, trip } = useTrip();
  const { report } = useWeather(tripId, trip);
  if (!report || !Object.keys(report.days).length) return null;
  const hasForecast = Object.values(report.days).some((d) => d.kind === "forecast");
  const hasTypical = Object.values(report.days).some((d) => d.kind === "typical");
  return (
    <p className="text-sm text-muted">
      {[hasForecast ? `Forecast ${asOfWords(report.asOf, trip.tz)}` : null, hasTypical ? `${hasForecast ? "typical" : "Typical"} weather from ${report.years ?? "past years"}` : null].filter(Boolean).join("; ")}
      {". "}
      <WeatherCredit />
    </p>
  );
}
