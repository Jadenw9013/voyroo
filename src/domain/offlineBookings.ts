import type { Trip, When } from "./types";

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const when = (value: When | null | undefined, zone: string) => value ? `${value.date}${value.time ? ` ${value.time}` : ""} (${value.tz ?? zone})` : "Not specified";

/** A standalone document with no scripts, remote fonts, images or network dependencies. */
export function offlineBookings(trip: Trip, savedAt: string): string {
  const row = (label: string, value?: string) => value ? `<dt>${escape(label)}</dt><dd>${escape(value)}</dd>` : "";
  const bookings = trip.items.filter((item) => item.booking).sort((a, b) => (a.start?.date ?? "9999").localeCompare(b.start?.date ?? "9999"));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escape(trip.name)} — saved bookings</title><style>body{font:18px/1.5 system-ui,sans-serif;max-width:48rem;margin:0 auto;padding:24px;color:#172e30;background:#faf9f5}article{border:1px solid #bac6bf;border-radius:12px;padding:20px;margin:20px 0;break-inside:avoid}h1,h2{line-height:1.2}dt{font-size:14px;color:#455956;margin-top:12px}dd{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}small{color:#455956}@media print{body{background:white;padding:0}}</style></head><body><h1>${escape(trip.name)}</h1><p>Offline booking details</p><small>Saved ${escape(savedAt)}. This copy does not update automatically. Keep it private: it contains your booking references. Booking websites and maps need a connection.</small>${bookings.map((item) => {
    const b = item.booking!;
    return `<article><h2>${escape(item.title)}</h2><dl>${row("Reservation", b.state === "booked" ? "Booked" : "Still to book")}${row("Booked through", b.source)}${row("Confirmation number", b.confirmation)}${row("Starts / check-in", when(item.start, trip.tz))}${row("Ends / check-out", item.end ? when(item.end, trip.tz) : undefined)}${row("Place", item.place?.name)}${row("Address", item.place?.address)}${row("Price", b.price ? `${b.price.amount} ${b.price.currency}` : undefined)}${row("Booked by", b.by)}${row("Booking notes", b.note)}${row("Phone", item.contact?.phone)}${row("Booking URL", b.url)}${row("Notes", item.notes)}</dl></article>`;
  }).join("") || "<p>No bookings saved yet.</p>"}</body></html>`;
}
