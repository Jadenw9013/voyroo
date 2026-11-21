"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Icon } from "./Icon";

/**
 * A panel that rises from the bottom on phones (thumb reach) and sits in the
 * middle on wider screens. Native <dialog>: focus trap, Escape and the
 * backdrop come for free.
 */
export function Sheet({
  open,
  onClose,
  title,
  headerAction,
  children,
  footer,
  wide,
  conversation = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  headerAction?: ReactNode;
  children: ReactNode;
  /** Pinned under the scrolling content: the composer's input, a Save button. */
  footer?: ReactNode;
  wide?: boolean;
  /** The assistant owns a scrollable transcript and a separate composer. */
  conversation?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open) {
      if (!d.open) d.showModal();
      // showModal focuses the first button (Close); the field the sheet is for should have it, so the keyboard comes up.
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    }
    if (!open && d.open) d.close();
  }, [open, conversation]);

  // On iOS the keyboard shrinks the visual viewport while the layout viewport stays tall.
  useEffect(() => {
    const dialog = ref.current;
    const viewport = window.visualViewport;
    if (!open || !conversation || !dialog || !viewport) return;
    const fit = () => {
      dialog.style.setProperty("--visible-height", `${viewport.height}px`);
      dialog.style.setProperty("--visible-top", `${viewport.offsetTop}px`);
    };
    fit();
    viewport.addEventListener("resize", fit);
    viewport.addEventListener("scroll", fit);
    return () => {
      viewport.removeEventListener("resize", fit);
      viewport.removeEventListener("scroll", fit);
      dialog.style.removeProperty("--visible-height");
      dialog.style.removeProperty("--visible-top");
    };
  }, [open, conversation]);

  const headingId = `sheet-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      onClose={onClose}
      onClick={(e) => {
        // A tap on the backdrop lands on the dialog itself.
        if (e.target === e.currentTarget) onClose();
      }}
      className={`${conversation ? "conversation-sheet overflow-hidden" : "m-0 mt-auto max-h-[92dvh] sm:m-auto"} w-full max-w-none rounded-t-3xl p-0 text-ink shadow-lift sm:rounded-3xl ${
        wide ? "sm:w-[min(40rem,calc(100vw-2rem))]" : "sm:w-[min(30rem,calc(100vw-2rem))]"
      }`}
    >
      {open && (
        <div className={`flex flex-col ${conversation ? "h-full" : "max-h-[92dvh]"}`}>
          <div className={`flex shrink-0 items-center justify-between gap-2 py-1.5 pr-1.5 pl-5 ${conversation ? "border-b border-line" : ""}`}>
            <h2 id={headingId} className="min-w-0 flex-1 truncate text-lg font-bold">
              {title}
            </h2>
            {headerAction}
            <button type="button" onClick={onClose} aria-label="Close" className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:bg-sunken">
              <Icon name="close" />
            </button>
          </div>
          <div className={conversation ? "flex min-h-0 flex-1 flex-col" : "min-h-0 flex-1 overflow-y-auto px-5 pb-4"}>{children}</div>
          {footer && <div className="border-t border-line px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
          {!footer && !conversation && <div className="pb-[env(safe-area-inset-bottom)]" />}
        </div>
      )}
    </dialog>
  );
}

/** One full-width row in a list of actions. */
export function SheetAction({
  onClick,
  children,
  icon,
  tone = "default",
  disabled,
}: {
  onClick: () => void;
  children: ReactNode;
  icon?: Parameters<typeof Icon>[0]["name"];
  tone?: "default" | "danger";
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-base font-medium disabled:opacity-50 ${
        tone === "danger" ? "text-danger hover:bg-sunken" : "text-ink hover:bg-sunken"
      }`}
    >
      {icon && <Icon name={icon} className="size-5 text-muted" />}
      {children}
    </button>
  );
}
