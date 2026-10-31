"use client";

import { prepareChange } from "@/domain/change";
import { useTrip, type Pending } from "@/client/store";
import { btn } from "@/ui/kit";
import { asProposal, ConfirmCard } from "./assistant/Assistant";

/**
 * Edits made on this phone that the server wouldn't take as they were: one
 * that touches something booked waits for a confirmation, one that can't
 * apply (or kept hitting server errors) waits to be retried or discarded.
 * Nothing leaves the outbox without a person deciding.
 */
export function HeldEdits() {
  const { held } = useTrip();
  if (!held.length) return null;
  return (
    <section aria-label="Edits that need a look" className="mx-auto mb-4 flex w-full max-w-3xl flex-col gap-3 px-4 md:px-0">
      {held.map((p) => (
        <HeldEdit key={p.key} pending={p} />
      ))}
    </section>
  );
}

function HeldEdit({ pending }: { pending: Pending }) {
  const { trip, version, me, resolveHeld } = useTrip();
  const preview = prepareChange({ trip, version }, pending.ops, { author: me, confirmed: true });
  const summary = preview.ok ? preview.entry.summary : [];
  const error = pending.held?.error ?? "";

  if (pending.held?.reason === "confirm") {
    return (
      <ConfirmCard
        pending={{ message: `An edit made on this phone needs a confirmation. ${error}`, ops: pending.ops, summary }}
        onConfirm={() => resolveHeld(pending.key, "send")}
        onDismiss={() => resolveHeld(pending.key, "discard")}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-danger/60 bg-surface p-4" role="alert">
      <p className="text-base font-bold text-danger">An edit made on this phone didn&apos;t save. {error}</p>
      {summary.length > 0 && (
        <ul className="list-disc pl-5 text-base">
          {summary.map((s) => (
            <li key={s}>{asProposal(s)}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => resolveHeld(pending.key, "send")} className={btn.primary}>
          Try again
        </button>
        <button type="button" onClick={() => resolveHeld(pending.key, "discard")} className={btn.secondary}>
          Discard
        </button>
      </div>
    </div>
  );
}
