"use client";

import { useTrip } from "@/client/store";
import { offlineBookings } from "@/domain/offlineBookings";
import { btn } from "@/ui/kit";

export function OfflineBookings() {
  const { trip, notify } = useTrip();
  return <div className="flex flex-col gap-1">
    <button type="button" className={`${btn.secondary} self-start`} onClick={() => {
      const url = URL.createObjectURL(new Blob([offlineBookings(trip, new Date().toLocaleString())], { type: "text/html;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url; link.download = `${trip.id}-bookings.html`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      notify("Booking copy downloaded. Open it from Downloads or Files without Wi-Fi.");
    }}>Save bookings offline</button>
    <p className="text-sm text-muted">Download dates, addresses and confirmation numbers to open from Files without Wi-Fi. Save a fresh copy after changes.</p>
  </div>;
}
