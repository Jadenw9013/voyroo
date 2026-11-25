"use client";

import { useRef, useState, type FormEvent } from "react";
import { useTrip } from "@/client/store";
import { Icon } from "@/ui/Icon";
import { btn, field, label } from "@/ui/kit";
import { Sheet } from "@/ui/Sheet";

export function ChangePasscode() {
  const { passcodeAccess } = useTrip();
  const [open, setOpen] = useState(false);
  if (passcodeAccess === "member") return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={btn.secondary}>
        <Icon name="lock" className="size-4" />
        Change passcode
      </button>
      {open && <PasscodeSheet needsCurrent={passcodeAccess === "current-passcode"} onClose={() => setOpen(false)} />}
    </>
  );
}

function PasscodeSheet({ needsCurrent, onClose }: { needsCurrent: boolean; onClose: () => void }) {
  const { tripId, online } = useTrip();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [visible, setVisible] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const canSave = online && next.trim().length >= 4 && (!needsCurrent || !!current.trim());

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/t/${tripId}/me`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPasscode: next.trim(), ...(needsCurrent ? { passcode: current.trim() } : {}) }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.ok !== true) {
        setError(body?.error || "Couldn’t change the passcode. Try again.");
        return;
      }
      setCurrent("");
      setNext("");
      setSaved(true);
    } catch {
      setError("Couldn’t reach Voyroo. Check your connection and try again.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  return (
    <Sheet open onClose={onClose} title="Change trip passcode">
      {saved ? (
        <div className="flex flex-col items-start gap-3 pt-1">
          <p role="status" className="font-semibold text-accent">Passcode changed.</p>
          <p className="text-sm text-muted">Send the new passcode separately from the invite link.</p>
          <button type="button" className={btn.primary} onClick={onClose}>Done</button>
        </div>
      ) : (
        <form onSubmit={save} className="flex flex-col gap-3 pt-1">
          <p className="text-sm text-muted">New guests will need the new passcode. People already in the trip keep their access.</p>
          {needsCurrent && (
            <label className={label}>
              Current passcode
              <input data-autofocus type="password" value={current} onChange={(event) => setCurrent(event.target.value)}
                required maxLength={100} autoComplete="current-password" disabled={busy} className={field} />
            </label>
          )}
          <div>
            <label className={label}>
              New passcode
              <input data-autofocus={needsCurrent ? undefined : true} type={visible ? "text" : "password"} value={next}
                onChange={(event) => setNext(event.target.value)} required minLength={4} maxLength={100}
                autoComplete="new-password" autoCapitalize="none" spellCheck={false} disabled={busy} className={field} />
            </label>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm text-muted">4–100 characters</span>
              <button type="button" className={btn.quiet} onClick={() => setVisible((show) => !show)}>
                {visible ? "Hide passcode" : "Show passcode"}
              </button>
            </div>
          </div>
          {!online && <p role="status" className="text-sm text-muted">Connect to the internet to change the passcode.</p>}
          {error && <p role="alert" className="font-semibold text-danger">{error}</p>}
          <button type="submit" disabled={!canSave || busy} className={`${btn.primary} self-start`}>
            {busy ? "Saving…" : "Save new passcode"}
          </button>
        </form>
      )}
    </Sheet>
  );
}
