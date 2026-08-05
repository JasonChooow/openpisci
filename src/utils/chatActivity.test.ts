import { describe, expect, it } from "vitest";
import type { ToolStep, PlanTodoItem } from "../store";
import type { ChatMessage, SessionArtifact } from "../services/tauri/chat";
import {
  buildChatActivityItems,
  getInlineArtifactsForMessage,
  getUnattachedLatestTurnArtifacts,
  isFrozenActivityMessage,
} from "./chatActivity";

function step(partial: Partial<ToolStep> & Pick<ToolStep, "id" | "name">): ToolStep {
  return {
    input: {},
    completed: true,
    expanded: false,
    ...partial,
  };
}

function message(partial: Partial<ChatMessage> & Pick<ChatMessage, "id" | "role" | "content" | "created_at">): ChatMessage {
  return {
    session_id: "s1",
    ...partial,
  };
}

function artifact(partial: Partial<SessionArtifact> & Pick<SessionArtifact, "id" | "name" | "created_at">): SessionArtifact {
  return {
    session_id: "s1",
    artifact_type: "file",
    content_summary: "",
    ...partial,
  };
}

describe("chat activity summaries", () => {
  it("summarizes visible work using user-friendly categories", () => {
    const plan: PlanTodoItem[] = [
      { id: "p1", content: "整理报告结构", status: "completed" },
    ];
    const items = buildChatActivityItems(
      [
        step({ id: "t1", name: "file_read", input: { path: "E:/demo/input.docx" } }),
        step({ id: "t2", name: "shell", input: { command: "npm run build:web" }, completed: false }),
      ],
      plan,
      { running: true },
    );

    expect(items.map((item) => item.label)).toContain("完成：整理报告结构");
    expect(items.map((item) => item.label)).toContain("查看了本地内容");
    expect(items.map((item) => item.label)).toContain("正在运行命令");
    expect(items.find((item) => item.kind === "command")?.detail).toBe("npm run build:web");
  });

  it("adds a live fallback while Baozi is working without tool events", () => {
    const items = buildChatActivityItems([], [], { running: true });
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe("正在理解你的需求");
    expect(items[0].status).toBe("running");
  });

  it("attaches turn artifacts only to the latest assistant answer", () => {
    const visibleMessages = [
      message({ id: "u1", role: "user", content: "做个文件", created_at: "2026-08-05T08:00:00.000Z" }),
      message({ id: "a1", role: "assistant", content: "处理中", created_at: "2026-08-05T08:00:03.000Z" }),
      message({ id: "a2", role: "assistant", content: "完成了", created_at: "2026-08-05T08:01:00.000Z" }),
    ];
    const artifacts = [
      artifact({ id: "old", name: "old.md", created_at: "2026-08-05T07:59:00.000Z" }),
      artifact({ id: "new", name: "report.md", created_at: "2026-08-05T08:00:30.000Z" }),
    ];

    expect(getInlineArtifactsForMessage(visibleMessages[1], visibleMessages, artifacts)).toHaveLength(0);
    expect(getInlineArtifactsForMessage(visibleMessages[2], visibleMessages, artifacts).map((a) => a.id)).toEqual(["new"]);
  });

  it("attaches turn artifacts to an empty final assistant placeholder", () => {
    const visibleMessages = [
      message({ id: "u1", role: "user", content: "生成 Word 文档", created_at: "2026-08-05T08:00:00.000Z" }),
      message({ id: "a1", role: "assistant", content: "", created_at: "2026-08-05T08:01:00.000Z" }),
    ];
    const artifacts = [
      artifact({ id: "docx", name: "report.docx", created_at: "2026-08-05T08:00:30.000Z" }),
    ];

    expect(getInlineArtifactsForMessage(visibleMessages[1], visibleMessages, artifacts).map((a) => a.id)).toEqual(["docx"]);
  });

  it("returns latest turn artifacts when no assistant message can host them", () => {
    const visibleMessages = [
      message({ id: "a0", role: "assistant", content: "上一轮完成了", created_at: "2026-08-05T07:58:00.000Z" }),
      message({ id: "u1", role: "user", content: "生成 Word 文档", created_at: "2026-08-05T08:00:00.000Z" }),
    ];
    const artifacts = [
      artifact({ id: "old", name: "old.docx", created_at: "2026-08-05T07:59:00.000Z" }),
      artifact({ id: "docx", name: "report.docx", created_at: "2026-08-05T08:00:30.000Z" }),
    ];

    expect(getUnattachedLatestTurnArtifacts(visibleMessages, artifacts).map((a) => a.id)).toEqual(["docx"]);
  });

  it("does not duplicate artifacts when an empty latest assistant message hosts them", () => {
    const visibleMessages = [
      message({ id: "u1", role: "user", content: "生成 Word 文档", created_at: "2026-08-05T08:00:00.000Z" }),
      message({ id: "a1", role: "assistant", content: "处理中", created_at: "2026-08-05T08:00:05.000Z" }),
      message({ id: "a2", role: "assistant", content: "", created_at: "2026-08-05T08:01:00.000Z" }),
    ];
    const artifacts = [
      artifact({ id: "docx", name: "report.docx", created_at: "2026-08-05T08:00:30.000Z" }),
    ];

    expect(getInlineArtifactsForMessage(visibleMessages[1], visibleMessages, artifacts)).toHaveLength(0);
    expect(getInlineArtifactsForMessage(visibleMessages[2], visibleMessages, artifacts).map((a) => a.id)).toEqual(["docx"]);
    expect(getUnattachedLatestTurnArtifacts(visibleMessages, artifacts)).toHaveLength(0);
  });

  it("detects collapsed activity messages", () => {
    expect(isFrozenActivityMessage(message({
      id: "frozen_s1",
      role: "assistant",
      content: "过程",
      created_at: "2026-08-05T08:00:00.000Z",
    }))).toBe(true);
  });
});
