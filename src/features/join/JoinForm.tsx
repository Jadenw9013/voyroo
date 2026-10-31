"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/ui/Icon";
import { btn, field, label } from "@/ui/kit";
import { AccountPanel } from "../account/AccountPanel";
import { Brand } from "@/ui/Brand";

/**
 * One step in: your first name and the trip's passcode. An invite link can
 * carry the passcode after #code=, which never leaves the phone.
 */
export function JoinForm({
  tripId,
  tripName,
  hasPasscode,
  people,
  initialName = "",
  hasAccount = false,
  googleConfigured = false,
}: {
  tripId: string;
  tripName: string;
  hasPasscode: boolean;
  people: string[];
  initialName?: string;
  hasAccount?: boolean;
  googleConfigured?: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [pass, setPass] = useState("");
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const code = new URLSearchParams(window.location.hash.slice(1)).get("code");
    // Read once from the link the person opened; nothing to sync afterwards.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (code) setPass(code);
    try {
      const last = localStorage.getItem("trip-name");
      if (last && !initialName) setName(last);
    } catch {
      // Not remembered on this phone.
    }
  }, [initialName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (googleConfigured && !hasAccount) {
      setError({ field: "account", message: "Please sign in with a valid Google account first to join." });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/t/${tripId}/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.trim(), passcode: pass }) });
      const body = await res.json();
      if (!res.ok) {
        setError({ field: body.field, message: body.error });
        return;
      }
      try {
        localStorage.setItem("trip-name", body.name);
      } catch {
        // Fine.
      }
      window.location.replace(`/t/${tripId}`);
    } catch {
      setError({ message: "Joining needs a connection. Try again when you have signal." });
    } finally {
      setBusy(false);
    }
  }

  const returnTo = typeof window !== "undefined" ? window.location.pathname + window.location.search + window.location.hash : `/t/${tripId}/join`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="flex flex-col gap-6 rounded-3xl border border-line bg-surface p-6 shadow-lift sm:p-8">
        <Brand />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-extrabold tracking-tight">{tripName}</h1>
          <p className="text-base text-muted">
            {googleConfigured && !hasAccount
              ? "Planners must sign in with a valid Google account to join this trip."
              : hasPasscode
                ? "Enter your first name and the passcode the group shared with you."
                : "You're the first one here. Choose a passcode for the group: anyone with the link will need it to see the trip."}
          </p>
        </div>

        {googleConfigured && !hasAccount ? (
          <div className="flex flex-col gap-4">
            <a href={`/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`} className="google-sign-in w-full justify-center py-3 text-base">
              <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                <path fill="currentColor" d="M21.8 12.2c0-.7-.1-1.5-.2-2.2H12v4.1h5.5a4.7 4.7 0 0 1-2.1 3.1v2.6h3.4c2-1.8 3-4.4 3-7.6ZM12 22c2.8 0 5.2-.9 6.9-2.5l-3.4-2.6a6.3 6.3 0 0 1-9.3-3.3H2.7v2.7A10.4 10.4 0 0 0 12 22ZM6.2 13.6a6.2 6.2 0 0 1 0-3.2V7.7H2.7a10 10 0 0 0 0 8.6l3.5-2.7ZM12 6c1.6 0 3 .5 4.1 1.6l3.1-3A10 10 0 0 0 12 2a10.4 10.4 0 0 0-9.3 5.7l3.5 2.7A6.2 6.2 0 0 1 12 6Z" />
              </svg>
              Sign in with Google to join
            </a>
            <p className="text-sm text-muted">Only users with valid Google accounts can be added to the planners group.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <label className={label}>
              Your first name {hasAccount && <span className="text-xs font-normal text-muted">(Google account)</span>}
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="given-name"
                maxLength={30}
                required
                readOnly={hasAccount}
                list="trip-people"
                aria-invalid={error?.field === "name"}
                className={`${field} text-lg ${hasAccount ? "bg-sunken text-muted" : ""}`}
              />
              <datalist id="trip-people">
                {people.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </label>
            <label className={label}>
              {hasPasscode ? "Passcode" : "New passcode for the trip"}
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete={hasPasscode ? "current-password" : "new-password"}
                minLength={4}
                required
                aria-invalid={error?.field === "passcode"}
                className={`${field} text-lg`}
              />
            </label>
            {error && (
              <p role="alert" className="text-base font-semibold text-danger">
                {error.message}
              </p>
            )}
            <button type="submit" disabled={busy} className={`${btn.primary} min-h-12 text-lg`}>
              {busy ? "Joining…" : hasPasscode ? "Join the trip" : "Set passcode and join"}
            </button>
          </form>
        )}
        <AccountPanel />
        <button type="button" className={`${btn.quiet} self-start`} onClick={() => window.location.assign(new URL("/?all=1", window.location.origin).href)}>
          <Icon name="back" className="size-4" />
          Back to your trips
        </button>
      </div>
    </main>
  );
}
