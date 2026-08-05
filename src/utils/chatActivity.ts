import type { ToolStep, PlanTodoItem } from "../store";
import type { ChatMessage, SessionArtifact } from "../services/tauri/chat";

export type ChatActivityKind =
  | "plan"
  | "file"
  | "command"
  | "web"
  | "image"
  | "artifact"
  | "expert"
  | "skill"
  | "thinking"
  | "other";

export interface ChatActivityItem {
  id: string;
  label: string;
  detail?: string;
  status: "running" | "done" | "error";
  kind: ChatActivityKind;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function firstString(input: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function shortText(value: string | undefined, max = 96): string | undefined {
  if (!value) return undefined;
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}...` : compact;
}

function summarizeToolStep(step: ToolStep): ChatActivityItem | null {
  const normalized = step.name.toLowerCase();
  if (normalized === "chat_ui" || normalized === "plan_todo") return null;

  const input = asRecord(step.input);
  const status = !step.completed ? "running" : step.isError ? "error" : "done";
  const base = { id: `tool-${step.id}`, status } as const;

  if (normalized.includes("file_read") || normalized.includes("file_search") || normalized.includes("list_directory")) {
    return {
      ...base,
      kind: "file",
      label: step.completed ? "查看了本地内容" : "正在查看本地内容",
      detail: shortText(firstString(input, ["path", "query", "pattern", "glob"])),
    };
  }

  if (normalized.includes("file_write") || normalized.includes("file_edit") || normalized.includes("apply_patch")) {
    return {
      ...base,
      kind: "file",
      label: step.completed ? "编辑了文件" : "正在编辑文件",
      detail: shortText(firstString(input, ["path", "file", "target"])),
    };
  }

  if (normalized.includes("shell") || normalized.includes("powershell") || normalized.includes("code_run") || normalized.includes("terminal")) {
    return {
      ...base,
      kind: "command",
      label: step.completed ? "运行了命令" : "正在运行命令",
      detail: shortText(firstString(input, ["command", "cmd", "script"])),
    };
  }

  if (normalized.includes("web") || normalized.includes("browser") || normalized.includes("search")) {
    return {
      ...base,
      kind: "web",
      label: step.completed ? "查看了网页信息" : "正在查看网页信息",
      detail: shortText(firstString(input, ["url", "query", "q", "selector"])),
    };
  }

  if (normalized.includes("screenshot") || normalized.includes("screen") || normalized.includes("image")) {
    return {
      ...base,
      kind: "image",
      label: step.completed ? "处理了图片或截图" : "正在处理图片或截图",
      detail: shortText(firstString(input, ["path", "output_path", "mode"])),
    };
  }

  if (normalized.includes("artifact")) {
    return {
      ...base,
      kind: "artifact",
      label: step.completed ? "登记了输出文件" : "正在登记输出文件",
      detail: shortText(firstString(input, ["artifact_name", "name", "path", "uri", "url"])),
    };
  }

  if (normalized.includes("call_fish") || normalized.includes("koi") || normalized.includes("expert")) {
    const expert = step.fishProgress?.fishName;
    return {
      ...base,
      kind: "expert",
      label: step.completed ? "专家协作已完成" : expert ? `${expert} 正在协作` : "正在召唤专家协作",
      detail: shortText(step.fishProgress?.thinkingText || firstString(input, ["fish_name", "koi_name", "task"])),
    };
  }

  if (normalized.includes("skill")) {
    return {
      ...base,
      kind: "skill",
      label: step.completed ? "技能处理已完成" : "正在使用技能",
      detail: shortText(firstString(input, ["skill", "name", "task", "query"])),
    };
  }

  return {
    ...base,
    kind: "other",
    label: step.completed ? "完成了一个处理步骤" : "正在处理任务步骤",
    detail: shortText(firstString(input, ["action", "name", "task", "query", "path"])),
  };
}

export function buildChatActivityItems(
  steps: ToolStep[],
  plan: PlanTodoItem[],
  options: { running: boolean; limit?: number } = { running: false },
): ChatActivityItem[] {
  const limit = options.limit ?? 5;
  const planItems: ChatActivityItem[] = plan
    .filter((item) => item.status === "in_progress" || item.status === "completed" || item.status === "cancelled")
    .map((item) => ({
      id: `plan-${item.id}`,
      kind: "plan",
      status: item.status === "completed" ? "done" : item.status === "cancelled" ? "error" : "running",
      label:
        item.status === "completed"
          ? `完成：${item.content}`
          : item.status === "cancelled"
            ? `已跳过：${item.content}`
            : `正在处理：${item.content}`,
    }));

  const toolItems = steps
    .map(summarizeToolStep)
    .filter((item): item is ChatActivityItem => Boolean(item));

  const items = [...planItems, ...toolItems].slice(-limit);
  if (options.running && (items.length === 0 || items.every((item) => item.status !== "running"))) {
    items.push({
      id: "activity-wrap-up",
      kind: "thinking",
      status: "running",
      label: items.length > 0 ? "正在整理结果和结论" : "正在理解你的需求",
    });
  }
  return items.slice(-limit);
}

function timestampMs(value?: string | null): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}

function artifactsAfterLatestUser(
  visibleMessages: ChatMessage[],
  artifacts: SessionArtifact[],
  limit: number,
): SessionArtifact[] {
  const lastUser = [...visibleMessages]
    .reverse()
    .find((m) => m.role === "user" && !m.tool_results_json);
  const startMs = timestampMs(lastUser?.created_at);
  if (startMs == null) return [];

  return artifacts
    .filter((artifact) => {
      const createdMs = timestampMs(artifact.created_at);
      return createdMs != null && createdMs >= startMs - 1000;
    })
    .sort((a, b) => (timestampMs(a.created_at) ?? 0) - (timestampMs(b.created_at) ?? 0))
    .slice(-limit);
}

function latestUserIndex(visibleMessages: ChatMessage[]): number {
  for (let i = visibleMessages.length - 1; i >= 0; i -= 1) {
    const message = visibleMessages[i];
    if (message.role === "user" && !message.tool_results_json) return i;
  }
  return -1;
}

export function isFrozenActivityMessage(message: ChatMessage): boolean {
  return message.role === "assistant" && message.id.startsWith("frozen_");
}

export function getInlineArtifactsForMessage(
  message: ChatMessage,
  visibleMessages: ChatMessage[],
  artifacts: SessionArtifact[],
  limit = 5,
): SessionArtifact[] {
  if (message.role !== "assistant" || message.tool_calls_json) return [];

  const messageIndex = visibleMessages.findIndex((m) => m.id === message.id);
  if (messageIndex < 0) return [];

  const laterAssistant = visibleMessages
    .slice(messageIndex + 1)
    .some((m) => m.role === "assistant" && !m.tool_calls_json);
  if (laterAssistant) return [];

  const lastUserBefore = [...visibleMessages.slice(0, messageIndex)]
    .reverse()
    .find((m) => m.role === "user" && !m.tool_results_json);
  const startMs = timestampMs(lastUserBefore?.created_at);
  if (startMs == null) return [];

  return artifacts
    .filter((artifact) => {
      const createdMs = timestampMs(artifact.created_at);
      return createdMs != null && createdMs >= startMs - 1000;
    })
    .sort((a, b) => (timestampMs(a.created_at) ?? 0) - (timestampMs(b.created_at) ?? 0))
    .slice(-limit);
}

export function getUnattachedLatestTurnArtifacts(
  visibleMessages: ChatMessage[],
  artifacts: SessionArtifact[],
  limit = 5,
): SessionArtifact[] {
  const latestTurnArtifacts = artifactsAfterLatestUser(visibleMessages, artifacts, limit);
  if (latestTurnArtifacts.length === 0) return [];

  const userIndex = latestUserIndex(visibleMessages);
  const latestAssistantCanHost = visibleMessages
    .slice(userIndex + 1)
    .some((m) => m.role === "assistant" && !m.tool_calls_json);
  return latestAssistantCanHost ? [] : latestTurnArtifacts;
}
