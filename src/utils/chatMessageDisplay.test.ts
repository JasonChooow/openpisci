import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../services/tauri/chat";
import { normalizeVisibleChatMessages } from "./chatMessageDisplay";

function msg(partial: Partial<ChatMessage> & Pick<ChatMessage, "id" | "role" | "content">): ChatMessage {
  return {
    session_id: "s1",
    created_at: "2026-08-05T00:00:00.000Z",
    ...partial,
  };
}

describe("normalizeVisibleChatMessages", () => {
  it("collapses duplicate assistant text within one tool-heavy turn", () => {
    const repeated =
      "在的！刚才在处理你的数据库文件，这个文件很大（约164MB，近30万行），包含182个表。";

    const visible = normalizeVisibleChatMessages([
      msg({ id: "u1", role: "user", content: "分析数据库", turn_index: null }),
      msg({ id: "a1", role: "assistant", content: repeated, turn_index: 7 }),
      msg({
        id: "tool-results",
        role: "user",
        content: "",
        tool_results_json: "[{}]",
        turn_index: 7,
      }),
      msg({ id: "a2", role: "assistant", content: repeated, turn_index: 7 }),
    ]);

    expect(visible.filter((m) => m.role === "assistant")).toHaveLength(1);
    expect(visible.map((m) => m.id)).toEqual(["u1", "a1"]);
  });

  it("collapses adjacent duplicate assistant text from older messages without turn indexes", () => {
    const visible = normalizeVisibleChatMessages([
      msg({ id: "a1", role: "assistant", content: "找到 182 个表。\n正在继续分析。", turn_index: null }),
      msg({ id: "a2", role: "assistant", content: "找到 182 个表。 正在继续分析。", turn_index: null }),
    ]);

    expect(visible.map((m) => m.id)).toEqual(["a1"]);
  });
});
