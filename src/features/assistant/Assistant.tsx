"use client";

import { useChat } from "@ai-sdk/react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { newId } from "@/domain/ids";
import { directionsUrl, mapsSearchUrl, telUrl } from "@/domain/links";
import { formatDay, formatTime } from "@/domain/time";
import type { Op } from "@/domain/ops";
import type { Item } from "@/domain/types";
import { useView } from "@/client/router";
import { useTrip } from "@/client/store";
import type { ChangeResult, Option } from "@/server/ai/tools";
import { KindChip } from "@/ui/badges";
import { Icon, KIND_ICON } from "@/ui/Icon";
import { btn, field } from "@/ui/kit";
import { chatFor, newConversation, type AssistantMessage } from "./chat";
import { Answer } from "./Answer";
import { GroundingAttribution } from "./GroundingAttribution";
import { LocationControl, useAssistantLocation } from "./Location";
import { shrink } from "./images";
import { ReadAloud } from "./ReadAloud";
import { ReplyStatus } from "./ReplyStatus";
import { VoiceInput } from "./VoiceInput";

type QueuedMessage = { text: string; images: string[]; afterTurn: number };

/**
 * The assistant: answers with real places and sources, changes the trip
 * with Undo, and asks before removing anything.
 */
export function Assistant({ first, itemId, day }: { first: string; itemId: string | null; day: string | null }) {
  const { tripId, online, refresh, trip } = useTrip();
  // The same conversation all session, until "New conversation" (which re-renders to pick up the new one).
  const [conversationNumber, setConversationNumber] = useState(0);
  const { chat, activity } = chatFor(tripId);
  const progress = useSyncExternalStore(activity.subscribe, activity.getSnapshot, activity.getServerSnapshot);
  const { messages, sendMessage, status, error, regenerate, stop, addToolOutput } = useChat<AssistantMessage>({ chat });
  const [input, setInput] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const sent = useRef(false);
  const transcript = useRef<HTMLDivElement>(null);
  const transcriptBody = useRef<HTMLDivElement>(null);
  const follow = useRef<"reply" | "end" | null>("reply");
  const autoScrollTop = useRef<number | null>(null);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = status === "submitted" || status === "streaming";
  const focus = itemId ? trip.items.find((i) => i.id === itemId) : null;

  const location = useAssistantLocation();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const context = { day, itemId };

  useEffect(() => {
    if (sent.current || !first.trim()) return;
    sent.current = true;
    void sendMessage({ text: first.trim() }, { body: { context: { day, itemId } } });
  }, [first, day, itemId, sendMessage]);

  useEffect(() => {
    const pane = transcript.current;
    const body = transcriptBody.current;
    if (!pane || !body) return;
    const position = () => {
      if (!follow.current) return;
      const last = body.lastElementChild;
      const end = pane.scrollHeight - pane.clientHeight;
      // Move the current turn into view as it grows, then leave its first line on screen.
      const top = follow.current === "reply" && last?.hasAttribute("data-assistant-reply")
        ? Math.min(end, pane.scrollTop + last.getBoundingClientRect().top - pane.getBoundingClientRect().top - 16)
        : end;
      const target = Math.max(0, top);
      if (Math.abs(pane.scrollTop - target) < 1) return;
      autoScrollTop.current = target;
      pane.scrollTop = target;
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(body);
    observer.observe(pane);
    return () => observer.disconnect();
  }, []);

  // The assistant changed the trip on the server: fetch it so the screens catch up.
  const seen = useRef(new Set<string>());
  useEffect(() => {
    for (const m of messages)
      for (const p of m.parts) {
        if (!("toolCallId" in p) || p.state !== "output-available" || seen.current.has(p.toolCallId)) continue;
        seen.current.add(p.toolCallId);
        const out = p.output as ChangeResult | undefined;
        if (out && typeof out === "object" && "entryId" in out) void refresh();
      }
  }, [messages, refresh]);

  async function attach(files: FileList | null) {
    const list = Array.from(files ?? []).slice(0, 4 - images.length);
    const urls = await Promise.all(list.map((f) => shrink(f)));
    setImages((cur) => [...cur, ...urls.filter((u): u is string => !!u)].slice(0, 4));
  }

  // Typed while an answer is still coming in: kept, and sent the moment it's done.
  const [queued, setQueued] = useState<QueuedMessage | null>(null);
  const sendQueued = useCallback((message: QueuedMessage) => {
    follow.current = "reply";
    setQueued(null);
    void sendMessage({
      text: message.text || "Here's a screenshot.",
      files: message.images.map((url, i) => ({ type: "file" as const, mediaType: "image/jpeg", url, filename: `screenshot-${i + 1}.jpg` })),
    }, { body: { context: { day, itemId } } });
  }, [day, itemId, sendMessage, setQueued]);
  useEffect(() => {
    if (status !== "ready" || !online || voiceBusy || !queued || progress.stage !== "idle" || queued.afterTurn !== progress.turn) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled && chat.status === "ready") sendQueued(queued);
    });
    return () => { cancelled = true; };
  }, [chat, online, progress, queued, sendQueued, status, voiceBusy]);

  function requestOptions() {
    const point = location.takePoint();
    return { body: { context, ...(point ? { location: point } : {}) } };
  }

  function send() {
    const text = input.trim();
    if (!online || voiceBusy || location.state.status === "locating" || (!text && !images.length)) return;
    follow.current = "reply";
    if (busy) {
      if (queued) return;
      setQueued({ text, images, afterTurn: progress.turn });
      setInput("");
      setImages([]);
      return;
    }
    const options = requestOptions();
    const waiting = messages.at(-1)?.parts.find((p) => p.type === "tool-ask_user" && p.state === "input-available");
    if (waiting && waiting.type === "tool-ask_user" && !images.length) {
      void addToolOutput({ tool: "ask_user", toolCallId: waiting.toolCallId, output: text, options });
    } else {
      void sendMessage({
        text: text || "Here's a screenshot.",
        files: images.map((url, i) => ({ type: "file" as const, mediaType: "image/jpeg", url, filename: `screenshot-${i + 1}.jpg` })),
      }, options);
    }
    setInput("");
    setImages([]);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        ref={transcript}
        role="region"
        aria-label="Conversation"
        tabIndex={0}
        onScroll={(event) => {
          const pane = event.currentTarget;
          const target = autoScrollTop.current;
          autoScrollTop.current = null;
          if (target !== null && Math.abs(pane.scrollTop - target) < 1) return;
          follow.current = pane.scrollHeight - pane.clientHeight - pane.scrollTop < 48 ? "end" : null;
        }}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain [overflow-anchor:none] focus-visible:-outline-offset-3"
      >
        <div ref={transcriptBody} className="flex min-w-0 flex-col gap-4 px-4 py-4 [overflow-wrap:anywhere] sm:px-5">
          {focus && (
            <p className="flex items-center gap-2 rounded-xl bg-sunken px-3 py-2 text-sm">
              <Icon name={KIND_ICON[focus.kind]} className="size-4" />
              About <strong className="truncate">{focus.title}</strong>
            </p>
          )}
          {messages.length === 0 && (!first || conversationNumber > 0) && (
            <div className="flex flex-col gap-2">
              <p className="text-base text-muted">Ask about the itinerary, find a place to stop, or make a change to the plan.</p>
              <div className="flex flex-wrap gap-2" aria-label="Suggested questions">
                {["What’s next?", "What’s nearby?", "How much free time do I have?"].map((prompt) => (
                  <button key={prompt} type="button" className={`${btn.secondary} text-sm`} onClick={() => { setInput(prompt); inputRef.current?.focus(); }}>
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => (
            <Message
              key={m.id}
              m={m}
              answerDisabled={busy || voiceBusy}
              canReadAloud={!busy && !voiceBusy && m === messages.at(-1)}
              onAnswer={(toolCallId, output) => {
                if (busy || voiceBusy) return;
                follow.current = "reply";
                void addToolOutput({ tool: "ask_user", toolCallId, output, options: requestOptions() });
              }}
            />
          ))}
          {queued && (
            <div className="ml-10 flex flex-col items-end gap-1 self-end opacity-70">
              <p className="rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-base whitespace-pre-wrap text-on-accent">{queued.text || "Screenshot queued"}</p>
              {busy && queued.afterTurn === progress.turn
                ? <p className="text-sm text-muted">Sends when this answer finishes</p>
                : <button type="button" className={`${btn.quiet} text-sm`} disabled={busy || !online || voiceBusy} onClick={() => sendQueued(queued)}>Send queued message</button>}
            </div>
          )}
          {error && (
            <div role="alert" className="flex flex-col gap-2 rounded-2xl bg-todo-soft p-3">
              <p className="text-base font-semibold text-todo">{online ? friendly(error.message) : "You're offline. The assistant needs a connection; your message is kept."}</p>
              <button type="button" onClick={() => { follow.current = "reply"; void regenerate(requestOptions()); }} disabled={!online || voiceBusy || location.state.status === "locating"} className={`${btn.secondary} self-start`}>
                Try again
              </button>
            </div>
          )}
        </div>
      </div>

      <ReplyStatus progress={progress} busy={busy} online={online} />
      <div className="max-h-[65%] shrink-0 overflow-y-auto overscroll-contain border-t border-line bg-surface px-4 pt-3 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:px-5">
        {images.length > 0 && (
          <ul className="mb-3 flex flex-wrap gap-3">
            {images.map((u, i) => (
              <li key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- in-memory screenshot */}
                <img src={u} alt={`Screenshot ${i + 1}`} className="size-14 rounded-lg object-cover" />
                <button type="button" onClick={() => setImages(images.filter((_, j) => j !== i))} aria-label={`Remove screenshot ${i + 1}`} className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-ink text-canvas">
                  <Icon name="close" className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <form
          id="assistant-composer"
          onReset={(event) => {
            event.preventDefault();
            void stop();
            location.clear();
            setVoiceBusy(false);
            setQueued(null);
            setImages([]);
            setInput("");
            newConversation(tripId);
            sent.current = true;
            follow.current = "reply";
            setConversationNumber((number) => number + 1);
            inputRef.current?.focus({ preventScroll: true });
          }}
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex min-w-0 flex-wrap items-end gap-1.5"
        >
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void attach(e.target.files).then(() => (e.target.value = ""))} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={images.length >= 4} aria-label="Add a screenshot" className="flex size-11 shrink-0 items-center justify-center rounded-xl text-muted hover:bg-sunken">
            <Icon name="image" />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith("image/"));
              if (files.length) {
                e.preventDefault();
                const dt = new DataTransfer();
                files.forEach((f) => dt.items.add(f));
                void attach(dt.files);
              }
            }}
            rows={Math.min(5, Math.max(1, input.split("\n").length))}
            placeholder={online ? "Ask Voyroo…" : "Needs a connection"}
            aria-label="Message the assistant"
            data-autofocus
            maxLength={6000}
            className={`${field} max-h-24 min-h-11 min-w-0 flex-1 resize-none overflow-y-auto [field-sizing:content]`}
          />
          <VoiceInput
            key={conversationNumber}
            tripId={tripId}
            online={online}
            disabled={busy}
            onBusyChange={setVoiceBusy}
            onTranscript={(text) => {
              setInput((draft) => [draft.trimEnd(), text].filter(Boolean).join(" ").slice(0, 6000));
              if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus({ preventScroll: true });
            }}
          />
          {busy ? (
            <button type="button" onClick={() => void stop()} aria-label="Stop" title="Stop reply" className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-sunken px-3 text-sm font-semibold text-ink">
              <span className="size-3 rounded-sm bg-ink" />
              Stop
            </button>
          ) : (
            <button type="submit" disabled={!online || voiceBusy || location.state.status === "locating" || (!input.trim() && !images.length)} aria-label="Send" className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-accent text-on-accent disabled:opacity-40">
              <Icon name="send" />
            </button>
          )}
        </form>
        <LocationControl location={location} disabled={!online || busy} />
      </div>
    </div>
  );
}

function friendly(message: string): string {
  try {
    const parsed = JSON.parse(message);
    if (parsed?.error) return String(parsed.error);
  } catch {
    // Plain text.
  }
  return message || "The assistant didn't answer. Try again.";
}

function Message({ m, onAnswer, answerDisabled, canReadAloud }: { m: AssistantMessage; answerDisabled: boolean; canReadAloud: boolean; onAnswer: (toolCallId: string, output: string) => void }) {
  if (m.role === "user") {
    const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
    const pics = m.parts.filter((p) => p.type === "file");
    return (
      <div className="ml-6 flex min-w-0 max-w-[calc(100%-1.5rem)] flex-col items-end gap-1.5 self-end">
        {pics.length > 0 && (
          <div className="flex max-w-full flex-wrap justify-end gap-1.5">
            {pics.map((p, i) =>
              p.type === "file" ? (
                // eslint-disable-next-line @next/next/no-img-element -- in-memory screenshot
                <img key={i} src={p.url} alt={`Screenshot ${i + 1}`} className="h-20 max-w-28 rounded-lg object-cover" />
              ) : null,
            )}
          </div>
        )}
        {text && <p className="rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-base whitespace-pre-wrap text-on-accent">{text}</p>}
      </div>
    );
  }

  return (
    <div data-assistant-reply className="flex min-w-0 flex-col gap-3">
      {m.parts.map((p, i) => {
        const key = `${m.id}-${i}`;
        if (p.type === "text") return p.text.trim() ? <Answer key={key} text={p.text} streaming={p.state === "streaming"} /> : null;
        if (p.type === "tool-show_options") return p.input ? <Options key={key} heading={p.input.heading} options={(p.input.options ?? []) as Option[]} /> : null;
        if (p.type === "tool-ask_user") return <Question key={key} part={p} onAnswer={onAnswer} disabled={answerDisabled} />;
        if (p.type === "tool-add_items" || p.type === "tool-update_items" || p.type === "tool-remove_items" || p.type === "tool-add_todos" || p.type === "tool-add_expenses" || p.type === "tool-add_comment") {
          if (p.state === "output-available") return <ChangeCard key={key} result={p.output as ChangeResult} expenses={p.type === "tool-add_expenses"} />;
          if (p.state === "output-error") return <p key={key} className="text-base text-danger">That change didn&apos;t work: {p.errorText}</p>;
        }
        return null;
      })}
      <GroundingAttribution parts={m.parts} />
      {canReadAloud && m.parts.some((p) => (p.type === "text" && p.text.trim()) || p.type === "tool-show_options" || p.type === "tool-ask_user") && <ReadAloud />}
    </div>
  );
}

function Question({ part, onAnswer, disabled }: { disabled: boolean; part: Extract<AssistantMessage["parts"][number], { type: "tool-ask_user" }>; onAnswer: (id: string, o: string) => void }) {
  if (!part.input) return null;
  if (part.state === "output-available") {
    return (
      <p className="text-base">
        <span className="text-muted" data-spoken-answer>{part.input.question}</span> {String(part.output)}
      </p>
    );
  }
  if (part.state !== "input-available") return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-base font-semibold" data-spoken-answer>{part.input.question}</p>
      <div className="flex flex-wrap gap-2" data-spoken-answer>
        {(part.input.options ?? []).map((o) => (
          <button key={o} type="button" disabled={disabled} onClick={() => onAnswer(part.toolCallId, o!)} className={btn.secondary}>
            {o}
          </button>
        ))}
      </div>
    </div>
  );
}

const VERBS: Record<string, string> = { removed: "Remove", changed: "Change", moved: "Move", updated: "Update", added: "Add", marked: "Mark", renamed: "Rename", edited: "Edit", cleared: "Clear", put: "Put" };

/** "removed “X”" → "Remove “X”": a change that hasn't happened yet. */
export const asProposal = (s: string) => s.replace(/^(\w+)/, (v) => VERBS[v] ?? v.charAt(0).toUpperCase() + v.slice(1));

function ChangeCard({ result, expenses }: { result: ChangeResult; expenses?: boolean }) {
  const { undo, tripId, trip } = useTrip();
  const { go } = useView(tripId);
  const [undone, setUndone] = useState(false);
  if (!result) return null;
  if ("error" in result) return <p className="text-base text-danger">That didn&apos;t work: {result.error}</p>;
  if (!result.ok) return <ConfirmCard pending={result} />;
  const items = result.itemIds.map((id) => trip.items.find((i) => i.id === id)).filter((i): i is Item => !!i);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 rounded-2xl bg-sunken p-3">
        <p className="flex items-start gap-2 text-base">
          <Icon name="check" className="mt-0.5 size-5 text-accent" />
          <span>{undone ? "Undone." : result.summary.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(". ")}</span>
        </p>
        {!undone && (
          <div className="flex flex-wrap gap-2 pl-7">
            {items.slice(0, 3).map((i) => (
              <button key={i.id} type="button" onClick={() => go({ tab: "item", itemId: i.id })} className="text-sm font-semibold text-accent underline underline-offset-2">
                {i.title}
              </button>
            ))}
            {expenses && (
              <button type="button" onClick={() => go({ tab: "expenses" })} className="text-sm font-semibold text-accent underline underline-offset-2">
                See who owes whom
              </button>
            )}
            <button
              type="button"
              onClick={async () => {
                await undo(result.entryId);
                setUndone(true);
              }}
              className="text-sm font-semibold text-muted underline underline-offset-2"
            >
              Undo
            </button>
          </div>
        )}
      </div>
      {result.pending && <ConfirmCard pending={result.pending} />}
    </div>
  );
}

/**
 * A change only a person can make: removing something, or moving something booked.
 * With `onConfirm`/`onDismiss` the caller keeps track of the decision (the outbox
 * does, for an edit made offline); otherwise this card applies it and remembers.
 */
export function ConfirmCard({ pending, onConfirm, onDismiss }: { pending: { message: string; ops: Op[]; summary: string[] }; onConfirm?: () => void; onDismiss?: () => void }) {
  const { apply, trip, tripId } = useTrip();
  const owned = !!onConfirm;
  const opKey = pending.ops.map((o) => `${o.op}:${"id" in o ? o.id : ""}:${"itemId" in o ? o.itemId : ""}`).join("|") || JSON.stringify(pending.ops);
  const storageKey = `trip:${tripId}:pending:${opKey}`;
  const [state, setState] = useState<"idle" | "confirmed" | "dismissed">(() => {
    if (owned) return "idle";
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "confirmed" || saved === "dismissed") return saved;
    } catch {
      // Ignore localStorage read errors.
    }
    return "idle";
  });

  const alreadyDone =
    pending.ops.length > 0 &&
    pending.ops.every((o) => {
      if (o.op === "item.remove") return !trip.items.some((i) => i.id === o.id);
      if (o.op === "todo.remove") return !trip.todos.some((t) => t.id === o.id);
      if (o.op === "item.update") {
        const item = trip.items.find((i) => i.id === o.id);
        if (!item) return true;
        return Object.entries(o.set).every(([k, v]) => {
          if (v === null || v === undefined) return (item as unknown as Record<string, unknown>)[k] === undefined;
          if (typeof v === "object") return JSON.stringify((item as unknown as Record<string, unknown>)[k]) === JSON.stringify(v);
          return (item as unknown as Record<string, unknown>)[k] === v;
        });
      }
      return false;
    });

  // Someone already made this change: there's nothing left to decide.
  useEffect(() => {
    if (owned && alreadyDone) onDismiss?.();
  }, [owned, alreadyDone, onDismiss]);

  if (state === "confirmed" || alreadyDone) return <p className="text-base font-semibold text-accent">Done.</p>;
  if (state === "dismissed") return <p className="text-base text-muted">Left as it was.</p>;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-todo bg-todo-soft p-4">
      <p className="text-base font-bold text-todo">{pending.message}</p>
      {pending.summary.length > 0 && (
        <ul className="list-disc pl-5 text-base">
          {pending.summary.map((s) => (
            <li key={s}>{asProposal(s)}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={async () => {
            if (onConfirm) {
              onConfirm();
              setState("confirmed");
              return;
            }
            const r = await apply(pending.ops, { confirmed: true });
            if (r.ok || alreadyDone) {
              setState("confirmed");
              try {
                localStorage.setItem(storageKey, "confirmed");
              } catch {
                // Ignore storage errors.
              }
            }
          }}
          className={btn.primary}
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => {
            setState("dismissed");
            if (onDismiss) return onDismiss();
            try {
              localStorage.setItem(storageKey, "dismissed");
            } catch {
              // Ignore storage errors.
            }
          }}
          className={btn.secondary}
        >
          Keep it as is
        </button>
      </div>
    </div>
  );
}

/** Real places as cards: Maps, website, call, and one tap to put it on the trip. */
function Options({ heading, options }: { heading?: string; options: Option[] }) {
  const { apply, trip } = useTrip();
  const [added, setAdded] = useState<Record<string, string>>({});
  return (
    <div className="flex flex-col gap-2">
      {heading && <p className="text-base font-bold" data-spoken-answer>{heading}</p>}
      <ul className="flex flex-col gap-2">
        {options.map((o) => {
          if (!o?.name) return null;
          const maps = o.mapsUrl ?? mapsSearchUrl([o.name, o.address ?? trip.destination].join(", "));
          return (
            <li key={o.name} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
              <div className="flex items-start gap-3">
                <KindChip kind={o.kind ?? "activity"} size="sm" />
                <div className="min-w-0 flex-1" data-spoken-answer>
                  <p className="text-base leading-snug font-bold">{o.name}</p>
                  {o.why && <p className="text-base">{o.why}</p>}
                  <p className="text-sm text-muted">{[o.address, o.priceHint, o.date && `${formatDay(o.date)}${o.time ? `, ${formatTime(o.time)}` : ""}`].filter(Boolean).join(". ")}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 pl-8">
                {added[o.name] ? (
                  <span className="inline-flex min-h-10 items-center gap-1 text-sm font-semibold text-accent">
                    <Icon name="check" className="size-4" />
                    {added[o.name]}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={async () => {
                      const item: Item = {
                        id: newId("i"),
                        kind: o.kind ?? "activity",
                        title: o.name.slice(0, 200),
                        ...(o.date ? { start: { date: o.date, ...(o.time ? { time: o.time } : {}) } } : {}),
                        place: { name: o.name, ...(o.address ? { address: o.address } : {}), ...(o.mapsUrl ? { mapsUrl: o.mapsUrl } : {}) },
                        ...(o.website || o.phone ? { contact: { ...(o.website ? { website: o.website } : {}), ...(o.phone ? { phone: o.phone } : {}) } } : {}),
                        ...(o.why ? { notes: o.why } : {}),
                      };
                      const r = await apply([{ op: "item.add", item }]);
                      if (r.ok) setAdded({ ...added, [o.name]: o.date ? `Added to ${formatDay(o.date)}` : "Saved to ideas" });
                    }}
                    className={`${btn.primary} min-h-10 px-3 text-sm`}
                  >
                    <Icon name="plus" className="size-4" />
                    {o.date ? `Add to ${formatDay(o.date)}` : "Save idea"}
                  </button>
                )}
                <a href={maps} target="_blank" rel="noreferrer" className={`${btn.secondary} min-h-10 px-3 text-sm`}>
                  <Icon name="pin" className="size-4" />
                  Maps
                </a>
                {o.address && (
                  <a href={directionsUrl({ address: o.address })!} target="_blank" rel="noreferrer" className={`${btn.secondary} min-h-10 px-3 text-sm`}>
                    <Icon name="directions" className="size-4" />
                    Go
                  </a>
                )}
                {o.website && (
                  <a href={o.website} target="_blank" rel="noreferrer" className={`${btn.secondary} min-h-10 px-3 text-sm`}>
                    <Icon name="globe" className="size-4" />
                    Website
                  </a>
                )}
                {o.phone && (
                  <a href={telUrl(o.phone)} className={`${btn.secondary} min-h-10 px-3 text-sm`}>
                    <Icon name="phone" className="size-4" />
                    Call
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
