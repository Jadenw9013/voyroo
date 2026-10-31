"use client";

import { useEffect, useRef, useState } from "react";
import { driverStays, emergencyLines, ESSENTIAL_FIELDS, guessNationality, hasEssentials, type EssentialField } from "@/domain/essentials";
import { telUrl } from "@/domain/links";
import { monthDay, todayIn } from "@/domain/time";
import type { Essentials as EssentialsT, Item, Source } from "@/domain/types";
import { useTrip } from "@/client/store";
import { Icon } from "@/ui/Icon";
import { btn, field, label } from "@/ui/kit";
import { Sheet } from "@/ui/Sheet";
import { DriverSheet } from "./Driver";

/*
 * Essentials: emergency numbers, the embassy, entry rules, money, plugs and
 * tap water, in the trip so they open with no signal. A web-search draft is
 * a starting point: it shows its sources and when it was looked up, and the
 * card says "verify before you go" whoever wrote it. Phone numbers only
 * become tap-to-call once someone in the group has checked them.
 */

const longDate = (date: string) => `${monthDay(date)}, ${date.slice(0, 4)}`;

export function Essentials({ focus = false }: { focus?: boolean }) {
  const { trip } = useTrip();
  const ref = useRef<HTMLElement>(null);
  const [editing, setEditing] = useState(false);
  const [redo, setRedo] = useState(false);
  const [driver, setDriver] = useState<Item | null>(null);
  const e = trip.essentials;
  const has = hasEssentials(e);

  useEffect(() => {
    if (focus) ref.current?.scrollIntoView({ block: "start" });
  }, [focus]);

  return (
    <section ref={ref} id="essentials" aria-labelledby="essentials-title" className="scroll-mt-20 rounded-3xl border border-line bg-surface p-5 shadow-lift">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="essentials-title" className="text-lg font-bold">
          Essentials
        </h2>
        {has && (
          <button type="button" onClick={() => setEditing(true)} className={`${btn.quiet} -mr-2`}>
            <Icon name="pencil" className="size-4" />
            Edit
          </button>
        )}
      </div>

      {has ? (
        <>
          <Stamp e={e} />
          <Facts e={e} />
          {!!e.sources?.length && <Sources sources={e.sources} />}
          <Actions e={e} onRedo={() => setRedo((r) => !r)} redo={redo} />
          {redo && <DraftForm replacing onDone={() => setRedo(false)} />}
        </>
      ) : (
        <>
          <p className="text-base">Emergency numbers, your embassy, entry rules, money, plugs and tap water, kept on your phone for when there&apos;s no signal.</p>
          <DraftForm onDone={() => {}} />
          <button type="button" onClick={() => setEditing(true)} className={`${btn.quiet} mt-1 -ml-3`}>
            <Icon name="pencil" className="size-4" />
            Fill in yourself
          </button>
        </>
      )}

      <DriverList onPick={setDriver} />

      {editing && <EditSheet onClose={() => setEditing(false)} />}
      {driver && <DriverSheet item={driver} onClose={() => setDriver(null)} />}
    </section>
  );
}

/** Who stands behind what's written here, and always: verify before you go. */
function Stamp({ e }: { e: EssentialsT }) {
  if (e.checkedBy && e.checkedOn) {
    return (
      <p className="mb-3 flex items-start gap-2 rounded-xl bg-ok-soft px-3 py-2.5 text-sm text-ok">
        <Icon name="check" className="mt-0.5 size-4 shrink-0" />
        <span>
          <span className="font-bold">
            Checked by {e.checkedBy} on {longDate(e.checkedOn)}.
          </span>{" "}
          Rules change: verify before you go.
        </span>
      </p>
    );
  }
  return (
    <p role="note" className="mb-3 flex items-start gap-2 rounded-xl border border-todo bg-todo-soft px-3 py-2.5 text-sm text-todo">
      <Icon name="clock" className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="font-bold">Verify before you go.</span>{" "}
        {!e.draftedOn
          ? "No one in the group has checked this yet."
          : e.sources?.length
            ? `A draft from a web search, checked on ${longDate(e.draftedOn)}. No one in the group has checked it yet.`
            : `A draft written on ${longDate(e.draftedOn)} without a web search, which wasn't available. Treat every line as unchecked.`}
      </span>
    </p>
  );
}

function Facts({ e }: { e: EssentialsT }) {
  const checked = !!e.checkedBy;
  return (
    <dl className="flex flex-col divide-y divide-line">
      {ESSENTIAL_FIELDS.filter((f) => e[f.key]?.trim()).map((f) => (
        <div key={f.key} className="py-2.5">
          <dt className="text-sm font-bold text-muted">
            {f.label}
            {f.key === "embassy" && e.nationality ? ` (${e.nationality})` : ""}
            {f.key === "entry" && e.nationality ? ` for ${e.nationality} passports` : ""}
          </dt>
          <dd className="mt-0.5 text-base whitespace-pre-line">{f.key === "emergency" ? <Emergency text={e.emergency} checked={checked} /> : e[f.key]}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Numbers are plain text until someone checks them: an unverified number is never one tap away. */
function Emergency({ text, checked }: { text?: string; checked: boolean }) {
  return (
    <ul className="flex flex-col gap-1">
      {emergencyLines(text).map((line, i) =>
        typeof line === "string" ? (
          <li key={i}>{line}</li>
        ) : (
          <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span>{line.label}</span>
            {checked ? (
              <a href={telUrl(line.number)} className="tnum inline-flex min-h-11 items-center gap-1.5 font-bold text-accent">
                <Icon name="phone" className="size-4" />
                {line.number}
              </a>
            ) : (
              <span className="tnum font-bold">{line.number}</span>
            )}
          </li>
        ),
      )}
    </ul>
  );
}

function Sources({ sources }: { sources: Source[] }) {
  return (
    <div className="mt-2">
      <p className="text-sm font-bold text-muted">Sources</p>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
        {sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-accent underline underline-offset-2">
              {s.title || hostOf(s.url)}
              <Icon name="external" className="size-3.5" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

function Actions({ e, onRedo, redo }: { e: EssentialsT; onRedo: () => void; redo: boolean }) {
  const { trip, me, apply } = useTrip();
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {!e.checkedBy && (
        <button
          type="button"
          onClick={() => void apply([{ op: "trip.update", set: { essentials: { checkedBy: me, checkedOn: todayIn(trip.tz) } } }], { message: "Marked the essentials as checked" })}
          className={btn.secondary}
        >
          <Icon name="check" />I checked these
        </button>
      )}
      <button type="button" onClick={onRedo} aria-expanded={redo} className={btn.quiet}>
        <Icon name="sparkles" />
        New draft
      </button>
    </div>
  );
}

/** Asks for a web-search draft and puts it in the trip as one undoable edit. */
function DraftForm({ replacing = false, onDone }: { replacing?: boolean; onDone: () => void }) {
  const { trip, tripId, apply, online } = useTrip();
  const [nationality, setNationality] = useState(trip.essentials?.nationality ?? guessNationality(trip));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const draft = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/t/${tripId}/essentials`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nationality: nationality.trim() }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return setError(body.error ?? "The draft didn't work. Try again in a moment.");
      const fields = Object.fromEntries(ESSENTIAL_FIELDS.map((f) => [f.key, body.fields?.[f.key] || null])) as Record<EssentialField, string | null>;
      const r = await apply(
        [{ op: "trip.update", set: { essentials: { ...fields, nationality: nationality.trim(), sources: body.sources?.length ? body.sources : null, draftedOn: body.draftedOn ?? null, checkedBy: null, checkedOn: null } } }],
        { message: "Drafted the essentials. Verify before you go." },
      );
      if (!r.ok) return setError(r.error);
      onDone();
    } catch {
      setError("Drafting needs a connection.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        void draft();
      }}
      className="mt-3 flex flex-col gap-2 rounded-2xl bg-sunken/60 p-3.5"
    >
      <label className={label}>
        Passports from
        <input value={nationality} onChange={(ev) => setNationality(ev.target.value)} maxLength={60} placeholder="United States" autoComplete="country-name" className={field} />
      </label>
      <p className="text-sm text-muted">
        {replacing ? "A new draft replaces what's here, including the group's edits. Undo brings them back." : "A web search writes a first draft with its sources. Check it before you rely on it."}
      </p>
      {error && <p className="font-semibold text-danger">{error}</p>}
      <button type="submit" disabled={busy || !online || nationality.trim().length < 2} className={`${btn.primary} self-start`}>
        <Icon name="sparkles" />
        {busy ? "Searching…" : online ? "Draft with a web search" : "Drafting needs a connection"}
      </button>
    </form>
  );
}

function EditSheet({ onClose }: { onClose: () => void }) {
  const { trip, apply } = useTrip();
  const before = trip.essentials ?? {};
  const [v, setV] = useState<Record<EssentialField | "nationality", string>>(() => ({
    nationality: before.nationality ?? guessNationality(trip),
    ...(Object.fromEntries(ESSENTIAL_FIELDS.map((f) => [f.key, before[f.key] ?? ""])) as Record<EssentialField, string>),
  }));
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet open onClose={onClose} title="Edit essentials" wide>
      <form
        onSubmit={async (ev) => {
          ev.preventDefault();
          const set: Record<string, string | null> = {};
          for (const [k, val] of Object.entries(v)) {
            const next = val.trim();
            if (next !== (before[k as keyof EssentialsT] ?? "")) set[k] = next || null;
          }
          if (!Object.keys(set).length) return onClose();
          const r = await apply([{ op: "trip.update", set: { essentials: set } }], { message: "Essentials saved" });
          if (r.ok) onClose();
          else setError(r.error);
        }}
        className="flex flex-col gap-3 pt-1 pb-2"
      >
        <label className={label}>
          Passports from
          <input data-autofocus value={v.nationality} onChange={(ev) => setV({ ...v, nationality: ev.target.value })} maxLength={60} className={field} />
        </label>
        {ESSENTIAL_FIELDS.map((f) => (
          <label key={f.key} className={label}>
            {f.label}
            <textarea
              value={v[f.key]}
              onChange={(ev) => setV({ ...v, [f.key]: ev.target.value })}
              rows={f.key === "emergency" || f.key === "embassy" || f.key === "entry" ? 4 : 2}
              maxLength={2000}
              placeholder={f.hint}
              className={`${field} resize-y leading-relaxed`}
            />
          </label>
        ))}
        {error && <p className="font-semibold text-danger">{error}</p>}
        <button type="submit" className={`${btn.primary} self-start`}>
          Save
        </button>
      </form>
    </Sheet>
  );
}

function DriverList({ onPick }: { onPick: (i: Item) => void }) {
  const { trip } = useTrip();
  const stays = driverStays(trip);
  return (
    <div className="mt-4 border-t border-line pt-3">
      <h3 className="text-base font-bold">Show to driver</h3>
      {stays.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Add an address to a stay and it shows up here, in big type for a taxi driver.</p>
      ) : (
        <ul className="mt-1 flex flex-col">
          {stays.map((s) => (
            <li key={s.id}>
              <button type="button" onClick={() => onPick(s)} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-1 py-1.5 text-left hover:bg-sunken">
                <Icon name="bed" className="size-5 shrink-0 text-k-stay" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{s.title}</span>
                  <span className="block truncate text-sm text-muted">{s.place?.address || s.place?.name}</span>
                </span>
                <span className="sr-only">Show to driver</span>
                <Icon name="chevronRight" className="size-4 text-muted" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
