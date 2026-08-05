import type { ChatMessage } from "../services/tauri/chat";
import { stripInternalPromptLeak } from "./internalPromptSanitizer";

function getToolCallName(block: unknown): string | null {
  if (!block || typeof block !== "object") return null;
  const record = block as Record<string, unknown>;
  if (typeof record.name === "string") return record.name;
  const nested = record.ToolUse;
  if (nested && typeof nested === "object") {
    const nestedName = (nested as Record<string, unknown>).name;
    return typeof nestedName === "string" ? nestedName : null;
  }
  return null;
}

export function isChatUiToolCallMessage(message: ChatMessage): boolean {
  if (message.role !== "assistant" || !message.tool_calls_json) return false;
  try {
    const calls = JSON.parse(message.tool_calls_json);
    return Array.isArray(calls) && calls.some((call) => getToolCallName(call) === "chat_ui");
  } catch {
    return false;
  }
}

function duplicateTextKey(content: string): string {
  return content.replace(/\r\n/g, "\n").trim().replace(/\s+/g, " ");
}

export function normalizeVisibleChatMessages(rawMessages: ChatMessage[]): ChatMessage[] {
  const chatUiToolCallIds = new Set(
    rawMessages.filter(isChatUiToolCallMessage).map((message) => message.id),
  );
  const seenAssistantTextByTurn = new Set<string>();

  return rawMessages
    .filter((m) => !(m.role === "user" && !m.content.trim() && m.tool_results_json))
    .filter((m) => !(m.role === "assistant" && !m.content.trim() && m.tool_calls_json && !chatUiToolCallIds.has(m.id)))
    .map((m) => {
      const cleaned = stripInternalPromptLeak(m.content);
      return cleaned === m.content ? m : { ...m, content: cleaned };
    })
    .reduce<ChatMessage[]>((acc, msg) => {
      const prev = acc[acc.length - 1];
      const contentKey = duplicateTextKey(msg.content);
      const hasVisibleText = contentKey.length > 0;
      const isChatUi = chatUiToolCallIds.has(msg.id);

      if (prev && prev.role === msg.role && duplicateTextKey(prev.content) === contentKey) {
        return acc;
      }

      if (msg.role === "assistant" && hasVisibleText && !isChatUi && msg.turn_index != null) {
        const turnKey = `${msg.turn_index}:${contentKey}`;
        if (seenAssistantTextByTurn.has(turnKey)) {
          return acc;
        }
        seenAssistantTextByTurn.add(turnKey);
      }

      const canMerge =
        prev != null &&
        prev.role === "assistant" &&
        msg.role === "assistant" &&
        !chatUiToolCallIds.has(prev.id) &&
        !isChatUi &&
        prev.turn_index != null &&
        msg.turn_index != null &&
        prev.turn_index === msg.turn_index &&
        prev.content.trim().length > 0 &&
        msg.content.trim().length > 0;
      if (canMerge && prev) {
        acc[acc.length - 1] = {
          ...prev,
          content: `${prev.content.trimEnd()}\n\n${msg.content.trimStart()}`,
        };
      } else {
        acc.push(msg);
      }
      return acc;
    }, []);
}
