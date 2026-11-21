"use client";

import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, type InferUITools, type UIMessage } from "ai";
import type { AssistantTools } from "@/server/ai/tools";
import type { Grounding } from "@/server/ai/grounding";

export type AssistantMessage = UIMessage<unknown, { grounding: Grounding }, InferUITools<AssistantTools>>;

/*
 * One conversation per trip, kept while the app is open, so closing the
 * sheet to look at something and coming back picks up where you were.
 */

const chats = new Map<string, Chat<AssistantMessage>>();

/** Sends again on its own only after the person answers one of the assistant's questions. */
function answeredQuestion({ messages }: { messages: AssistantMessage[] }): boolean {
  const last = messages.at(-1);
  if (last?.role !== "assistant") return false;
  const part = last.parts.filter((p) => p.type !== "step-start" && p.type !== "data-grounding").at(-1);
  return part?.type === "tool-ask_user" && part.state === "output-available";
}

export function chatFor(tripId: string): Chat<AssistantMessage> {
  let chat = chats.get(tripId);
  if (!chat) {
    chat = new Chat<AssistantMessage>({
      id: `trip-${tripId}`,
      transport: new DefaultChatTransport({
        api: `/api/t/${tripId}/chat`,
        // Screenshots go once, with the message they came with: earlier ones aren't resent every turn.
        prepareSendMessagesRequest: ({ id, messages, body }) => {
          const last = messages.findLastIndex((m) => m.role === "user");
          return {
            body: {
              id,
              ...body,
              context: { ...body?.context, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone },
              messages: messages.map((m, i) => ({
                id: m.id,
                role: m.role,
                parts: m.parts.filter((p) => p.type !== "data-grounding" && (p.type !== "file" || i === last)),
              })),
            },
          };
        },
      }),
      sendAutomaticallyWhen: answeredQuestion,
    });
    chats.set(tripId, chat);
  }
  return chat;
}

export function newConversation(tripId: string) {
  chats.delete(tripId);
}
