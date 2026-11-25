import { DefaultChatTransport, type HttpChatTransportInitOptions, type UIMessageChunk, type ChatTransport } from "ai";
import type { AssistantMessage } from "./chat";

export const REPLY_QUIET_SECONDS = 20;
const quietMs = REPLY_QUIET_SECONDS * 1000;

type Stage = "idle" | "sending" | "waiting" | "search" | "maps" | "link" | "updating" | "writing" | "stopped";
export type ReplyProgress = { stage: Stage; quiet: boolean; turn: number };
const initial: ReplyProgress = { stage: "idle", quiet: false, turn: 0 };

/** Stay with the conversation when its sheet is closed. Tokens refresh the
 * silence deadline without repainting the status until it actually changes. */
export class ReplyActivity {
  private activity = initial;
  private readonly listeners = new Set<() => void>();
  private deadline = 0;
  private timer?: ReturnType<typeof setTimeout>;

  getSnapshot = () => this.activity;
  getServerSnapshot = () => initial;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  private publish(stage: Stage, quiet: boolean, turn = this.activity.turn) {
    if (stage === this.activity.stage && quiet === this.activity.quiet && turn === this.activity.turn) return;
    this.activity = { stage, quiet, turn };
    this.listeners.forEach((listener) => listener());
  }

  private checkSilence = () => {
    this.timer = undefined;
    const remaining = this.deadline - performance.now();
    if (remaining > 0) this.timer = setTimeout(this.checkSilence, remaining);
    else this.publish(this.activity.stage, true);
  };

  begin() {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.publish("sending", false, this.activity.turn + 1);
    this.receive();
  }

  receive(stage = this.activity.stage) {
    this.deadline = performance.now() + quietMs;
    this.timer ??= setTimeout(this.checkSilence, quietMs);
    this.publish(stage, false);
  }

  finish(stopped: boolean) {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.publish(stopped ? "stopped" : "idle", false);
  }
}

function toolStage(name: string): Stage {
  switch (name) {
    case "google_maps": return "maps";
    case "google_search": return "search";
    case "url_context": return "link";
    case "add_items":
    case "update_items":
    case "remove_items":
    case "add_todos":
    case "add_expenses":
    case "add_comment": return "updating";
    default: return "waiting";
  }
}

export class ProgressTransport extends DefaultChatTransport<AssistantMessage> {
  constructor(options: HttpChatTransportInitOptions<AssistantMessage>, private activity: ReplyActivity) {
    super(options);
  }

  override async sendMessages(options: Parameters<ChatTransport<AssistantMessage>["sendMessages"]>[0]) {
    const activity = this.activity;
    activity.begin();
    const stream = await super.sendMessages(options);
    if (!options.abortSignal?.aborted) activity.receive("waiting");
    let complete = false;
    return stream.pipeThrough(new TransformStream<UIMessageChunk, UIMessageChunk>({
      transform(chunk, controller) {
        if (options.abortSignal?.aborted) return;
        if (chunk.type === "abort") throw new Error("The reply was interrupted. You can try again.");
        if (chunk.type === "finish" || chunk.type === "error") complete = true;
        if (chunk.type === "text-delta" && chunk.delta.trim()) activity.receive("writing");
        else if (chunk.type === "tool-input-available") activity.receive(toolStage(chunk.toolName));
        else if (chunk.type === "start-step" || chunk.type === "tool-output-available" || chunk.type === "tool-output-error") activity.receive("waiting");
        else activity.receive();
        controller.enqueue(chunk);
      },
      flush() {
        if (!complete && !options.abortSignal?.aborted) throw new Error("The connection closed before the reply finished.");
      },
    }));
  }
}
