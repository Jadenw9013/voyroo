/*
 * The look of an action used on the move (Directions, Call, Copy, Show to
 * driver): 56px tall, a word and an icon. Kept outside the client kit so the
 * server-drawn viewing page renders the same buttons as links.
 */
export function actionClass(tone: "default" | "ticket" = "default"): string {
  return `inline-flex min-h-14 shrink-0 items-center gap-2 rounded-full px-5 text-base font-semibold ${
    tone === "ticket" ? "bg-on-ticket text-ticket" : "border border-line bg-surface text-ink hover:bg-sunken"
  }`;
}
