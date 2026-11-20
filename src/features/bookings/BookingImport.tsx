"use client";

import { useEffect, useState } from "react";
import { useTrip } from "@/client/store";
import { btn, field, label } from "@/ui/kit";
import { Sheet } from "@/ui/Sheet";

export function BookingImport() {
  const [open, setOpen] = useState(false);
  return <><button type="button" onClick={() => setOpen(true)} className={`${btn.secondary} self-start`}>Import booking email</button>
    {open && <Sheet open onClose={() => setOpen(false)} title="Booking emails"><BookingImportBody /></Sheet>}</>;
}

function BookingImportBody() {
  const { tripId, online, refresh } = useTrip();
  const [address, setAddress] = useState<string | null>(null);
  const [inboxState, setInboxState] = useState<"loading" | "ready" | "error">("loading");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch(`/api/t/${tripId}/bookings`).then(async (r) => {
      if (!r.ok) throw new Error("Couldn't load the forwarding address.");
      const b = await r.json();
      if (active) { setAddress(b.address); setInboxState("ready"); }
    }).catch(() => { if (active) { setInboxState("error"); setError("Couldn't load the forwarding address. Check your connection and reopen this panel."); } });
    return () => { active = false; };
  }, [tripId]);

  async function importEmail() {
    setBusy(true); setError(""); setMessage("");
    try {
      const res = await fetch(`/api/t/${tripId}/bookings`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't import the email.");
      await refresh();
      setMessage(body.replayed ? "This email was already imported. No duplicate bookings added." : body.added ? `Added ${body.added} booking${body.added === 1 ? "" : "s"} to your plan${body.skipped ? `; ${body.skipped} already there` : ""}. Open the bookings to check dates and details.` : body.skipped ? "These bookings are already on your plan." : "No bookings found. Try pasting the full confirmation email.");
    } catch (e) { setError(e instanceof Error ? e.message : "Check your connection and try again."); }
    finally { setBusy(false); }
  }

  return <div className="flex flex-col gap-4 pt-1">
    <p className="text-base text-muted">Import the dates, place, booking source and confirmation number from your email.</p>
    {address ? <div className="flex flex-col gap-2 rounded-xl bg-sunken p-3">
      <label className={label}>Your trip’s private email address<input readOnly value={address} onFocus={(e) => e.target.select()} className={field} /></label>
      <button type="button" className={btn.secondary} onClick={async () => { try { await navigator.clipboard.writeText(address); setMessage("Email address copied."); } catch { setError("Select the address and copy it."); } }}>Copy email address</button>
      <p className="text-sm text-muted">Keep this within your group. Anyone with the address can add bookings. Forward the email body; attachments alone aren’t read.</p>
    </div> : inboxState !== "error" && <p className="text-sm text-muted">{inboxState === "ready" ? "You can import a booking by pasting the confirmation below. Email forwarding hasn’t been connected yet." : "Loading forwarding address…"}</p>}
    <label className={label}>Or paste a confirmation email<textarea rows={7} maxLength={60000} value={text} onChange={(e) => setText(e.target.value)} className={field} placeholder="Paste the email, including dates and booking reference" /></label>
    <button type="button" className={btn.primary} disabled={busy || !online || !text.trim()} onClick={() => void importEmail()}>{busy ? "Reading email…" : "Add bookings to itinerary"}</button>
    {!online && <p className="text-sm text-muted">Connect to the internet to import an email. Saved bookings are available offline.</p>}
    {message && <p role="status" className="text-sm text-ok">{message}</p>}
    {error && <p role="alert" className="text-sm text-danger">{error}</p>}
  </div>;
}
