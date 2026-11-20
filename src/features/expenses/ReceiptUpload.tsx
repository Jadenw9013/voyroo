"use client";

import { useRef, useState } from "react";
import { useTrip } from "@/client/store";
import { btn } from "@/ui/kit";
import { shrinkScreenshot } from "../assistant/images";
import type { ExpenseStart } from "./ExpenseForm";

/** Upload only: the expense form is still the authority for total, payer and split. */
export function ReceiptUpload({ onRead, onBusy }: { onRead: (draft: ExpenseStart) => void; onBusy: (busy: boolean) => void }) {
  const { tripId, online } = useTrip();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function upload(file: File) {
    setBusy(true); onBusy(true); setMessage("");
    try {
      if (file.size > 20_000_000) throw new Error("Choose a photo under 20 MB.");
      const image = await shrinkScreenshot(file);
      if (!image) throw new Error("Couldn't open this photo. Try a JPEG or PNG.");
      const res = await fetch(`/api/t/${tripId}/receipts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't upload the photo.");
      onRead({ ...body.draft, receiptId: body.receiptId });
      setMessage(body.duplicateTitle ? `This photo is already attached to “${body.duplicateTitle}”. Check before logging it again.` : body.warning ?? "Receipt read. Check the total, currency, payer and split before saving.");
    } catch (e) { setMessage(e instanceof Error ? e.message : "Couldn't upload. Check your connection and try again."); }
    finally { setBusy(false); onBusy(false); }
  }
  return <div className="flex flex-col gap-2">
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" className="hidden" aria-label="Receipt photo" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) void upload(file); }} />
    <button type="button" disabled={!online || busy} className={`${btn.secondary} self-start`} onClick={() => input.current?.click()}>{busy ? "Reading receipt…" : "Upload receipt photo"}</button>
    <p className="text-sm text-muted">{online ? "The photo stays with the expense, visible to your group. Crop out payment details before uploading." : "Connect to upload a receipt. You can still log expenses offline."}</p>
    {message && <p role="status" className="text-sm text-muted">{message}</p>}
  </div>;
}
