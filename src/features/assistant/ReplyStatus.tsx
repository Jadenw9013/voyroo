import { Icon } from "@/ui/Icon";
import { REPLY_QUIET_SECONDS, type ReplyProgress } from "./replyActivity";

const LABELS = {
  idle: "Getting ready…",
  sending: "Sending your question…",
  waiting: "Waiting for the assistant…",
  search: "Searching the web…",
  maps: "Checking Google Maps…",
  link: "Reading the link…",
  updating: "Updating the trip…",
  writing: "Writing your reply…",
  stopped: "Reply stopped",
} satisfies Record<ReplyProgress["stage"], string>;

/** Keep progress visible above the composer even while reading an older reply. */
export function ReplyStatus({ progress, busy, online }: { progress: ReplyProgress; busy: boolean; online: boolean }) {
  const stopped = !busy && progress.stage === "stopped";
  const delayed = busy && (!online || progress.quiet);
  const visible = busy || stopped;
  const title = !online && busy
    ? "Connection lost"
    : delayed ? `No update for ${REPLY_QUIET_SECONDS} seconds` : LABELS[progress.stage];
  return (
    <div role="status" aria-label="Reply progress" aria-atomic="true" className={visible ? "shrink-0 px-4 pb-2 sm:px-5" : "sr-only"}>
      {visible && (
        <div className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm ${delayed ? "bg-todo-soft text-todo" : stopped ? "bg-sunken text-muted" : "bg-accent-soft text-accent"}`}>
          {delayed ? <Icon name={online ? "clock" : "offline"} className="size-4 shrink-0" />
            : stopped ? <span aria-hidden="true" className="mx-1 size-2.5 shrink-0 rounded-[2px] bg-current" />
            : <span aria-hidden="true" className="reply-progress-bars"><i /><i /><i /></span>}
          <div className="min-w-0">
            <p className="font-semibold">{title}</p>
            {delayed && <p>{online ? "You can keep waiting or stop the reply." : "Check your connection or stop the reply."}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
