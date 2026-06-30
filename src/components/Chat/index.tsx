import { Component, useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo, type ErrorInfo, type ReactNode } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { RootState, chatActions, sessionsActions, skillsActions, poolActions, ToolStep, StreamingState, PlanTodoItem, ContextUsageSnapshot } from "../../store";
import { artifactsApi, chatApi, journalApi, sessionsApi, gatewayApi, koiApi, AgentEventType, ChannelInfo, type ChatMessage, type SessionArtifact, type JournalChange, type KoiWithStats } from "../../services/tauri";
import { skillsApi, type Skill, type ComposerMode } from "../../services/tauri";
import RoundedSearch from "../ui/RoundedSearch";
import { Search, History, Share2, Mic, PanelRight } from "lucide-react";
import { PlanPanel, ArtifactsPanel, ToolStepCard } from "./ChatPanels";
import ChatRightPanel from "./ChatRightPanel";
import TeamCollabPanel from "./TeamCollabPanel";
import TeamTaskCreateDialog from "../Pond/TeamTaskCreateDialog";
import { buildAttachmentFromBlob, buildAttachmentFromPath, isImageFilename, type PendingAttachmentItem } from "./composerUtils";
import type { Settings } from "../../services/tauri";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openPath } from "../../services/tauri";
import InteractiveCard from "./InteractiveCard";
import SessionPicker from "./SessionPicker";
import ComposerDropdown, { type ComposerMenuItem } from "./ComposerDropdown";
import { applyUiPatch, type UiPatch } from "./interactiveUi/patch";
import ConfirmDialog from "../ConfirmDialog";
import {
  classifyMainChatSession,
  isInternalSession,
  isMainChatVisibleSession,
  pickMainChatActiveSession,
} from "../../utils/session";
import { composerPrimaryOfficeSkills, composerSelectableSkills } from "../../utils/skills";
import { compareExpertGroupLabels, normalizeExpertGroupLabel } from "../../utils/expertOrdering";
import {
  handleInputHistoryKeyDown,
  pushInputHistory,
  resetInputHistoryNav,
  seedInputHistory,
} from "../../utils/inputHistory";
import "./Chat.css";

type BuiltInChatModel = {
  id: string;
  provider: string;
  model: string;
  label: string;
  tier: "High" | "Medium";
};

const BUILT_IN_CHAT_MODELS: BuiltInChatModel[] = [
  { id: "builtin:openai:gpt-4o", provider: "openai", model: "gpt-4o", label: "GPT-4o", tier: "High" },
  { id: "builtin:openai:gpt-4o-mini", provider: "openai", model: "gpt-4o-mini", label: "GPT-4o mini", tier: "Medium" },
  { id: "builtin:anthropic:claude-sonnet-4-5", provider: "anthropic", model: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", tier: "High" },
  { id: "builtin:anthropic:claude-haiku-4-5", provider: "anthropic", model: "claude-haiku-4-5", label: "Claude Haiku 4.5", tier: "Medium" },
  { id: "builtin:deepseek:deepseek-v4-pro", provider: "deepseek", model: "deepseek-v4-pro", label: "DeepSeek-V4-Pro", tier: "High" },
  { id: "builtin:deepseek:deepseek-v4-flash", provider: "deepseek", model: "deepseek-v4-flash", label: "DeepSeek-V4-Flash", tier: "High" },
  { id: "builtin:zhipu:glm-5.2", provider: "zhipu", model: "glm-5.2", label: "GLM-5.2", tier: "Medium" },
  { id: "builtin:zhipu:glm-5.1", provider: "zhipu", model: "glm-5.1", label: "GLM-5.1", tier: "Medium" },
  { id: "builtin:zhipu:glm-5v-turbo", provider: "zhipu", model: "glm-5v-turbo", label: "GLM-5v-Turbo", tier: "Medium" },
  { id: "builtin:minimax:MiniMax-M3", provider: "minimax", model: "MiniMax-M3", label: "MiniMax-M3", tier: "Medium" },
  { id: "builtin:kimi:kimi-k2.7-code", provider: "kimi", model: "kimi-k2.7-code", label: "Kimi-K2.7-Code", tier: "Medium" },
  { id: "builtin:kimi:kimi-k2.6", provider: "kimi", model: "kimi-k2.6", label: "Kimi-K2.6", tier: "Medium" },
  { id: "builtin:qwen:qwen3-max", provider: "qwen", model: "qwen3-max", label: "Qwen3-Max", tier: "Medium" },
];

type ChatScene = "office" | "code" | "design";
const RECENT_KOI_KEY = "piscis-recent-koi-ids";

const CHAT_SCENES: Array<{ id: ChatScene; label: string; icon: string; title: string }> = [
  { id: "office", label: "日常办公", icon: "☕", title: "文档、总结、问答、日常任务" },
  { id: "code", label: "代码开发", icon: "⌘", title: "代码、工具调用、项目开发" },
  { id: "design", label: "设计创意", icon: "◌", title: "图片、视频、海报、PPT、网页设计" },
];

function providerHasApiKey(settings: Settings | null | undefined, provider: string): boolean {
  if (!settings) return false;
  switch (provider) {
    case "anthropic":
      return Boolean(settings.anthropic_api_key?.trim());
    case "openai":
      return Boolean(settings.openai_api_key?.trim());
    case "deepseek":
      return Boolean(settings.deepseek_api_key?.trim());
    case "qwen":
      return Boolean(settings.qwen_api_key?.trim());
    case "minimax":
      return Boolean(settings.minimax_api_key?.trim());
    case "zhipu":
      return Boolean(settings.zhipu_api_key?.trim());
    case "kimi":
      return Boolean(settings.kimi_api_key?.trim());
    case "custom":
      return Boolean(settings.openai_api_key?.trim() || settings.custom_base_url?.trim());
    default:
      return false;
  }
}

function loadRecentKoiIds(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KOI_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string").slice(0, 3) : [];
  } catch {
    return [];
  }
}

function builtInModelLabel(model: BuiltInChatModel): string {
  return `${model.label}  ${model.tier}`;
}

function isImageGenerationModel(model: string): boolean {
  const m = model.toLowerCase();
  return (
    m.includes("gpt-image") ||
    m.includes("dall-e") ||
    m.includes("imagen") ||
    m.includes("qwen-image") ||
    m.includes("flux") ||
    m.includes("stable-diffusion") ||
    m.includes("midjourney") ||
    /(^|[-_/])image($|[-_/])/.test(m)
  );
}

function isVideoGenerationModel(model: string): boolean {
  const m = model.toLowerCase();
  return (
    m.includes("video") ||
    m.includes("veo") ||
    m.includes("sora") ||
    m.includes("kling") ||
    m.includes("runway") ||
    m.includes("wan-")
  );
}

function isCreativeGenerationModel(model: string): boolean {
  return isImageGenerationModel(model) || isVideoGenerationModel(model);
}

function modelAllowedInScene(model: string, scene: ChatScene): boolean {
  if (scene === "design") return true;
  return !isCreativeGenerationModel(model);
}

const COMPOSER_MODE_ICON: Record<ComposerMode, string> = {
  craft: "⚡",
  plan: "📋",
  ask: "💬",
};

// ─── Mermaid diagram block ────────────────────────────────────────────────────
let mermaidPromise: Promise<{
  parse: (code: string, options?: { suppressErrors?: boolean }) => Promise<unknown>;
  render: (id: string, code: string) => Promise<{ svg: string }>;
}> | null = null;

function loadMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });
      return mermaid;
    });
  }

  return mermaidPromise;
}

let mermaidIdCounter = 0;

class RenderErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[Chat] render boundary caught error:", error, info);
  }

  componentDidUpdate(prevProps: { fallback: ReactNode; children: ReactNode }) {
    if (this.state.hasError && prevProps.children !== this.props.children) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function parsePersistedBlocks(raw?: string | null): Array<Record<string, unknown>> {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mergePlanItems(existing: PlanTodoItem[], updates: PlanTodoItem[]): PlanTodoItem[] {
  const merged = [...existing];
  for (const update of updates) {
    const idx = merged.findIndex((item) => item.id === update.id);
    if (idx >= 0) merged[idx] = update;
    else merged.push(update);
  }
  return merged;
}

function reconstructPersistedTaskPanels(messages: ChatMessage[]): {
  toolSteps: ToolStep[];
  planItems: PlanTodoItem[];
} {
  let lastRealUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "user" && !msg.tool_results_json && !msg.id.startsWith("optimistic_")) {
      lastRealUserIdx = i;
      break;
    }
  }
  const turnMessages = messages.slice(lastRealUserIdx + 1);
  const resultByToolUseId = new Map<string, { content: string; isError: boolean }>();
  for (const msg of turnMessages) {
    for (const result of parsePersistedBlocks(msg.tool_results_json)) {
      const toolUseId = typeof result.tool_use_id === "string" ? result.tool_use_id : null;
      if (!toolUseId) continue;
      resultByToolUseId.set(toolUseId, {
        content: typeof result.content === "string" ? result.content : JSON.stringify(result.content ?? ""),
        isError: Boolean(result.is_error),
      });
    }
  }

  const toolSteps: ToolStep[] = [];
  let planItems: PlanTodoItem[] = [];

  for (const msg of turnMessages) {
    for (const call of parsePersistedBlocks(msg.tool_calls_json)) {
      const name = typeof call.name === "string" ? call.name : "";
      if (!name || name === "chat_ui") continue;
      const id =
        typeof call.id === "string" && call.id.trim()
          ? call.id
          : `${msg.id}_${toolSteps.length}`;
      const result = resultByToolUseId.get(id);
      toolSteps.push({
        id,
        name,
        input: call.input ?? null,
        completed: Boolean(result),
        expanded: false,
        result: result?.content,
        isError: result?.isError,
      });

      if (name !== "plan_todo" || result?.isError) continue;
      const input = (call.input ?? {}) as { merge?: unknown; todos?: unknown };
      const todos = Array.isArray(input.todos) ? input.todos : [];
      const updates: PlanTodoItem[] = todos
        .map((item) => ({
          id: typeof item?.id === "string" ? item.id : "",
          content: typeof item?.content === "string" ? item.content : "",
          status:
            item?.status === "pending" ||
            item?.status === "in_progress" ||
            item?.status === "completed" ||
            item?.status === "cancelled"
              ? item.status
              : "pending",
        }))
        .filter((item) => item.id && item.content);
      if (updates.length === 0) continue;
      planItems = input.merge ? mergePlanItems(planItems, updates) : updates;
    }
  }

  return { toolSteps, planItems };
}

function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const idRef = useRef(`mermaid-${++mermaidIdCounter}`);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    let cancelled = false;
    const id = idRef.current;
    setError(null);
    ref.current.innerHTML = "";

    const render = async () => {
      try {
        const mermaid = await loadMermaid();
        await mermaid.parse(code, { suppressErrors: false });
        const { svg } = await mermaid.render(id, code);
        if (!cancelled && ref.current) {
          ref.current.innerHTML = svg;
        }
      } catch (e) {
        if (!cancelled) {
          console.warn("[Chat] Mermaid render failed, falling back to code block:", e);
          setError(String(e));
        }
      }
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <pre className="code-block">
        <span className="code-lang">mermaid (parse error)</span>
        <code>{code}</code>
      </pre>
    );
  }
  return <div ref={ref} className="mermaid-block" />;
}

// ── Session classification ────────────────────────────────────────────────────

type SessionKind = "chat" | "im" | "cli";

type SessionLike = { source?: string | null; id?: string | null };


function classifySession(session: SessionLike | undefined | null): SessionKind {
  return classifyMainChatSession(session);
}


function formatTokenCount(value: number | null | undefined): string {
  const safe = Math.max(0, value ?? 0);
  if (safe >= 1_000_000) return `${(safe / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (safe >= 1_000) return `${(safe / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${safe}`;
}

function formatContextTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

/** Tiny ring progress indicator for current-context-vs-compaction-trigger.
 *
 *  The ring fills 0–100% where 100% = `triggerThreshold` (the 60%-of-budget line
 *  at which Level-2 proactive compaction fires). Readings above 100% overflow
 *  visually (full ring + red) to indicate we're above the trigger line.
 *
 *  Color ramp: cool → warm → alert as the estimate approaches the trigger.
 */
function ContextUsageRing({
  usage,
  t,
}: {
  usage: ContextUsageSnapshot | undefined;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  if (!usage || usage.triggerThreshold <= 0) return null;
  const pct = (usage.estimatedInputTokens / usage.triggerThreshold) * 100;
  const displayPct = Math.min(100, Math.max(0, pct));
  const size = 22;
  const stroke = 2.5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - displayPct / 100);
  let color = "var(--accent, #4a9eff)";
  if (pct >= 100) color = "#dc3545";
  else if (pct >= 80) color = "var(--context-usage-hot, var(--accent-hover, var(--accent)))";
  else if (pct >= 60) color = "var(--context-usage-warn, var(--accent))";
  else if (pct >= 40) color = "var(--context-usage-caution, var(--accent))";
  // p8 — optional per-layer breakdown appended to the tooltip as a
  // stacked summary. We roll the five layered-prompt slots (persona
  // / scene / memory / project / platform_hint) into a single "system"
  // line for compactness, and only surface layers whose weight is
  // non-trivial to keep the tooltip scannable.
  const breakdownLines: string[] = [];
  if (usage.layeredBreakdown) {
    const bd = usage.layeredBreakdown;
    const systemPrompt =
      bd.persona + bd.scene + bd.memory + bd.project + bd.platform_hint;
    const entries: Array<[string, number]> = [
      [t("chat.contextRingLayerSystem"), systemPrompt],
      [t("chat.contextRingLayerTools"), bd.tool_defs],
      [t("chat.contextRingLayerHistory"), bd.history_text],
      [t("chat.contextRingLayerToolResultsFull"), bd.history_tool_result_full],
      [t("chat.contextRingLayerToolResultsReceipt"), bd.history_tool_result_receipt],
      [t("chat.contextRingLayerSummary"), bd.rolling_summary],
      [t("chat.contextRingLayerStateFrame"), bd.state_frame],
      [t("chat.contextRingLayerVision"), bd.vision],
    ];
    const meaningful = entries.filter(([, v]) => v >= 32);
    if (meaningful.length > 0) {
      breakdownLines.push(t("chat.contextRingLayeredHeader"));
      for (const [label, value] of meaningful) {
        breakdownLines.push(`  · ${label}: ${formatTokenCount(value)}`);
      }
    }
  }
  const tooltip = [
    t("chat.contextRingTitle"),
    t("chat.contextRingEstimate", {
      estimated: formatTokenCount(usage.estimatedInputTokens),
      trigger: formatTokenCount(usage.triggerThreshold),
      budget: formatTokenCount(usage.totalInputBudget),
      pct: pct.toFixed(0),
    }),
    t("chat.contextRingCumulative", {
      input: formatTokenCount(usage.cumulativeInputTokens),
      output: formatTokenCount(usage.cumulativeOutputTokens),
    }),
    usage.rollingSummaryVersion > 0
      ? t("chat.contextRingSummary", { version: usage.rollingSummaryVersion })
      : t("chat.contextRingNoSummary"),
    usage.autoCompactThreshold > 0
      ? t("chat.contextRingAutoCompact", {
          threshold: formatTokenCount(usage.autoCompactThreshold),
        })
      : t("chat.contextRingAutoCompactDisabled"),
    ...breakdownLines,
  ].join("\n");
  const label = `${Math.round(pct)}%`;
  return (
    <div className="context-usage-ring" title={tooltip} aria-label={tooltip}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dashoffset 0.3s ease, stroke 0.3s ease" }}
        />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={color}
          fontSize="6.5"
          fontWeight="600"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {label}
        </text>
      </svg>
    </div>
  );
}

export type ChatNavigateTab = (
  tab: "skills" | "school",
  opts?: {
    schoolSubTab?: "fish" | "koi";
    marketLevel?: "experts" | "teams" | "skills";
    marketScope?: "market" | "installed";
  },
) => void;

interface ChatProps {
  onNavigateTab?: ChatNavigateTab;
  variant?: "task" | "im";
  onOpenSettings?: (sub: "channels" | "general" | "models") => void;
  activeKoiId?: string | null;
  summonKoiRequest?: { koiId: string | null; nonce: number } | null;
  onActiveKoiChange?: (koiId: string | null) => void;
}

export default function Chat({
  onNavigateTab,
  variant = "task",
  onOpenSettings,
  activeKoiId,
  summonKoiRequest,
  onActiveKoiChange,
}: ChatProps = {}) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const { sessions, activeSessionId, pendingMainChatNav } = useSelector((s: RootState) => s.sessions);
  const { messagesBySession, streaming, toolSteps, planBySession, isRunning, contextUsage } = useSelector(
    (s: RootState) => s.chat
  );
  const settings = useSelector((s: RootState) => s.settings.settings) as Settings | null;

  const [input, setInput] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  // File-journal review: files the agent changed in the last turn, per session.
  const [reviewBySession, setReviewBySession] = useState<Record<string, JournalChange[]>>({});
  const [undoingReview, setUndoingReview] = useState(false);
    const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const [sessionFilter, setSessionFilter] = useState<SessionKind>(() => (variant === "im" ? "im" : "chat"));
  // Which session-kind dropdown picker is currently open in the top bar.
  const [openPicker, setOpenPicker] = useState<SessionKind | null>(null);
  const [teamTaskDialogOpen, setTeamTaskDialogOpen] = useState(false);
  const [chatViewTab, setChatViewTab] = useState<"main" | "collab">("main");

  const pendingAutoSendRef = useRef<string | null>(null);

  // Pond IDE / Skills → main Chat: switch filter, session, and optional composer draft.
  useEffect(() => {
    if (!pendingMainChatNav) return;
    if (variant === "im" && pendingMainChatNav.filter !== "im") {
      dispatch(sessionsActions.clearPendingMainChatNav());
      return;
    }
    setSessionFilter(pendingMainChatNav.filter);
    if (pendingMainChatNav.sessionId) {
      dispatch(sessionsActions.setActiveSession(pendingMainChatNav.sessionId));
    }
    if (pendingMainChatNav.composerDraft) {
      setInput(pendingMainChatNav.composerDraft);
      if (pendingMainChatNav.autoSend) {
        pendingAutoSendRef.current = pendingMainChatNav.composerDraft;
      }
    }
    setOpenPicker(null);
    dispatch(sessionsActions.clearPendingMainChatNav());
  }, [pendingMainChatNav, dispatch, variant]);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const viewFilter: SessionKind = variant === "im" ? "im" : sessionFilter;
  const displaySessionId =
    activeSession && isMainChatVisibleSession(activeSession, viewFilter)
      ? activeSessionId
      : null;
  const displaySession = displaySessionId
    ? sessions.find((s) => s.id === displaySessionId)
    : undefined;
  const boundPoolSessionId = displaySession?.pool_session_id ?? null;
  const isTeamBoundSession = Boolean(boundPoolSessionId);

  useEffect(() => {
    setChatViewTab("main");
  }, [displaySessionId]);

  useEffect(() => {
    if (boundPoolSessionId) {
      dispatch(poolActions.setActivePoolSession(boundPoolSessionId));
    }
  }, [boundPoolSessionId, dispatch]);

  // ── Input history navigation (up/down arrows) ──────────────────────────

  // Composer: one-shot attachments/skills per send; Koi persona stays until user clears
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachmentItem[]>([]);
  const [selectedSkills, setSelectedSkills] = useState<Skill[]>([]);
  const [selectedKoi, setSelectedKoi] = useState<KoiWithStats | null>(null);
  const [recentKoiIds, setRecentKoiIds] = useState<string[]>(loadRecentKoiIds);
  const [composerMenuOpen, setComposerMenuOpen] = useState<null | "mode" | "workspace" | "koi" | "skill" | "model" | "permission">(null);
  const [skillMenuMode, setSkillMenuMode] = useState<"compact" | "all">("compact");
  const [composerMode, setComposerMode] = useState<ComposerMode>(
    () => (localStorage.getItem("piscis-composer-mode") as ComposerMode) || "craft",
  );
  const composerModeRef = useRef<ComposerMode>(composerMode);
  useEffect(() => {
    composerModeRef.current = composerMode;
    localStorage.setItem("piscis-composer-mode", composerMode);
  }, [composerMode]);
  const [chatScene, setChatScene] = useState<ChatScene>(
    () => (localStorage.getItem("piscis-chat-scene") as ChatScene) || "office",
  );
  const chatSceneRef = useRef<ChatScene>(chatScene);
  useEffect(() => {
    chatSceneRef.current = chatScene;
    localStorage.setItem("piscis-chat-scene", chatScene);
  }, [chatScene]);
  // Per-turn LLM selection. "" => use configured default provider/model.
  const [selectedModelProviderId, setSelectedModelProviderId] = useState<string>(
    () => localStorage.getItem("piscis-chat-model-provider-id") || "",
  );
  const selectedModelProviderIdRef = useRef<string>("");
  useEffect(() => {
    selectedModelProviderIdRef.current = selectedModelProviderId;
    localStorage.setItem("piscis-chat-model-provider-id", selectedModelProviderId);
  }, [selectedModelProviderId]);
  useEffect(() => {
    if (chatScene === "design") return;
    const selectedModel = selectedModelProviderId.includes("::")
      ? selectedModelProviderId.split("::").slice(1).join("::")
      : "";
    if (selectedModel && !modelAllowedInScene(selectedModel, chatScene)) {
      setSelectedModelProviderId("");
    }
  }, [chatScene, selectedModelProviderId]);
  useEffect(() => {
    if (chatScene === "design") return;
    if (!selectedModelProviderId || selectedModelProviderId.includes("::")) return;
    const providerModel = settings?.llm_providers?.find((p) => p.id === selectedModelProviderId)?.model;
    if (providerModel && !modelAllowedInScene(providerModel, chatScene)) {
      setSelectedModelProviderId("");
    }
  }, [chatScene, selectedModelProviderId, settings?.llm_providers]);
  const [providerModelsById, setProviderModelsById] = useState<Record<string, string[]>>({});
  const [providerModelLoadErrors, setProviderModelLoadErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    const providers = (settings?.llm_providers ?? []).filter((p) => p.base_url?.trim());
    if (!providers.length) {
      setProviderModelsById({});
      setProviderModelLoadErrors({});
      return;
    }
    let cancelled = false;
    Promise.allSettled(
      providers.map(async (provider) => {
        const result = await chatApi.listLlmProviderModels(provider.id);
        return { providerId: provider.id, models: result.models };
      }),
    ).then((results) => {
      if (cancelled) return;
      const nextModels: Record<string, string[]> = {};
      const nextErrors: Record<string, string> = {};
      results.forEach((result, idx) => {
        const providerId = providers[idx]?.id;
        if (!providerId) return;
        if (result.status === "fulfilled") {
          nextModels[providerId] = result.value.models;
        } else {
          nextErrors[providerId] = String(result.reason);
        }
      });
      setProviderModelsById(nextModels);
      setProviderModelLoadErrors(nextErrors);
    });
    return () => {
      cancelled = true;
    };
  }, [settings?.llm_providers]);
  const [topbarPanel, setTopbarPanel] = useState<null | "search" | "history">(null);
  const [convSearch, setConvSearch] = useState("");
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [previewArtifact, setPreviewArtifact] = useState<SessionArtifact | null>(null);
  const [shareNote, setShareNote] = useState("");
  // Voice dictation (Web Speech API; gracefully hidden when unsupported)
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const voiceSupported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  const toggleVoice = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch { /* noop */ }
      recognitionRef.current = null;
      setListening(false);
      return;
    }
    const rec = new SR();
    rec.lang = navigator.language || "zh-CN";
    rec.interimResults = false;
    rec.continuous = true;
    rec.onresult = (e: any) => {
      let text = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) text += e.results[i][0].transcript;
      }
      text = text.trim();
      if (text) setInput((prev) => (prev ? `${prev} ${text}` : text));
    };
    rec.onend = () => { setListening(false); recognitionRef.current = null; };
    rec.onerror = () => { setListening(false); recognitionRef.current = null; };
    recognitionRef.current = rec;
    try { rec.start(); setListening(true); } catch { setListening(false); }
  }, []);
  const reduxSkills = useSelector((state: RootState) => state.skills.skills);
  const installedSkills = useMemo(
    () => composerSelectableSkills(reduxSkills),
    [reduxSkills],
  );
  const primaryOfficeSkills = useMemo(
    () => composerPrimaryOfficeSkills(reduxSkills),
    [reduxSkills],
  );
  const [koiList, setKoiList] = useState<KoiWithStats[]>([]);
  const [gatewayChannels, setGatewayChannels] = useState<ChannelInfo[]>([]);
  const [gatewayConnecting, setGatewayConnecting] = useState(false);
  const [gatewayDisconnecting, setGatewayDisconnecting] = useState(false);
  const [workspaceDisplayOverride, setWorkspaceDisplayOverride] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [deletingSession, setDeletingSession] = useState(false);
  // History pagination: capacity starts at CHAT_INITIAL_SIZE, grows by CHAT_LAZY_STEP on each lazy-load
  const CHAT_INITIAL_SIZE = 200;
  const CHAT_LAZY_STEP = 10;
  const [capacity, setCapacity] = useState(CHAT_INITIAL_SIZE);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [loadingMoreHistory, setLoadingMoreHistory] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [permissionRequest, setPermissionRequest] = useState<{
    requestId: string;
    toolName: string;
    toolInput: any;
    description: string;
  } | null>(null);

  // Pending interactive UI cards from chat_ui (per session; cleared on agent done)
  const [interactiveCardsBySession, setInteractiveCardsBySession] = useState<
    Record<
      string,
      Record<
        string,
        {
          requestId: string;
          uiDefinition: import("./interactiveUi/protocol").UiDefinition;
          submitted?: boolean;
          listenOpen?: boolean;
          wizardStepHint?: number;
        }
      >
    >
  >({});

  // Context debug preview
  type ContextPreviewBlock =
    | { type: "text"; text: string }
    | { type: "tool_use"; id: string; name: string; input: string }
    | { type: "tool_result"; tool_use_id: string; content: string; is_error: boolean; truncated: boolean }
    | { type: "image"; note: string };

  const [contextPreview, setContextPreview] = useState<{
    messages: { role: string; blocks: ContextPreviewBlock[]; tokens: number }[];
    messages_tokens: number;
    total_tokens: number;
    model: string;
    context_budget: number;
    total_input_budget: number;
    request_overhead_tokens: number;
    tool_count: number;
    rolling_summary_version: number;
    total_input_tokens: number;
    total_output_tokens: number;
    last_compacted_at?: string | null;
  } | null>(null);
  const [contextPreviewLoading, setContextPreviewLoading] = useState(false);
  // Track which tool_use/tool_result blocks are expanded (by index key "msgIdx-blockIdx")
  const [expandedBlocks, setExpandedBlocks] = useState<Set<string>>(new Set());
  const toggleBlock = (key: string) => {
    setExpandedBlocks(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const handleShowContextPreview = async () => {
    if (!displaySessionId) return;
    setContextPreviewLoading(true);
    try {
      const preview = await invoke<NonNullable<typeof contextPreview>>("get_context_preview", { sessionId: displaySessionId });
      setContextPreview(preview);
      setExpandedBlocks(new Set());
    } catch (e) {
      alert("Failed to load context preview: " + String(e));
    } finally {
      setContextPreviewLoading(false);
    }
  };

  /** Fire-and-forget seed the context-usage ring from the read-only preview command.
   *  Called on session switch and after `done` so the ring reflects the idle state
   *  of the session even when no agent run is currently streaming events. */
  const seedContextUsage = useCallback((sessionId: string) => {
    invoke<{
      total_tokens: number;
      request_view_tokens?: number;
      idle_indicator_tokens?: number;
      total_input_budget: number;
      rolling_summary_version: number;
      total_input_tokens: number;
      total_output_tokens: number;
    }>("get_context_preview", { sessionId })
      .then((preview) => {
        const trigger = Math.round(preview.total_input_budget * 0.6);
        dispatch(chatActions.setContextUsage({
          sessionId,
          usage: {
            estimatedInputTokens:
              preview.idle_indicator_tokens
              ?? preview.request_view_tokens
              ?? preview.total_tokens,
            totalInputBudget: preview.total_input_budget,
            triggerThreshold: trigger,
            cumulativeInputTokens: preview.total_input_tokens,
            cumulativeOutputTokens: preview.total_output_tokens,
            rollingSummaryVersion: preview.rolling_summary_version,
            autoCompactThreshold: contextUsageRef.current[sessionId]?.autoCompactThreshold ?? 0,
          },
        }));
      })
      .catch(() => { /* silent — ring just stays stale */ });
  }, [dispatch]);

  // Track latest contextUsage by ref so seedContextUsage can preserve auto-compact threshold
  // (which only the agent-run event path knows about).
  const contextUsageRef = useRef(contextUsage);
  contextUsageRef.current = contextUsage;
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesAreaRef = useRef<HTMLDivElement>(null);
  const toolStepsScrollRef = useRef<HTMLDivElement>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const artifactsUnlistenRef = useRef<UnlistenFn | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Whether the user is scrolled near the bottom (so we auto-scroll on new messages)
  const isNearBottomRef = useRef(true);
  // Sync guard during loadMoreHistory (suppress auto-scroll + re-entrancy)
  const loadingMoreRef = useRef(false);
  // Number of DB rows currently loaded from the newest end. This is the real
  // pagination offset for "load more history" and is intentionally decoupled
  // from the store array length: setMessagesWithFrozen collapses a completed
  // agent turn (many DB rows) into a single synthetic bubble, so the store
  // length is much smaller than the number of DB rows actually loaded.
  const loadedDbCountRef = useRef(0);
  /** Restore scrollTop after older messages are prepended and painted. */
  const scrollRestoreRef = useRef<number | null>(null);
  const prevScrollTopRef = useRef(0);
  // Keep a ref to the visible main-chat session so event callbacks always see the latest value
  const activeSessionIdRef = useRef<string | null>(displaySessionId);
  useEffect(() => {
    activeSessionIdRef.current = displaySessionId;
  }, [displaySessionId]);
  // Keep a ref to isImSession so the event callback closure always sees the latest value
  const isImSessionRef = useRef(false);

  // Throttle buffer for text_delta — accumulate deltas and flush every 80ms
  const deltaBufferRef = useRef<Record<string, string>>({});
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flushBufferedDelta = useCallback((sessionId: string) => {
    const buffered = deltaBufferRef.current[sessionId];
    if (!buffered) return;
    delete deltaBufferRef.current[sessionId];
    dispatch(chatActions.appendDelta({ sessionId, delta: buffered }));
  }, [dispatch]);

  useEffect(() => {
    flushTimerRef.current = setInterval(() => {
      const buffer = deltaBufferRef.current;
      const entries = Object.entries(buffer);
      if (entries.length === 0) return;
      deltaBufferRef.current = {};
      for (const [sid, delta] of entries) {
        if (delta) {
          dispatch(chatActions.appendDelta({ sessionId: sid, delta }));
        }
      }
    }, 80);
    return () => {
      if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    };
  }, [dispatch]);

  const rawMessages = displaySessionId ? messagesBySession[displaySessionId] ?? [] : [];
  const chatInputHistoryScope = displaySessionId ? `chat:${displaySessionId}` : null;

  useEffect(() => {
    if (!chatInputHistoryScope) return;
    const texts = rawMessages
      .filter((m) => m.role === "user" && !m.id.startsWith("optimistic_"))
      .map((m) => m.content);
    seedInputHistory(chatInputHistoryScope, texts);
  }, [chatInputHistoryScope, rawMessages]);

  const interactiveCards = displaySessionId
    ? interactiveCardsBySession[displaySessionId] ?? {}
    : {};

  // Extract historical interactive cards from chat_ui tool calls in persisted messages
  const historicalCards = useMemo(() => {
    const cards: Record<string, { requestId: string; uiDefinition: any; submittedValues: Record<string, unknown> | null; afterMessageId: string }> = {};
    for (let i = 0; i < rawMessages.length; i++) {
      const m = rawMessages[i];
      if (m.role !== "assistant" || !m.tool_calls_json) continue;
      try {
        const calls = JSON.parse(m.tool_calls_json);
        for (const call of Array.isArray(calls) ? calls : []) {
          if (call.name !== "chat_ui") continue;
          const uiDef = call.input?.ui_definition;
          if (!uiDef) continue;
          // Find matching tool result in subsequent messages
          let submittedValues: Record<string, unknown> | null = null;
          for (let j = i + 1; j < rawMessages.length && j <= i + 3; j++) {
            const rm = rawMessages[j];
            if (!rm.tool_results_json) continue;
            try {
              const results = JSON.parse(rm.tool_results_json);
              for (const r of Array.isArray(results) ? results : []) {
                if (r.tool_use_id === call.id && !r.is_error) {
                  try {
                    const marker = "USER_INTERACTIVE_RESPONSE_JSON:";
                    const content = String(r.content ?? "");
                    const jsonText = content.includes(marker)
                      ? content.slice(content.indexOf(marker) + marker.length).split("\n\n")[0]
                      : content.replace(/^User submitted.*?Selections:\n/, "");
                    submittedValues = JSON.parse(jsonText);
                  } catch { /* text result */ }
                }
              }
            } catch { /* ignore parse errors */ }
          }
          cards[call.id] = { requestId: call.id, uiDefinition: uiDef, submittedValues, afterMessageId: m.id };
        }
      } catch { /* ignore parse errors */ }
    }
    return cards;
  }, [rawMessages]);

  // Live cards still waiting for input — skip if the same request is already in message history
  const pendingLiveCards = useMemo(() => {
    return Object.values(interactiveCards).filter((card) => {
      if (card.submitted) return false;
      if (historicalCards[card.requestId]) return false;
      return true;
    });
  }, [interactiveCards, historicalCards]);

  const markInteractiveSubmitted = useCallback((sessionId: string, requestId: string) => {
    setInteractiveCardsBySession((all) => {
      const sessionCards = all[sessionId];
      if (!sessionCards?.[requestId]) return all;
      return {
        ...all,
        [sessionId]: {
          ...sessionCards,
          [requestId]: { ...sessionCards[requestId], submitted: true },
        },
      };
    });
  }, []);

  // Check if a message is a chat_ui tool call or its result (should be rendered as a card, not filtered entirely)
  const chatUiToolCallIds = useMemo(() => {
    const ids = new Set<string>();
    for (const m of rawMessages) {
      if (m.role === "assistant" && m.tool_calls_json) {
        try {
          const calls = JSON.parse(m.tool_calls_json);
          for (const c of Array.isArray(calls) ? calls : []) {
            if (c.name === "chat_ui") ids.add(m.id);
          }
        } catch { /* ignore */ }
      }
    }
    return ids;
  }, [rawMessages]);

  const activeMessages = rawMessages
    // Filter out tool-result carrier messages (role=user, no text content, only tool_results_json)
    .filter((m) => !(m.role === "user" && !m.content.trim() && m.tool_results_json))
    // Filter out pure tool-call assistant messages (no text content, only tool_calls_json).
    // Keep assistant messages that have actual text content even if they also have tool_calls_json.
    // BUT keep chat_ui tool calls since they render as interactive cards.
    .filter((m) => !(m.role === "assistant" && !m.content.trim() && m.tool_calls_json && !chatUiToolCallIds.has(m.id)))
    // Filter out duplicate consecutive messages with same role and content
    .filter((m, i, arr) => {
      if (i === 0) return true;
      const prev = arr[i - 1];
      return !(prev.role === m.role && prev.content === m.content);
    })
    // Merge consecutive assistant pure-text messages sharing the same turn_index into
    // a single bubble. History would otherwise render each iteration of a single user
    // turn as its own short bubble, which differs from the live streaming view where
    // all iteration output is accumulated into one bubble.
    .reduce<ChatMessage[]>((acc, msg) => {
      const prev = acc[acc.length - 1];
      const canMerge =
        prev != null &&
        prev.role === "assistant" &&
        msg.role === "assistant" &&
        !chatUiToolCallIds.has(prev.id) &&
        !chatUiToolCallIds.has(msg.id) &&
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
  const streamingState: StreamingState | null = displaySessionId ? streaming[displaySessionId] ?? null : null;
  const streamingCurrent = streamingState?.current ?? "";
  const running = displaySessionId ? isRunning[displaySessionId] ?? false : false;
  const steps = displaySessionId ? toolSteps[displaySessionId] ?? [] : [];
  const activePlan = displaySessionId ? planBySession[displaySessionId] ?? [] : [];
  const [activeArtifacts, setActiveArtifacts] = useState<SessionArtifact[]>([]);

  const hasTaskPanel = activePlan.length > 0 || steps.length > 0 || activeArtifacts.length > 0;
  const [taskPanelOpen, setTaskPanelOpen] = useState(true);
  const [taskPanelTab, setTaskPanelTab] = useState<"todo" | "tools" | "artifacts">("todo");
  // Top-bar task tab click: toggle the panel when re-selecting the active tab,
  // otherwise switch to the tab and make sure the panel is open.
  const selectTaskTab = useCallback(
    (tab: "todo" | "tools" | "artifacts") => {
      setTaskPanelTab((prev) => {
        if (prev === tab) {
          setTaskPanelOpen((open) => !open);
        } else {
          setTaskPanelOpen(true);
        }
        return tab;
      });
    },
    [],
  );

  // Plan resume dialog: shown when user sends a message while unfinished todos exist
  const [planResumeDialog, setPlanResumeDialog] = useState<{
    pendingContent: string;
    pendingAttachments: PendingAttachmentItem[];
    pendingSkills: Skill[];
    pendingKoi: KoiWithStats | null;
  } | null>(null);
  const prevRunningRef = useRef(false);
  useEffect(() => {
    if (running && !prevRunningRef.current) {
      setTaskPanelOpen(true);
      if (activePlan.length === 0 && steps.length > 0) {
        setTaskPanelTab("tools");
      } else if (activePlan.length === 0 && steps.length === 0 && activeArtifacts.length > 0) {
        setTaskPanelTab("artifacts");
      }
    }
    // When a run finishes (true → false), automatically re-focus the chat
    // input so the user can keep typing without an extra mouse click.
    if (!running && prevRunningRef.current) {
      // The textarea is briefly `disabled` while running; defer one tick so
      // the browser re-enables it before we focus.
      requestAnimationFrame(() => {
        textareaRef.current?.focus();
      });
    }
    prevRunningRef.current = running;
  }, [running, activePlan.length, steps.length, activeArtifacts.length]);
  useEffect(() => {
    if (!hasTaskPanel) return;
    if (taskPanelTab === "todo" && activePlan.length === 0 && steps.length > 0) {
      setTaskPanelTab("tools");
    } else if (taskPanelTab === "todo" && activePlan.length === 0 && steps.length === 0 && activeArtifacts.length > 0) {
      setTaskPanelTab("artifacts");
    } else if (taskPanelTab === "tools" && steps.length === 0 && activePlan.length > 0) {
      setTaskPanelTab("todo");
    } else if (taskPanelTab === "tools" && steps.length === 0 && activePlan.length === 0 && activeArtifacts.length > 0) {
      setTaskPanelTab("artifacts");
    } else if (taskPanelTab === "artifacts" && activeArtifacts.length === 0 && activePlan.length > 0) {
      setTaskPanelTab("todo");
    } else if (taskPanelTab === "artifacts" && activeArtifacts.length === 0 && steps.length > 0) {
      setTaskPanelTab("tools");
    }
  }, [taskPanelTab, activePlan.length, steps.length, activeArtifacts.length, hasTaskPanel]);
  const activeSessionKind = classifySession(displaySession);
  const isImSession = activeSessionKind === "im";
  isImSessionRef.current = isImSession;

  useEffect(() => {
    setWorkspaceDisplayOverride(null);
  }, [displaySessionId, displaySession?.workspace_root, settings?.workspace_root]);

  // Load messages when the active session ID changes.
  // Also sync running state from DB to fix stale state if im_session_done was missed.
  useEffect(() => {
    if (!displaySessionId) return;
    setCapacity(CHAT_INITIAL_SIZE);
    setUnreadCount(0);
    scrollRestoreRef.current = null;
    loadingMoreRef.current = false;
    setLoadingMoreHistory(false);
    prevLastChatIdRef.current = null;
    isNearBottomRef.current = true;
    setActiveArtifacts([]);

    const load = async () => {
      try {
        const [messages, { sessions: fresh }, artifacts] = await Promise.all([
          sessionsApi.getMessages(displaySessionId, CHAT_INITIAL_SIZE, 0),
          sessionsApi.list(),
          artifactsApi.list(displaySessionId),
        ]);
        setActiveArtifacts(artifacts);
        seedContextUsage(displaySessionId);
        // Use setMessagesWithFrozen: if a frozenBubble exists for this session (set during
        // a recent agent run), it is preserved as a single collapsed bubble. For sessions
        // with no frozenBubble (old history, other sessions), it falls back to plain setMessages.
        // Do NOT auto-reconstruct frozenBubble from DB here — that would collapse all history.
        dispatch(chatActions.setMessagesWithFrozen({ sessionId: displaySessionId, messages }));
        // Track the real DB-row offset (raw count fetched), not the possibly-collapsed store length.
        loadedDbCountRef.current = messages.length;
        const s = fresh.find((x) => x.id === displaySessionId);
        dispatch(sessionsActions.syncSessionsMetadata(fresh));
        const restored = reconstructPersistedTaskPanels(messages);
        dispatch(chatActions.restoreTaskPanels({
          sessionId: displaySessionId,
          toolSteps: restored.toolSteps,
          planItems: restored.planItems,
          turnDone: s?.status !== "running",
        }));
        setHasMoreHistory(messages.length >= CHAT_INITIAL_SIZE);
        // Correct stale running state from DB
        if (s && s.status !== "running") {
          dispatch(chatActions.setRunning({ sessionId: displaySessionId, running: false }));
          dispatch(chatActions.clearStreaming(displaySessionId));
        }
      } catch (e) {
        console.error('[Chat] failed to load messages on session switch:', e);
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displaySessionId, dispatch]);

  useEffect(() => {
    if (artifactsUnlistenRef.current) {
      artifactsUnlistenRef.current();
      artifactsUnlistenRef.current = null;
    }
    if (!displaySessionId) return;

    let cancelled = false;
    const sessionId = displaySessionId;
    artifactsApi.onUpdated(sessionId, () => {
      artifactsApi.list(sessionId)
        .then((artifacts) => {
          if (!cancelled) setActiveArtifacts(artifacts);
        })
        .catch(() => {});
    })
      .then((unlisten) => {
        if (cancelled) {
          unlisten();
        } else {
          artifactsUnlistenRef.current = unlisten;
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      if (artifactsUnlistenRef.current) {
        artifactsUnlistenRef.current();
        artifactsUnlistenRef.current = null;
      }
    };
  }, [displaySessionId]);

  // Load CHAT_LAZY_STEP older messages (incremental prepend), triggered by scrolling to top
  const loadMoreHistory = useCallback(() => {
    if (!displaySessionId || loadingMoreRef.current) return;
    const el = messagesAreaRef.current;
    const prevScrollHeight = el ? el.scrollHeight : 0;
    // Use the real DB-row offset, not the store length: a collapsed agent turn
    // makes the store much shorter than the rows already loaded, which would
    // otherwise re-request rows inside the loaded window and never reach older history.
    const offset = loadedDbCountRef.current;
    loadingMoreRef.current = true;
    setLoadingMoreHistory(true);
    scrollRestoreRef.current = prevScrollHeight;
    sessionsApi.getMessages(displaySessionId, CHAT_LAZY_STEP, offset).then((older) => {
      if (older.length > 0) {
        // Advance the DB offset past every row we just consumed (including any that
        // happen to already be displayed), so the next page continues strictly older.
        loadedDbCountRef.current = offset + older.length;
        const existingIds = new Set((messagesBySession[displaySessionId] ?? []).map((m) => m.id));
        const newOnes = older.filter((m) => !existingIds.has(m.id));
        setHasMoreHistory(older.length === CHAT_LAZY_STEP);
        if (newOnes.length > 0) {
          dispatch(chatActions.prependChatMessages({ sessionId: displaySessionId, messages: older }));
          setCapacity((c) => c + newOnes.length);
          // Scroll position is restored by the layout effect once the prepend paints.
        } else {
          // This page was entirely already-displayed rows. The store length is
          // unchanged, so the scroll-restore layout effect won't fire — release
          // the guards here so the next scroll-up can fetch the next older page.
          scrollRestoreRef.current = null;
          loadingMoreRef.current = false;
          setLoadingMoreHistory(false);
        }
      } else {
        setHasMoreHistory(false);
        scrollRestoreRef.current = null;
        loadingMoreRef.current = false;
        setLoadingMoreHistory(false);
      }
    }).catch(() => {
      scrollRestoreRef.current = null;
      loadingMoreRef.current = false;
      setLoadingMoreHistory(false);
    });
  }, [displaySessionId, messagesBySession, dispatch]);

  // Restore scroll after prepend is committed to the DOM (avoids locking scrollTop at 0)
  useLayoutEffect(() => {
    if (scrollRestoreRef.current == null) return;
    const el = messagesAreaRef.current;
    if (!el) return;
    const prevScrollHeight = scrollRestoreRef.current;
    scrollRestoreRef.current = null;
    el.scrollTop = Math.max(0, el.scrollHeight - prevScrollHeight);
    loadingMoreRef.current = false;
    setLoadingMoreHistory(false);
  }, [rawMessages.length]);

  // When the list is shorter than the viewport, wheel scroll cannot hit the top — keep loading until scrollable or exhausted
  useEffect(() => {
    if (!displaySessionId || !hasMoreHistory || loadingMoreRef.current || loadingMoreHistory) return;
    const el = messagesAreaRef.current;
    if (!el) return;
    if (el.scrollHeight - el.clientHeight > 8) return;
    loadMoreHistory();
  }, [displaySessionId, hasMoreHistory, rawMessages.length, loadingMoreHistory, loadMoreHistory]);

  // When the filter changes, switch to the first visible session if the current
  // active session is not visible under the new filter.
  // We use refs for sessions/activeSessionId to avoid re-running on every session
  // list update (which would kick the user out of IM sessions not yet in the list).
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;
  const activeSessionIdForFilterRef = useRef(activeSessionId);
  activeSessionIdForFilterRef.current = activeSessionId;
  useEffect(() => {
    const filter = variant === "im" ? "im" : sessionFilter;
    const currentSessions = sessionsRef.current;
    const currentActiveId = activeSessionIdForFilterRef.current;
    const visibleSessions = currentSessions.filter((x) =>
      isMainChatVisibleSession(x, filter),
    );
    const s = currentActiveId ? currentSessions.find((x) => x.id === currentActiveId) : null;
    if (s && visibleSessions.some((x) => x.id === s.id)) return;
    dispatch(sessionsActions.setActiveSession(pickMainChatActiveSession(currentSessions, filter)));
  }, [sessionFilter, dispatch, variant]);

  // Heartbeat / pool coordination sessions are internal — never keep them as the
  // main Chat active session (sidebar hides them but messages would still load).
  useEffect(() => {
    const filter = variant === "im" ? "im" : sessionFilter;
    if (!activeSessionId) return;
    const current = sessions.find((s) => s.id === activeSessionId);
    if (!current || isMainChatVisibleSession(current, filter)) return;
    dispatch(sessionsActions.setActiveSession(pickMainChatActiveSession(sessions, filter)));
  }, [sessions, activeSessionId, sessionFilter, dispatch, variant]);

  // Subscribe to agent events for the visible main-chat session only (not heartbeat / pool internal).
  useEffect(() => {
    if (!displaySessionId) return;

    // Cleanup previous listener synchronously before registering the new one
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }

    let cancelled = false;

    // The session id this listener is bound to — used for session-scoped operations
    // like freezeStreaming and getMessages on done, which must target THIS session,
    // not whatever session happens to be active when the event fires.
    const boundSessionId = displaySessionId;
    console.log('[Chat] registering event listener for session:', boundSessionId);
    chatApi.onEvent(displaySessionId, (event: AgentEventType) => {
      console.log('[Chat] received event:', event.type, 'for session:', boundSessionId);
      // For streaming deltas: write to the currently visible session (ref) so the user
      // sees live output even if they switched sessions mid-stream.
      // For session-scoped finalization (done, error): always use boundSessionId so we
      // don't corrupt another session's frozenBubble or message state.
      const sid = activeSessionIdRef.current;
      if (!sid) return;
      switch (event.type) {
        case "text_segment_start":
          // Flush any buffered delta before starting a new segment
          flushBufferedDelta(sid);
          // Mark segment boundary — current text stays visible, new deltas will append
          dispatch(chatActions.startNewSegment(sid));
          break;
        case "text_delta":
          // Buffer delta for throttled flush (80ms interval)
          deltaBufferRef.current[sid] = (deltaBufferRef.current[sid] ?? "") + event.delta;
          break;
        case "context_usage":
          dispatch(chatActions.setContextUsage({
            sessionId: sid,
            usage: {
              estimatedInputTokens: event.estimated_input_tokens,
              totalInputBudget: event.total_input_budget,
              triggerThreshold: event.trigger_threshold,
              cumulativeInputTokens: event.cumulative_input_tokens,
              cumulativeOutputTokens: event.cumulative_output_tokens,
              rollingSummaryVersion: event.rolling_summary_version,
              autoCompactThreshold: event.auto_compact_threshold,
              layeredBreakdown: event.layered_breakdown,
            },
          }));
          break;
        case "tool_start":
          dispatch(chatActions.addToolStep({ sessionId: sid, id: event.id, name: event.name, input: event.input }));
          break;
        case "tool_end":
          // Mark the step as completed — it stays visible for the user to review
          dispatch(chatActions.completeToolStep({
            sessionId: sid,
            id: event.id,
            result: event.result,
            isError: event.is_error ?? false,
          }));
          break;
        case "plan_update":
          dispatch(chatActions.setPlan({ sessionId: sid, items: event.items }));
          break;
        case "permission_request":
          setPermissionRequest({
            requestId: event.request_id,
            toolName: event.tool_name,
            toolInput: event.tool_input,
            description: event.description,
          });
          break;
        case "interactive_ui":
          setInteractiveCardsBySession((all) => ({
            ...all,
            [boundSessionId]: {
              ...(all[boundSessionId] ?? {}),
              [event.request_id]: {
                requestId: event.request_id,
                uiDefinition: event.ui_definition as import("./interactiveUi/protocol").UiDefinition,
                listenOpen: false,
              },
            },
          }));
          if (activeSessionIdRef.current === boundSessionId) {
            setTimeout(() => scrollToBottom(true), 50);
          }
          break;
        case "interactive_ui_patch": {
          const patch = event.patch as UiPatch;
          setInteractiveCardsBySession((all) => {
            const sessionCards = all[boundSessionId];
            const card = sessionCards?.[event.request_id];
            if (!card) return all;
            return {
              ...all,
              [boundSessionId]: {
                ...sessionCards,
                [event.request_id]: {
                  ...card,
                  uiDefinition: applyUiPatch(card.uiDefinition, patch),
                  listenOpen: patch.reopen_submit === true ? true : card.listenOpen,
                  wizardStepHint: patch.wizard_step ?? card.wizardStepHint,
                },
              },
            };
          });
          if (activeSessionIdRef.current === boundSessionId) {
            setTimeout(() => scrollToBottom(true), 50);
          }
          break;
        }
        case "interactive_ui_listen":
          setInteractiveCardsBySession((all) => {
            const sessionCards = all[boundSessionId];
            const card = sessionCards?.[event.request_id];
            if (!card) return all;
            return {
              ...all,
              [boundSessionId]: {
                ...sessionCards,
                [event.request_id]: { ...card, listenOpen: true },
              },
            };
          });
          break;
        case "done":
          // Use boundSessionId (the session this listener was registered for) so that
          // freezeStreaming and getMessages always target the correct session, even if
          // the user switched to a different session while the agent was running.
          console.log('[Chat] agent done event, boundSid=', boundSessionId);
          setInteractiveCardsBySession((all) => ({
            ...all,
            [boundSessionId]: {},
          }));
          flushBufferedDelta(boundSessionId);
          dispatch(chatActions.setRunning({ sessionId: boundSessionId, running: false }));
          dispatch(chatActions.freezeStreaming(boundSessionId));
          dispatch(chatActions.removeOptimisticMessages(boundSessionId));
          // Keep the last live ContextUsage snapshot after a run finishes.
          // During a run the ring shows "the request we just sent / were about
          // to send"; seeding from get_context_preview here would immediately
          // switch semantics to "the next recovered turn from DB", which can
          // jump upward right after the final summary is persisted.
          // We only reseed from preview on session switch / resume.
          sessionsApi.getMessages(boundSessionId, CHAT_INITIAL_SIZE).then((messages) => {
            console.log('[Chat] done: reloaded', messages.length, 'messages for', boundSessionId);
            dispatch(chatActions.setMessagesWithFrozen({ sessionId: boundSessionId, messages }));
            // Re-anchor the pagination offset to the freshly fetched newest window,
            // since this reload replaces the loaded window (and collapses the last turn).
            if (activeSessionIdRef.current === boundSessionId) {
              loadedDbCountRef.current = messages.length;
            }
            const restored = reconstructPersistedTaskPanels(messages);
            dispatch(chatActions.restoreTaskPanels({
              sessionId: boundSessionId,
              toolSteps: restored.toolSteps,
              planItems: restored.planItems,
              turnDone: true,
            }));
          }).catch(() => {});
          artifactsApi.list(boundSessionId)
            .then((artifacts) => {
              if (activeSessionIdRef.current === boundSessionId) {
                setActiveArtifacts(artifacts);
              }
            })
            .catch(() => {});
          sessionsApi.list(200)
            .then(({ sessions: fresh }) => {
              dispatch(sessionsActions.syncSessionsMetadata(fresh));
            })
            .catch(() => {});
          // Surface the files this turn changed so the user can Undo All.
          journalApi.listChanges(boundSessionId)
            .then((changes) => {
              setReviewBySession((all) => ({ ...all, [boundSessionId]: changes }));
            })
            .catch(() => {});
          break;
        case "cancelled":
          setInteractiveCardsBySession((all) => ({
            ...all,
            [boundSessionId]: {},
          }));
          flushBufferedDelta(boundSessionId);
          dispatch(chatActions.setRunning({ sessionId: boundSessionId, running: false }));
          dispatch(chatActions.clearStreaming(boundSessionId));
          dispatch(chatActions.removeOptimisticMessages(boundSessionId));
          break;
        case "fish_progress":
          dispatch(chatActions.updateFishProgress({
            sessionId: sid,
            fishId: event.fish_id,
            fishName: event.fish_name,
            iteration: event.iteration,
            toolName: event.tool_name,
            status: event.status,
            textDelta: (event as { type: "fish_progress"; fish_id: string; fish_name: string; iteration: number; tool_name: string | null; status: string; text_delta?: string }).text_delta,
          }));
          break;
        case "error":
          // Also use boundSessionId for error — clears running state for the correct session.
          flushBufferedDelta(boundSessionId);
          dispatch(chatActions.setRunning({ sessionId: boundSessionId, running: false }));
          dispatch(chatActions.clearStreaming(boundSessionId));
          setSendError((event as { type: "error"; message: string }).message ?? "Unknown error");
          break;
      }
    }).then((unlisten) => {
      if (cancelled) {
        // Effect already cleaned up before the promise resolved — unlisten immediately
        unlisten();
      } else {
        unlistenRef.current = unlisten;
      }
    });

    return () => {
      cancelled = true;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [displaySessionId, dispatch, flushBufferedDelta]);

  // Track whether user is near the bottom (bottom 10%) and trigger lazy-load on scroll to top
  useEffect(() => {
    const el = messagesAreaRef.current;
    if (!el) return;
    const onScroll = () => {
      const scrollable = el.scrollHeight - el.clientHeight;
      isNearBottomRef.current = scrollable <= 0 || el.scrollTop >= scrollable * 0.9;
      if (isNearBottomRef.current) setUnreadCount(0);
      const scrollingUp = el.scrollTop < prevScrollTopRef.current;
      prevScrollTopRef.current = el.scrollTop;
      // Trigger lazy-load when user scrolls up near the top (not while stuck at 0 after restore)
      if (
        scrollingUp &&
        el.scrollTop < 60 &&
        hasMoreHistory &&
        !loadingMoreRef.current
      ) {
        loadMoreHistory();
      }
    };
    prevScrollTopRef.current = el.scrollTop;
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [hasMoreHistory, loadMoreHistory, displaySessionId]);

  // Scroll the messages area to the bottom without affecting parent containers.
  // scrollIntoView() bubbles up and can cause the whole window to jump in Tauri WebView;
  // directly setting scrollTop on the container avoids that.
  const scrollToBottom = useCallback((smooth = true) => {
    const el = messagesAreaRef.current;
    if (!el) return;
    if (smooth) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  // Detect real-time appends (tail id changed), apply FIFO trim, auto-scroll or show unread badge
  const prevLastChatIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (loadingMoreRef.current || rawMessages.length === 0) return;
    const lastId = rawMessages[rawMessages.length - 1].id;
    const isAppend = lastId !== prevLastChatIdRef.current && prevLastChatIdRef.current !== null;
    prevLastChatIdRef.current = lastId;
    if (!isAppend) {
      // Still auto-scroll for streaming updates (streamingCurrent changes)
      if (isNearBottomRef.current) {
        scrollToBottom();
      }
      return;
    }
    // FIFO trim: evict oldest messages beyond current capacity
    if (displaySessionId && rawMessages.length > capacity) {
      dispatch(chatActions.trimChatMessages({ sessionId: displaySessionId, capacity }));
      setHasMoreHistory(true);
      // After trim the oldest loaded row sits at `capacity` from the newest end,
      // so the next "load more" must continue paginating from there.
      if (loadedDbCountRef.current > capacity) {
        loadedDbCountRef.current = capacity;
      }
    }
    if (isNearBottomRef.current) {
      scrollToBottom();
      setUnreadCount(0);
    } else {
      setUnreadCount((n) => n + 1);
    }
  }, [rawMessages, streamingCurrent, capacity, displaySessionId, dispatch, scrollToBottom]);

  // Scroll the tool-steps area to the bottom when a new step is added or toggled open
  useEffect(() => {
    const el = toolStepsScrollRef.current;
    if (!el) return;
    // Scroll to bottom of the steps scroll container so the latest step is always visible
    el.scrollTop = el.scrollHeight;
  }, [steps]);

  const handleNewSession = useCallback(async () => {
    if (variant === "im") return;
    setSessionFilter("chat");
    setOpenPicker(null);
    try {
      const session = await sessionsApi.create(t("chat.newChat"));
      dispatch(sessionsActions.addSession(session));
      dispatch(sessionsActions.setActiveSession(session.id));
    } catch (e) {
      setSendError(t("chat.failedCreate", { error: String(e) }));
    }
  }, [dispatch, t, variant]);

  // Refresh the full session list when opening Pond CLI so assistant / headless
  // sessions created outside the main chat flow appear in the sidebar.
  useEffect(() => {
    if (sessionFilter !== "cli") return;
    sessionsApi
      .list(200, 0)
      .then(({ sessions: fresh }) => dispatch(sessionsActions.setSessions(fresh)))
      .catch(() => {});
  }, [sessionFilter, dispatch]);

  // Load gateway status on mount and when switching to IM filter
  useEffect(() => {
    gatewayApi.list().then((r) => setGatewayChannels(r.channels)).catch(() => setGatewayChannels([]));
  }, [sessionFilter]);

  useEffect(() => {
    skillsApi.list()
      .then((r) => dispatch(skillsActions.setSkills(r.skills)))
      .catch(() => dispatch(skillsActions.setSkills([])));
    koiApi.list().then(setKoiList).catch(() => setKoiList([]));
  }, [dispatch]);

  useEffect(() => {
    const unlisten = listen<{ channels: ChannelInfo[] }>("gateway_channels_updated", (event) => {
      setGatewayChannels(event.payload.channels ?? []);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // (activeFishIds removed — session filtering no longer depends on Fish activation state)

  const handleGatewayConnect = useCallback(async () => {
    setGatewayConnecting(true);
    try {
      const r = await Promise.race([
        gatewayApi.connect(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(t("settings.channelTimeout"))), 20000)),
      ]);
      setGatewayChannels(r.channels);
    } catch {
      // ignore, user can retry
    } finally {
      setGatewayConnecting(false);
    }
  }, [t]);

  const handleGatewayDisconnect = useCallback(async () => {
    setGatewayDisconnecting(true);
    try {
      await gatewayApi.disconnect();
      setGatewayChannels([]);
    } catch {
      // ignore
    } finally {
      setGatewayDisconnecting(false);
    }
  }, []);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    try {
      await sessionsApi.delete(sessionId);
      dispatch(sessionsActions.removeSession(sessionId));
      if (activeSessionId === sessionId) {
        const remaining = sessions.filter((s) => {
          if (s.id === sessionId) return false;
          if (isInternalSession(s)) return false;
          const filter = variant === "im" ? "im" : sessionFilter;
          return classifySession(s) === filter;
        });
        dispatch(sessionsActions.setActiveSession(remaining.length > 0 ? remaining[0].id : null));
      }
    } catch (e) {
      setSendError(t("chat.failedDelete", { error: String(e) }));
    }
  }, [activeSessionId, sessions, sessionFilter, dispatch, t, variant]);

  const requestDeleteSession = useCallback((e: React.MouseEvent, sessionId: string, title: string) => {
    e.stopPropagation();
    setDeleteTarget({ id: sessionId, title });
  }, []);

  const confirmDeleteSession = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      setDeletingSession(true);
      await handleDeleteSession(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeletingSession(false);
    }
  }, [deleteTarget, handleDeleteSession]);

  const appendAttachment = useCallback((item: PendingAttachmentItem) => {
    setPendingAttachments((prev) => {
      const nextPath = item.attachment.path?.trim().toLowerCase();
      const nextFallback = `${item.attachment.media_type}|${item.attachment.filename ?? ""}|${item.attachment.data?.length ?? 0}`;
      const exists = prev.some((current) => {
        const currentPath = current.attachment.path?.trim().toLowerCase();
        if (nextPath && currentPath) return nextPath === currentPath;
        const currentFallback = `${current.attachment.media_type}|${current.attachment.filename ?? ""}|${current.attachment.data?.length ?? 0}`;
        return nextFallback === currentFallback;
      });
      return exists ? prev : [...prev, item];
    });
  }, []);

  const handleAttach = useCallback(async () => {
    try {
      const selected = await openFileDialog({
        multiple: true,
        filters: [
          { name: t("chat.attachImages"), extensions: ["png", "jpg", "jpeg", "gif", "webp"] },
          { name: t("chat.attachFiles"), extensions: ["pdf", "txt", "md", "csv", "json", "ts", "tsx", "js", "jsx", "py", "rs", "go", "java", "c", "cpp", "h", "yaml", "toml", "xml", "html", "css"] },
          { name: t("chat.attachAll"), extensions: ["*"] },
        ],
      });
      if (!selected) return;

      const paths = Array.isArray(selected) ? selected : [selected];
      for (const filePath of paths) {
        const item = await buildAttachmentFromPath(filePath as string);
        appendAttachment(item);
      }
    } catch (e) {
      console.error("attach error:", e);
    }
  }, [t, appendAttachment]);

  const removeAttachment = useCallback((id: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearPendingComposer = useCallback(() => {
    setPendingAttachments([]);
    setSelectedSkills([]);
  }, []);

  const addSkill = useCallback((skillId: string) => {
    if (skillId === "__install__") {
      onNavigateTab?.("school", { marketLevel: "skills", marketScope: "market" });
      return;
    }
    const skill = installedSkills.find((s) => s.id === skillId);
    if (!skill) return;
    setSelectedSkills((prev) =>
      prev.some((s) => s.id === skill.id) ? prev : [...prev, skill],
    );
  }, [installedSkills, onNavigateTab]);

  const removeSkill = useCallback((skillId: string) => {
    setSelectedSkills((prev) => prev.filter((s) => s.id !== skillId));
  }, []);

  const rememberRecentKoi = useCallback((koiId: string) => {
    setRecentKoiIds((prev) => {
      const next = [koiId, ...prev.filter((id) => id !== koiId)].slice(0, 3);
      localStorage.setItem(RECENT_KOI_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    if (!summonKoiRequest) return;
    if (!summonKoiRequest.koiId) {
      setSelectedKoi(null);
      return;
    }
    const koi = koiList.find((item) => item.id === summonKoiRequest.koiId);
    if (!koi) return;
    setSelectedKoi(koi);
    rememberRecentKoi(koi.id);
  }, [koiList, rememberRecentKoi, summonKoiRequest]);

  useEffect(() => {
    if (activeKoiId === undefined) return;
    if (!activeKoiId) {
      setSelectedKoi(null);
      return;
    }
    if (selectedKoi?.id === activeKoiId) return;
    const koi = koiList.find((item) => item.id === activeKoiId);
    if (!koi) return;
    setSelectedKoi(koi);
    rememberRecentKoi(koi.id);
  }, [activeKoiId, koiList, rememberRecentKoi, selectedKoi?.id]);

  const selectKoi = useCallback((koiId: string) => {
    if (koiId === "__summon__") {
      setComposerMenuOpen(null);
      onNavigateTab?.("school", { marketLevel: "experts", marketScope: "installed", schoolSubTab: "koi" });
      return;
    }
    if (!koiId) {
      setSelectedKoi(null);
      onActiveKoiChange?.(null);
      return;
    }
    const koi = koiList.find((k) => k.id === koiId) ?? null;
    setSelectedKoi(koi);
    onActiveKoiChange?.(koi?.id ?? null);
    if (koi) rememberRecentKoi(koi.id);
  }, [koiList, onActiveKoiChange, onNavigateTab, rememberRecentKoi]);

  const koiMenuItems = useMemo((): ComposerMenuItem[] => {
    const rows: ComposerMenuItem[] = [
      {
        id: "",
        label: t("chat.koiDefaultOption"),
        icon: "🐟",
        selected: !selectedKoi,
      },
      { id: "__summon__", label: t("chat.summonExperts", { defaultValue: "\u53ec\u5524\u4e13\u5bb6" }), action: true },
    ];

    const recentKois = recentKoiIds
      .map((id) => koiList.find((koi) => koi.id === id))
      .filter((koi): koi is KoiWithStats => Boolean(koi))
      .slice(0, 3);

    if (recentKois.length === 0) {
      return rows;
    }

    const grouped = new Map<string, typeof koiList>();
    for (const koi of recentKois) {
      const group = normalizeExpertGroupLabel(koi.role);
      grouped.set(group, [...(grouped.get(group) ?? []), koi]);
    }

    const sortedGroups = Array.from(grouped.entries()).sort(([a], [b]) => compareExpertGroupLabels(a, b));
    for (const [group, groupKois] of sortedGroups) {
      rows.push({ id: `__section__${group}`, label: group, section: true });
      for (const k of [...groupKois].sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"))) {
        rows.push({
          id: k.id,
          label: k.name,
          searchText: `${k.role} ${k.description}`,
          icon: k.icon,
          selected: selectedKoi?.id === k.id,
        });
      }
    }
    return rows;
  }, [koiList, recentKoiIds, selectedKoi, t]);

  const skillMenuItems = useMemo((): ComposerMenuItem[] => {
    const selectedIds = new Set(selectedSkills.map((s) => s.id));
    const visibleSkills = skillMenuMode === "compact" ? primaryOfficeSkills : installedSkills;
    const rows: ComposerMenuItem[] = [
      { id: "__install__", label: t("chat.installSkill"), icon: "➕", action: true },
    ];
    if (skillMenuMode === "compact") {
      rows.push({ id: "__section__office", label: t("chat.basicOfficeSkills"), section: true });
    } else {
      rows.push({ id: "__section__installed", label: t("chat.installedSkills"), section: true });
    }
    for (const s of visibleSkills) {
      rows.push({
        id: s.id,
        label: s.name,
        searchText: s.description,
        icon: s.icon || "⚡",
        selected: selectedIds.has(s.id),
      });
    }
    return rows;
  }, [installedSkills, primaryOfficeSkills, selectedSkills, skillMenuMode, t]);

  const handleSkillMenuSelect = useCallback((skillId: string) => {
    if (skillId === "__install__") {
      setComposerMenuOpen(null);
      onNavigateTab?.("school", { marketLevel: "skills", marketScope: "market" });
      return;
    }
    addSkill(skillId);
  }, [addSkill, onNavigateTab]);

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageItems: DataTransferItem[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        imageItems.push(items[i]);
      }
    }
    if (imageItems.length === 0) return;
    e.preventDefault();
    try {
      for (const item of imageItems) {
        const blob = item.getAsFile();
        if (!blob) continue;
        const ext = blob.type.split("/")[1]?.split("+")[0] || "png";
        const pending = await buildAttachmentFromBlob(blob, `paste-${Date.now()}.${ext}`);
        appendAttachment(pending);
      }
    } catch (err) {
      console.error("paste image error:", err);
    }
  }, [appendAttachment]);

  // ── Workspace selector ──────────────────────────────────────────────────
  // The effective workspace for the active session:
  //   session.workspace_root > settings.workspace_root > ""
  const effectiveWorkspace = displaySession?.workspace_root || settings?.workspace_root || "";
  const displayedWorkspace = workspaceDisplayOverride ?? effectiveWorkspace;
  const hasSessionWorkspace = workspaceDisplayOverride !== null || Boolean(displaySession?.workspace_root);
  const globalWorkspace = settings?.workspace_root || "";

  const handleWorkspaceBrowse = useCallback(async () => {
    if (!displaySessionId) return;
    try {
    const selected = await openFileDialog({ directory: true, title: t("chat.workspaceBrowseTitle") });
      if (!selected) return;
      const dirPath = selected as string;
    setWorkspaceDisplayOverride(dirPath);

      // Check if the selected dir is outside the global workspace
      const isOutside = globalWorkspace && !dirPath.startsWith(globalWorkspace);

      // Set the session workspace override
      await sessionsApi.setWorkspace(displaySessionId, dirPath);

      // Auto-enable allow_outside_workspace on this task if needed
      if (isOutside) {
        const globalAllow = settings?.allow_outside_workspace ?? false;
        const sessionAllow = displaySession?.allow_outside_workspace;
        const effectiveAllow = sessionAllow ?? globalAllow;
        if (!effectiveAllow) {
          await sessionsApi.setAllowOutsideWorkspace(displaySessionId, true);
          dispatch(sessionsActions.updateSessionAllowOutside({
            id: displaySessionId,
            allow_outside_workspace: true,
          }));
          setInfoNotice(t("chat.workspaceOutsideAutoEnabled"));
          setTimeout(() => setInfoNotice(null), 5000);
        }
      }

      // Refresh the session in local state so the dropdown updates
      dispatch(sessionsActions.updateSessionWorkspace({
        id: displaySessionId,
        workspace_root: dirPath,
      }));
    } catch (e) {
      setWorkspaceDisplayOverride(null);
      console.error("workspace browse error:", e);
    }
  }, [displaySessionId, globalWorkspace, settings, displaySession?.allow_outside_workspace, dispatch, t]);

  const handleWorkspaceReset = useCallback(async () => {
    if (!displaySessionId) return;
    try {
      setWorkspaceDisplayOverride(null);
      await sessionsApi.setWorkspace(displaySessionId, null);
      dispatch(sessionsActions.updateSessionWorkspace({
        id: displaySessionId,
        workspace_root: null,
      }));
    } catch (e) {
      console.error("workspace reset error:", e);
    }
  }, [displaySessionId, dispatch]);

  const workspaceTriggerLabel = useMemo(() => {
    const path = displayedWorkspace || t("chat.workspaceLabel");
    if (path.length <= 40) return path;
    const parts = path.split(/[/\\]/).filter(Boolean);
    if (parts.length >= 2) return `…/${parts.slice(-2).join("/")}`;
    return `…${path.slice(-38)}`;
  }, [displayedWorkspace, t]);

  const workspaceMenuItems = useMemo((): ComposerMenuItem[] => {
    const rows: ComposerMenuItem[] = [
      {
        id: "__current__",
        label: displayedWorkspace || t("chat.workspaceNotSet"),
        icon: "📁",
        selected: Boolean(displayedWorkspace),
        disabled: true,
      },
      { id: "__browse__", label: t("chat.workspaceBrowse"), icon: "📂", action: true },
    ];
    if (hasSessionWorkspace) {
      rows.push({ id: "__reset__", label: t("chat.workspaceReset"), icon: "↩", action: true });
    }
    return rows;
  }, [displayedWorkspace, hasSessionWorkspace, t]);

  const handleWorkspaceMenuSelect = useCallback(async (id: string) => {
    setComposerMenuOpen(null);
    if (id === "__browse__") await handleWorkspaceBrowse();
    else if (id === "__reset__") await handleWorkspaceReset();
  }, [handleWorkspaceBrowse, handleWorkspaceReset]);

  // ── File drag-and-drop (Tauri v2 events) ─────────────────────────────────
  // Tauri v2 intercepts native drag-and-drop and emits its own events.
  // We listen to tauri://drag-enter / drag-leave / drag-drop instead of
  // HTML5 onDragOver/onDragLeave/onDrop, because only Tauri events provide
  // the full file paths via payload.paths.
  const [isDragging, setIsDragging] = useState(false);

  const processDroppedFile = useCallback(async (filePath: string) => {
    const filename = filePath.split(/[\\/]/).pop() ?? filePath;
    if (isImageFilename(filename)) {
      try {
        const item = await buildAttachmentFromPath(filePath);
        appendAttachment(item);
      } catch (e) {
        console.error("drop image read error:", e);
        appendAttachment({
          id: `att_${Date.now()}`,
          attachment: { media_type: "application/octet-stream", path: filePath, filename },
        });
      }
    } else {
      try {
        const item = await buildAttachmentFromPath(filePath);
        appendAttachment(item);
      } catch {
        setInput((prev) => {
          const sep = prev.trim() ? "\n" : "";
          return prev + sep + filePath;
        });
      }
    }
  }, [appendAttachment]);

  // Refs to access latest state inside Tauri event listeners without re-registering
  const activeSessionIdRef2 = useRef(displaySessionId);
  useEffect(() => { activeSessionIdRef2.current = displaySessionId; }, [displaySessionId]);
  const isImSessionRef2 = useRef(isImSession);
  useEffect(() => { isImSessionRef2.current = isImSession; }, [isImSession]);
  const runningRef2 = useRef(running);
  useEffect(() => { runningRef2.current = running; }, [running]);

  useEffect(() => {
    let unlistenEnter: UnlistenFn | null = null;
    let unlistenLeave: UnlistenFn | null = null;
    let unlistenDrop: UnlistenFn | null = null;

    const setup = async () => {
      unlistenEnter = await listen<{ paths: string[] }>("tauri://drag-enter", () => {
        if (activeSessionIdRef2.current && !isImSessionRef2.current && !runningRef2.current) {
          setIsDragging(true);
        }
      });

      unlistenLeave = await listen("tauri://drag-leave", () => {
        setIsDragging(false);
      });

      unlistenDrop = await listen<{ paths: string[] }>("tauri://drag-drop", async (e) => {
        setIsDragging(false);
        // Only allow drop in chat sessions (not IM, not empty state)
        if (!activeSessionIdRef2.current || isImSessionRef2.current || runningRef2.current) return;

        const paths = e.payload.paths;
        if (!paths || paths.length === 0) return;

        for (const filePath of paths) {
          await processDroppedFile(filePath);
        }
      });
    };

    setup();
    return () => {
      unlistenEnter?.();
      unlistenLeave?.();
      unlistenDrop?.();
    };
  }, [processDroppedFile]);

  // Core send logic, called after plan-resume decision is made.
  // clearPlan=true: clear existing plan before this turn (default / new task)
  // clearPlan=false: keep existing plan (user chose to continue previous tasks)
  const doSend = useCallback(async (
    content: string,
    attachments: PendingAttachmentItem[],
    skills: Skill[],
    koi: KoiWithStats | null,
    clearPlan: boolean,
  ) => {
    if (!displaySessionId) return;

    if (content.trim()) {
      pushInputHistory(`chat:${displaySessionId}`, content);
    }

    dispatch(chatActions.clearToolSteps(displaySessionId));
    if (clearPlan) dispatch(chatActions.clearPlan(displaySessionId));
    dispatch(chatActions.clearStreaming(displaySessionId));
    setReviewBySession((all) => {
      if (!all[displaySessionId]) return all;
      const next = { ...all };
      delete next[displaySessionId];
      return next;
    });
    dispatch(chatActions.clearFrozenBubble(displaySessionId));

    const currentMessages = messagesBySession[displaySessionId] ?? [];
    if (currentMessages.length === 0) {
      const raw = (
        content ||
        attachments[0]?.attachment.filename ||
        skills[0]?.name ||
        koi?.name ||
        ""
      ).replace(/\s+/g, " ").trim();
      const title = raw.length > 30 ? raw.slice(0, 30) + "…" : raw;
      if (title) {
        sessionsApi.rename(displaySessionId, title).catch(() => {});
        dispatch(sessionsActions.updateSessionTitle({ id: displaySessionId, title }));
      }
    }

    const hints: string[] = [];
    if (koi) hints.push(`${koi.icon} ${koi.name}`);
    for (const s of skills) hints.push(`${s.icon || "⚡"} ${s.name}`);
    for (const a of attachments) {
      hints.push(`📎 ${a.attachment.filename ?? a.attachment.path ?? t("chat.attachment")}`);
    }
    const displayContent = hints.length
      ? content
        ? `${content}\n${hints.join("\n")}`
        : hints.join("\n")
      : content;

    dispatch(chatActions.appendMessage({
      sessionId: displaySessionId,
      message: {
        id: `optimistic_${Date.now()}`,
        session_id: displaySessionId,
        role: "user",
        content: displayContent,
        created_at: new Date().toISOString(),
      },
    }));

    dispatch(sessionsActions.touchSessionActivity({ id: displaySessionId }));
    dispatch(chatActions.setRunning({ sessionId: displaySessionId, running: true }));

    try {
      await chatApi.send(displaySessionId, content, {
        attachments: attachments.map((a) => a.attachment),
        explicitSkills: skills.map((s) => s.id),
        personaKoiId: koi?.id,
        clearPlan,
        mode: composerModeRef.current,
        scene: chatSceneRef.current,
        modelProviderId: selectedModelProviderIdRef.current || undefined,
      });
    } catch (e) {
      console.error('[Chat] send error:', e);
      dispatch(chatActions.setRunning({ sessionId: displaySessionId, running: false }));
      dispatch(chatActions.clearStreaming(displaySessionId));
      setSendError(`${e}`);
    }
  }, [displaySessionId, messagesBySession, dispatch, t]);

  const canSend = Boolean(
    input.trim() ||
    pendingAttachments.length ||
    selectedSkills.length ||
    selectedKoi,
  );

  const handleSend = useCallback(async () => {
    if (!canSend || !displaySessionId || running) return;

    const content = input.trim();
    setInput("");
    setSendError(null);
    const pending = pendingAttachments;
    const skills = selectedSkills;
    const koi = selectedKoi;
    clearPendingComposer();

    const unfinished = activePlan.filter(
      (item) => item.status === "pending" || item.status === "in_progress"
    );
    if (unfinished.length > 0) {
      setPlanResumeDialog({
        pendingContent: content,
        pendingAttachments: pending,
        pendingSkills: skills,
        pendingKoi: koi,
      });
      return;
    }

    await doSend(content, pending, skills, koi, true);
  }, [canSend, input, pendingAttachments, selectedSkills, selectedKoi, displaySessionId, running, activePlan, doSend, clearPendingComposer]);

  useEffect(() => {
    const draft = pendingAutoSendRef.current;
    if (!draft || !displaySessionId || running) return;
    pendingAutoSendRef.current = null;
    setInput("");
    void doSend(draft, [], [], null, true);
  }, [displaySessionId, running, doSend]);

  const handleCancel = useCallback(() => {
    if (displaySessionId) {
      chatApi.cancel(displaySessionId);
    }
  }, [displaySessionId]);

  const reviewChanges = displaySessionId ? reviewBySession[displaySessionId] ?? [] : [];

  const dismissReview = useCallback((sessionId: string) => {
    setReviewBySession((all) => {
      if (!all[sessionId]) return all;
      const next = { ...all };
      delete next[sessionId];
      return next;
    });
  }, []);

  const handleUndoReview = useCallback(async () => {
    if (!displaySessionId || undoingReview) return;
    setUndoingReview(true);
    try {
      await journalApi.undoLast(displaySessionId);
      dismissReview(displaySessionId);
    } catch (e) {
      setSendError(`${t("chat.reviewUndoFailed")}: ${e}`);
    } finally {
      setUndoingReview(false);
    }
  }, [displaySessionId, undoingReview, dismissReview, t]);

  const handleKeepReview = useCallback(() => {
    if (displaySessionId) dismissReview(displaySessionId);
  }, [displaySessionId, dismissReview]);

  const handlePermissionResponse = useCallback(async (approved: boolean) => {
    if (!permissionRequest) return;
    try {
      await invoke("respond_permission", {
        requestId: permissionRequest.requestId,
        approved,
      });
    } catch (e) {
      setSendError(`Permission response failed: ${e}`);
    }
    setPermissionRequest(null);
  }, [permissionRequest]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      e.key === "/"
      && !e.ctrlKey
      && !e.metaKey
      && !e.altKey
      && !e.shiftKey
      && !running
      && !isTeamBoundSession
      && !(e.nativeEvent as KeyboardEvent).isComposing
    ) {
      const target = e.currentTarget;
      const start = target.selectionStart ?? input.length;
      const end = target.selectionEnd ?? input.length;
      const before = input.slice(0, start);
      if (start === end && (before.length === 0 || /\s$/.test(before))) {
        e.preventDefault();
        setSkillMenuMode("all");
        setComposerMenuOpen("skill");
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (chatInputHistoryScope) resetInputHistoryNav(chatInputHistoryScope);
      handleSend();
      return;
    }

    if (chatInputHistoryScope && handleInputHistoryKeyDown(e, chatInputHistoryScope, setInput)) {
      return;
    }
  };

  const handleArtifactPreview = useCallback((artifact: SessionArtifact) => {
    setPreviewArtifact(artifact);
    setRightPanelOpen(true);
  }, []);

  useEffect(() => {
    setSessionFilter(variant === "im" ? "im" : "chat");
    setOpenPicker(null);
    setTopbarPanel(null);
    setRightPanelOpen(false);
  }, [variant]);

  // ── Filtered session list (single source of truth) ───────────────────────
  const sessionsForKind = (kind: SessionKind) =>
    sessions.filter((s) => isMainChatVisibleSession(s, kind));
  const kindLabel = (kind: SessionKind) =>
    kind === "chat" ? t("chat.filterChat") : kind === "im" ? t("chat.filterIM") : t("chat.filterCli");

  // IM channel quick-connect controls, surfaced in the IM dropdown footer.
  const imConnectFooter = (
    <div className="session-picker-im-connect">
      {gatewayChannels.length > 0 && (
        <div className="session-picker-im-channels">
          {gatewayChannels.map((ch) => (
            <div key={ch.name} className="session-picker-im-channel">
              <span className="session-picker-im-channel-name">{ch.name}</span>
              <span
                className="session-picker-im-channel-dot"
                style={{
                  color:
                    ch.status === "Connected"
                      ? "#28a745"
                      : ch.status === "Connecting"
                        ? "#ffc107"
                        : "var(--text-muted)",
                }}
              >
                {ch.status === "Connected" ? "●" : ch.status === "Connecting" ? "◌" : "○"}
              </span>
            </div>
          ))}
        </div>
      )}
      {(() => {
        const hasConnected = gatewayChannels.some(
          (ch) => ch.status === "Connected" || ch.status === "Connecting",
        );
        return (
          <div className="session-picker-im-actions">
            <button
              className="btn btn-primary"
              onClick={handleGatewayConnect}
              disabled={gatewayConnecting || gatewayDisconnecting}
            >
              {gatewayConnecting
                ? t("common.connecting")
                : hasConnected
                  ? t("settings.reconnectChannels")
                  : t("settings.connectChannels")}
            </button>
            <button
              className="btn"
              onClick={handleGatewayDisconnect}
              disabled={gatewayDisconnecting || gatewayConnecting || !hasConnected}
            >
              {gatewayDisconnecting ? t("common.disconnecting") : t("settings.disconnectAll")}
            </button>
            {onOpenSettings && (
              <button
                type="button"
                className="btn"
                onClick={() => onOpenSettings("channels")}
              >
                {t("settingsHub.configureChannels")} →
              </button>
            )}
          </div>
        );
      })()}
    </div>
  );

  return (
    <div className={`chat-layout${rightPanelOpen ? " has-right-panel" : ""}`}>
      {/* Main chat area */}
      <div className="chat-main">
        {/* Top bar: session-kind dropdown buttons (left) + task tabs (right) */}
        <div className="chat-topbar">
          {variant === "im" && (
            <div className="chat-topbar-sessions">
              <div className="chat-session-trigger-wrap">
                <button
                  className={`chat-session-trigger ${sessionFilter === "im" ? "active" : ""}`}
                  onClick={() => {
                    setSessionFilter("im");
                    setOpenPicker((p) => (p === "im" ? null : "im"));
                  }}
                  aria-expanded={openPicker === "im"}
                >
                  <span className="chat-session-trigger-label">{kindLabel("im")}</span>
                  <span className="chat-session-trigger-count">{sessionsForKind("im").length}</span>
                  <span className="chat-session-trigger-caret">{openPicker === "im" ? "▴" : "▾"}</span>
                </button>
                {openPicker === "im" && (
                  <SessionPicker
                    sessions={sessionsForKind("im")}
                    activeSessionId={displaySessionId}
                    onSelect={(id) => {
                      dispatch(sessionsActions.setActiveSession(id));
                      setOpenPicker(null);
                    }}
                    onDelete={requestDeleteSession}
                    onNew={variant === "im" ? undefined : () => {
                      handleNewSession();
                      setOpenPicker(null);
                    }}
                    allowCreate={variant !== "im"}
                    onClose={() => setOpenPicker(null)}
                    t={t}
                    footer={imConnectFooter}
                  />
                )}
              </div>
            </div>
          )}

          {isTeamBoundSession && variant !== "im" && (
            <div className="chat-topbar-team-tabs" role="tablist" aria-label={t("chat.teamViewTabs")}>
              <button
                type="button"
                className={`chat-topbar-team-tab${chatViewTab === "main" ? " active" : ""}`}
                role="tab"
                aria-selected={chatViewTab === "main"}
                onClick={() => setChatViewTab("main")}
              >
                {t("chat.tabMain")}
              </button>
              <button
                type="button"
                className={`chat-topbar-team-tab${chatViewTab === "collab" ? " active" : ""}`}
                role="tab"
                aria-selected={chatViewTab === "collab"}
                onClick={() => setChatViewTab("collab")}
              >
                {t("chat.tabCollab")}
              </button>
            </div>
          )}

          {hasTaskPanel && variant !== "im" && chatViewTab === "main" && (
            <div className="chat-topbar-tasks" role="tablist" aria-label="Task panel tabs">
              <button
                className={`chat-topbar-task-tab ${taskPanelTab === "todo" && taskPanelOpen ? "active" : ""}`}
                onClick={() => selectTaskTab("todo")}
                disabled={activePlan.length === 0}
                role="tab"
                aria-selected={taskPanelTab === "todo"}
              >
                Todo
                {activePlan.length > 0 && <span className="chat-topbar-task-count">{activePlan.length}</span>}
              </button>
              <button
                className={`chat-topbar-task-tab ${taskPanelTab === "tools" && taskPanelOpen ? "active" : ""}`}
                onClick={() => selectTaskTab("tools")}
                disabled={steps.length === 0}
                role="tab"
                aria-selected={taskPanelTab === "tools"}
              >
                Tools
                {steps.length > 0 && <span className="chat-topbar-task-count">{steps.length}</span>}
              </button>
              <button
                className={`chat-topbar-task-tab ${taskPanelTab === "artifacts" && taskPanelOpen ? "active" : ""}`}
                onClick={() => selectTaskTab("artifacts")}
                disabled={activeArtifacts.length === 0}
                role="tab"
                aria-selected={taskPanelTab === "artifacts"}
              >
                Artifacts
                {activeArtifacts.length > 0 && <span className="chat-topbar-task-count">{activeArtifacts.length}</span>}
              </button>
            </div>
          )}

          {displaySessionId && !isImSession && (
            <div className="chat-topbar-actions">
              <button
                type="button"
                className={`btn-icon ${topbarPanel === "search" ? "active" : ""}`}
                title={t("chat.searchInConversation")}
                onClick={() => { setTopbarPanel((p) => (p === "search" ? null : "search")); setConvSearch(""); }}
              >
                <Search size={16} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                className={`btn-icon ${topbarPanel === "history" ? "active" : ""}`}
                title={t("chat.history")}
                onClick={() => setTopbarPanel((p) => (p === "history" ? null : "history"))}
              >
                <History size={16} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                className="btn-icon"
                title={t("chat.share")}
                onClick={async () => {
                  const md = activeMessages
                    .map((m) => `**${m.role === "user" ? t("chat.you") : t("chat.piscis")}**:\n\n${m.content}`)
                    .join("\n\n---\n\n");
                  try {
                    await navigator.clipboard.writeText(md);
                    setShareNote(t("chat.shareCopied"));
                  } catch {
                    setShareNote(t("chat.shareFailed"));
                  }
                  setTimeout(() => setShareNote(""), 2200);
                }}
              >
                <Share2 size={16} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                className={`btn-icon ${rightPanelOpen ? "active" : ""}`}
                title={t("preview.preview")}
                onClick={() => setRightPanelOpen((open) => !open)}
              >
                <PanelRight size={16} strokeWidth={1.5} />
              </button>
              {shareNote && <span className="chat-topbar-toast">{shareNote}</span>}
              {topbarPanel && (
                <div className="chat-topbar-panel">
                  {topbarPanel === "search" && (
                    <div className="chat-topbar-panel-head">
                      <RoundedSearch
                        value={convSearch}
                        onChange={setConvSearch}
                        placeholder={t("chat.searchInConversation")}
                        size="sm"
                        autoFocus
                      />
                    </div>
                  )}
                  <div className="chat-topbar-results">
                    {(() => {
                      const q = convSearch.trim().toLowerCase();
                      const list = (topbarPanel === "history"
                        ? activeMessages.filter((m) => m.role === "user")
                        : q
                          ? activeMessages.filter((m) => (m.content || "").toLowerCase().includes(q))
                          : activeMessages.filter((m) => m.role === "user")
                      );
                      if (list.length === 0) {
                        return <div className="chat-topbar-empty">{t("ide.noResults")}</div>;
                      }
                      return list
                        .slice()
                        .reverse()
                        .map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className={`chat-topbar-result chat-topbar-result-${m.role}`}
                            onClick={() => {
                              const el = document.getElementById(`chatmsg-${m.id}`);
                              if (el) {
                                el.scrollIntoView({ behavior: "smooth", block: "center" });
                                el.classList.add("message-flash");
                                setTimeout(() => el.classList.remove("message-flash"), 1600);
                              }
                              setTopbarPanel(null);
                            }}
                          >
                            <span className="chat-topbar-result-role">
                              {m.role === "user" ? t("chat.you") : t("chat.piscis")}
                            </span>
                            <span className="chat-topbar-result-text">
                              {(m.content || "").replace(/\s+/g, " ").trim().slice(0, 80) || "—"}
                            </span>
                          </button>
                        ));
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {isDragging && !isImSession && (
          <div className="drag-overlay">
            <div className="drag-overlay-text">📎 {t("chat.dropFiles")}</div>
          </div>
        )}
        {displaySessionId ? (
          <>
            {chatViewTab === "collab" && isTeamBoundSession && boundPoolSessionId ? (
              <div className="chat-team-collab-host">
                <TeamCollabPanel
                  poolSessionId={boundPoolSessionId}
                  visible
                  onNavigateToSchoolKoi={() => onNavigateTab?.("school")}
                />
              </div>
            ) : (
          <>
            {sendError && (
              <div className="error-banner" role="alert">
                <span>{sendError}</span>
                <button className="error-dismiss" onClick={() => setSendError(null)}>✕</button>
              </div>
            )}
            {infoNotice && (
              <div className="info-banner" role="status">
                <span>{infoNotice}</span>
                <button className="info-dismiss" onClick={() => setInfoNotice(null)}>✕</button>
              </div>
            )}

            {hasTaskPanel && taskPanelOpen && (
              <div className="session-task-panel">
                <div className="session-task-panel-content">
                      {taskPanelTab === "todo" && activePlan.length > 0 && (
                        <div className="tool-steps-scroll">
                          <PlanPanel items={activePlan} />
                        </div>
                      )}
                      {taskPanelTab === "tools" && steps.length > 0 && (
                        <div className="tool-steps-scroll" ref={toolStepsScrollRef}>
                          {steps.map((step) => (
                            <ToolStepCard
                              key={step.id}
                              step={step}
                              onToggle={() => {
                                dispatch(chatActions.toggleToolStep({ sessionId: displaySessionId!, id: step.id }));
                                if (!step.expanded) {
                                  requestAnimationFrame(() => {
                                    const el = toolStepsScrollRef.current;
                                    if (el) {
                                      const cards = el.querySelectorAll<HTMLElement>(".tool-step-card");
                                      const idx = steps.findIndex((s) => s.id === step.id);
                                      if (idx >= 0 && cards[idx]) {
                                        cards[idx].scrollIntoView({ block: "nearest", behavior: "smooth" });
                                      }
                                    }
                                  });
                                }
                              }}
                            />
                          ))}
                        </div>
                      )}
                      {taskPanelTab === "artifacts" && activeArtifacts.length > 0 && (
                        <div className="tool-steps-scroll">
                          <ArtifactsPanel artifacts={activeArtifacts} onPreview={handleArtifactPreview} />
                        </div>
                      )}
                </div>
              </div>
            )}

            <div className="messages-area" ref={messagesAreaRef}>
              {hasMoreHistory && (
                <button
                  type="button"
                  className="chat-load-more-history"
                  disabled={loadingMoreHistory}
                  onClick={() => loadMoreHistory()}
                >
                  {loadingMoreHistory ? t("common.loading") : t("chat.loadMoreHistory")}
                </button>
              )}
              {activeMessages.map((msg) => {
                // Render historical chat_ui tool calls as interactive cards
                if (chatUiToolCallIds.has(msg.id)) {
                  const cards = Object.values(historicalCards).filter((c) => c.afterMessageId === msg.id);
                  if (cards.length > 0) {
                    return cards.map((card) => (
                      <div key={card.requestId} className="message message-assistant">
                        <div className="message-role">{t("chat.piscis")}</div>
                        <div className="message-content">
                          {msg.content.trim() && <MessageContent content={msg.content} />}
                          <InteractiveCard
                            requestId={card.requestId}
                            uiDefinition={card.uiDefinition}
                            submittedValues={card.submittedValues}
                            onSubmitted={
                              displaySessionId
                                ? () => markInteractiveSubmitted(displaySessionId, card.requestId)
                                : undefined
                            }
                          />
                        </div>
                      </div>
                    ));
                  }
                }
                return (
                  <div key={msg.id} id={`chatmsg-${msg.id}`} className={`message message-${msg.role}`}>
                    <div className="message-role">
                      {msg.role === "user" ? t("chat.you") : t("chat.piscis")}
                    </div>
                    <div className="message-content">
                      <MessageContent content={msg.content} />
                    </div>
                  </div>
                );
              })}

              {/* Single streaming bubble — shows thinking dots until first text arrives,
                  then displays the latest streamed text. Disappears when running stops.
                  Hidden for IM sessions (headless agent, no real-time text stream). */}
              {running && !isImSession && (
                <div className="message message-assistant streaming-bubble">
                  <div className="message-role">{t("chat.piscis")}</div>
                  <div className="message-content">
                    {streamingCurrent ? (
                      <>
                        <MessageContent content={streamingCurrent} />
                        <span className="cursor-blink">▋</span>
                      </>
                    ) : (
                      <span className="thinking-dots">
                        <span /><span /><span />
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Interactive UI cards from chat_ui tool — rendered AFTER the streaming bubble
                  so they appear at the bottom of the conversation, always visible to the user.
                  The agent pauses streaming while waiting for user input, so the streaming
                  bubble is empty/hidden at this point anyway. */}
              {pendingLiveCards.map((card) => (
                <div key={card.requestId} className="message message-assistant">
                  <div className="message-role">{t("chat.piscis")}</div>
                  <div className="message-content">
                    <InteractiveCard
                      requestId={card.requestId}
                      uiDefinition={card.uiDefinition}
                      submittedValues={null}
                      listenOpen={card.listenOpen}
                      wizardStepHint={card.wizardStepHint}
                      onSubmitted={
                        displaySessionId
                          ? () => markInteractiveSubmitted(displaySessionId, card.requestId)
                          : undefined
                      }
                      onActionSent={
                        displaySessionId
                          ? () => {
                              setInteractiveCardsBySession((all) => {
                                const sessionCards = all[displaySessionId];
                                const c = sessionCards?.[card.requestId];
                                if (!c) return all;
                                return {
                                  ...all,
                                  [displaySessionId]: {
                                    ...sessionCards,
                                    [card.requestId]: { ...c, listenOpen: false },
                                  },
                                };
                              });
                            }
                          : undefined
                      }
                    />
                  </div>
                </div>
              ))}

              {activeMessages.length === 0 &&
                !running &&
                !loadingMoreHistory &&
                pendingLiveCards.length === 0 && (
                  <div className="chat-messages-empty">
                    <div className="chat-empty-start">
                      <img src="/chat-empty-hero.png" alt="" className="chat-empty-hero" aria-hidden="true" />
                      <div className="chat-empty-scenes" role="tablist" aria-label="Chat scene">
                        {CHAT_SCENES.map((scene) => (
                          <button
                            key={scene.id}
                            type="button"
                            role="tab"
                            aria-selected={chatScene === scene.id}
                            className={`chat-empty-scene${chatScene === scene.id ? " active" : ""}`}
                            title={scene.title}
                            onClick={() => setChatScene(scene.id)}
                          >
                            <span className="chat-empty-scene-icon" aria-hidden>{scene.icon}</span>
                            <span>{scene.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

              <div ref={messagesEndRef} />
            </div>

            {unreadCount > 0 && (
              <button
                className="chat-unread-badge"
                onClick={() => {
                  messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
                  setUnreadCount(0);
                }}
              >
                ↓ {t("chat.unreadMessages", { count: unreadCount })}
              </button>
            )}

            {isImSession && (
              <div style={{ padding: "8px 16px", fontSize: 12, color: "var(--text-muted)", borderTop: "1px solid var(--border)", textAlign: "center" }}>
                {t("chat.imSessionHint")}
              </div>
            )}

            {!isImSession && reviewChanges.length > 0 && (
              <div className="review-bar">
                <div className="review-head">
                  <span className="review-title">
                    {t("chat.reviewChanges", { count: reviewChanges.length })}
                  </span>
                  <div className="review-actions">
                    <button
                      className="review-btn danger"
                      onClick={handleUndoReview}
                      disabled={undoingReview}
                    >
                      {undoingReview ? t("chat.reviewUndoing") : `↩ ${t("chat.reviewUndoAll")}`}
                    </button>
                    <button
                      className="review-btn"
                      onClick={handleKeepReview}
                      disabled={undoingReview}
                    >
                      ✓ {t("chat.reviewKeep")}
                    </button>
                  </div>
                </div>
                <ul className="review-files">
                  {reviewChanges.map((c) => (
                    <li key={c.id} className="review-file" title={c.rel_path}>
                      <span className={`review-tag ${c.existed ? "edit" : "new"}`}>
                        {c.existed ? t("chat.reviewEdit") : t("chat.reviewNew")}
                      </span>
                      <span className="review-path">{c.rel_path}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {!isImSession && <div
              className={`input-area${isDragging ? " drag-over" : ""}`}
            >
              {(activeMessages.length > 0 || running || pendingLiveCards.length > 0) && (
              <div className="chat-scene-tabs" role="tablist" aria-label="Chat scene">
                {CHAT_SCENES.map((scene) => (
                  <button
                    key={scene.id}
                    type="button"
                    role="tab"
                    aria-selected={chatScene === scene.id}
                    className={`chat-scene-tab${chatScene === scene.id ? " active" : ""}`}
                    title={scene.title}
                    onClick={() => setChatScene(scene.id)}
                    disabled={running}
                  >
                    <span className="chat-scene-icon" aria-hidden>{scene.icon}</span>
                    <span>{scene.label}</span>
                  </button>
                ))}
              </div>
              )}
              {(selectedKoi || selectedSkills.length > 0 || pendingAttachments.length > 0) && (
                <div className="pending-composer-strip">
                  {selectedKoi && (
                    <div className="pending-chip pending-chip-koi" title={t("chat.personaKoi")}>
                      <span className="pending-chip-icon">{selectedKoi.icon}</span>
                      <span className="pending-chip-name">{selectedKoi.name}</span>
                      <button
                        type="button"
                        className="pending-chip-remove"
                        onClick={() => {
                          setSelectedKoi(null);
                          onActiveKoiChange?.(null);
                        }}
                        title={t("common.clear")}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  {selectedSkills.map((skill) => (
                    <div key={skill.id} className="pending-chip pending-chip-skill" title={t("chat.selectedSkill")}>
                      <span className="pending-chip-icon">{skill.icon || "⚡"}</span>
                      <span className="pending-chip-name">{skill.name}</span>
                      <button type="button" className="pending-chip-remove" onClick={() => removeSkill(skill.id)} title={t("common.clear")}>✕</button>
                    </div>
                  ))}
                  {pendingAttachments.map((item) => (
                    <div key={item.id} className="pending-chip pending-chip-attach">
                      {item.preview ? (
                        <img src={item.preview} className="pending-chip-thumb" alt={item.attachment.filename} />
                      ) : (
                        <span className="pending-chip-icon">📎</span>
                      )}
                      <span className="pending-chip-name" title={item.attachment.path}>
                        {item.attachment.filename ?? item.attachment.path}
                      </span>
                      <button type="button" className="pending-chip-remove" onClick={() => removeAttachment(item.id)} title={t("chat.removeAttachment")}>✕</button>
                    </div>
                  ))}
                </div>
              )}
              <textarea
                ref={textareaRef}
                className="chat-input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                placeholder={t("chat.inputPlaceholder")}
                rows={3}
                disabled={running}
              />
              <div className="input-actions">
                <div className="composer-selectors">
                  <div className="composer-selector mode-selector">
                    {isTeamBoundSession ? (
                      <button
                        type="button"
                        className="select-control composer-mode-locked"
                        disabled
                        title={t("chat.modeTeam")}
                      >
                        <span className="app-dropdown-trigger-icon" aria-hidden>👥</span>
                        <span className="app-dropdown-trigger-label">{t("chat.modeTeam")}</span>
                      </button>
                    ) : (
                      <ComposerDropdown
                        menuId="mode"
                        icon={COMPOSER_MODE_ICON[composerMode]}
                        triggerLabel={
                          composerMode === "craft"
                            ? t("chat.modeCraft")
                            : composerMode === "plan"
                              ? t("chat.modePlan")
                              : t("chat.modeAsk")
                        }
                        triggerTitle={t("chat.modeLabel")}
                        items={[
                          { id: "craft", label: t("chat.modeCraft"), icon: "⚡", selected: composerMode === "craft" },
                          { id: "plan", label: t("chat.modePlan"), icon: "📋", selected: composerMode === "plan" },
                          { id: "ask", label: t("chat.modeAsk"), icon: "💬", selected: composerMode === "ask" },
                          { id: "team", label: t("chat.modeTeam"), icon: "👥" },
                        ]}
                        open={composerMenuOpen === "mode"}
                        onOpenChange={(open) => setComposerMenuOpen(open ? "mode" : null)}
                        onSelect={(id) => {
                          if (id === "team") {
                            setTeamTaskDialogOpen(true);
                            setComposerMenuOpen(null);
                            return;
                          }
                          setComposerMode(id as ComposerMode);
                        }}
                        disabled={running}
                        variant="compact"
                        placement="above"
                      />
                    )}
                  </div>
                  <div className="composer-selector workspace-selector">
                    {isTeamBoundSession ? (
                      <button
                        type="button"
                        className="select-control composer-mode-locked composer-workspace-locked"
                        disabled
                        title={displayedWorkspace || t("chat.workspaceLabel")}
                      >
                        <span className="app-dropdown-trigger-icon" aria-hidden>📁</span>
                        <span className="app-dropdown-trigger-label">{workspaceTriggerLabel}</span>
                      </button>
                    ) : (
                      <ComposerDropdown
                        menuId="workspace"
                        icon="📁"
                        triggerLabel={workspaceTriggerLabel}
                        triggerTitle={displayedWorkspace || t("chat.workspaceLabel")}
                        items={workspaceMenuItems}
                        open={composerMenuOpen === "workspace"}
                        onOpenChange={(open) => setComposerMenuOpen(open ? "workspace" : null)}
                        onSelect={(id) => { void handleWorkspaceMenuSelect(id); }}
                        disabled={running}
                        variant="wide"
                        placement="above"
                      />
                    )}
                  </div>
                  {!isTeamBoundSession && (
                  <>
                  <div className="composer-selector koi-selector">
                    <ComposerDropdown
                      menuId="koi"
                      icon="🐟"
                      triggerLabel={
                        selectedKoi
                          ? `${selectedKoi.icon} ${selectedKoi.name}`
                          : t("chat.koiSelectPlaceholder")
                      }
                      items={koiMenuItems}
                      open={composerMenuOpen === "koi"}
                      onOpenChange={(open) => setComposerMenuOpen(open ? "koi" : null)}
                      onSelect={selectKoi}
                      disabled={running}
                      searchPlaceholder={t("chat.composerSearchKoi")}
                      emptyLabel={t("ide.noResults")}
                      placement="above"
                    />
                  </div>
                  <div className="composer-selector skill-selector">
                    <ComposerDropdown
                      menuId="skill"
                      icon="⚡"
                      triggerLabel={t("chat.skillSelectPlaceholder")}
                      items={skillMenuItems}
                      open={composerMenuOpen === "skill"}
                      onOpenChange={(open) => {
                        if (open) setSkillMenuMode("compact");
                        setComposerMenuOpen(open ? "skill" : null);
                      }}
                      onSelect={handleSkillMenuSelect}
                      disabled={running}
                      searchPlaceholder={t("chat.composerSearchSkill")}
                      emptyLabel={t("ide.noResults")}
                      closeOnSelect={false}
                      placement="above"
                    />
                  </div>
                  <div className="composer-selector model-selector">
                    {(() => {
                      const providers = settings?.llm_providers ?? [];
                      const defaultLabel = settings?.model
                        ? `${t("chat.modelDefault")} · ${settings.model}`
                        : t("chat.modelDefault");
                      const selectedBuiltIn = BUILT_IN_CHAT_MODELS.find((m) => m.id === selectedModelProviderId);
                      const selectedCustom = providers.find((p) => p.id === selectedModelProviderId);
                      const selectedExpandedCustom = selectedModelProviderId.includes("::")
                        ? (() => {
                            const [providerId, modelId] = selectedModelProviderId.split("::");
                            const provider = providers.find((p) => p.id === providerId);
                            return provider && modelId ? { provider, modelId } : null;
                          })()
                        : null;
                      const current = selectedBuiltIn
                        ? selectedBuiltIn.label
                        : selectedCustom
                          ? (selectedCustom.label || selectedCustom.model || selectedCustom.id)
                          : selectedExpandedCustom
                            ? selectedExpandedCustom.modelId
                            : t("chat.modelDefault");
                      const builtInItems: ComposerMenuItem[] = BUILT_IN_CHAT_MODELS.map((m) => {
                        const configured = providerHasApiKey(settings, m.provider);
                        return {
                          id: m.id,
                          label: `${builtInModelLabel(m)}${configured ? "" : "  (未配置)"}`,
                          icon: m.provider.slice(0, 2).toUpperCase(),
                          selected: selectedModelProviderId === m.id,
                          disabled: !configured,
                        };
                      });
                      const customItems: ComposerMenuItem[] = providers.flatMap((p) => {
                        const fetchedModels = providerModelsById[p.id] ?? [];
                        const models = Array.from(new Set([
                          p.model,
                          ...fetchedModels,
                        ].map((model) => model?.trim()).filter(Boolean) as string[]));
                        const sceneModels = models.filter((modelName) => modelAllowedInScene(modelName, chatScene));
                        const chatModels = sceneModels.filter((modelName) => !isCreativeGenerationModel(modelName));
                        const creativeModels = sceneModels.filter((modelName) => isCreativeGenerationModel(modelName));
                        const rows: ComposerMenuItem[] = [];
                        if (sceneModels.length === 0 && models.length > 0) {
                          return rows;
                        }
                        if (sceneModels.length > 1) {
                          rows.push({
                            id: `_provider_header_${p.id}`,
                            label: p.label || p.id,
                            disabled: true,
                          });
                        }
                        if (providerModelLoadErrors[p.id] && models.length <= 1) {
                          rows.push({
                            id: `_provider_error_${p.id}`,
                            label: `${p.label || p.id}  模型列表获取失败，显示已保存模型`,
                            disabled: true,
                          });
                        }
                        rows.push(...chatModels.map((modelName) => {
                          const id = modelName === p.model ? p.id : `${p.id}::${modelName}`;
                          return {
                            id,
                            label: sceneModels.length > 1
                              ? modelName
                              : (p.label ? `${p.label}  ${p.provider}  ${modelName}` : `${p.id}  ${p.provider}  ${modelName}`),
                            icon: "AI",
                            selected: selectedModelProviderId === id,
                          };
                        }));
                        if (creativeModels.length > 0) {
                          rows.push({
                            id: `_provider_image_header_${p.id}`,
                            label: "创意生成模型",
                            disabled: true,
                          });
                          rows.push(...creativeModels.map((modelName) => {
                            const id = modelName === p.model ? p.id : `${p.id}::${modelName}`;
                            return {
                              id,
                              label: modelName,
                              icon: isImageGenerationModel(modelName) ? "IMG" : "VID",
                              selected: selectedModelProviderId === id,
                            };
                          }));
                        }
                        return rows;
                      });
                      const items: ComposerMenuItem[] = [
                        { id: "", label: defaultLabel, icon: "Auto", selected: !selectedModelProviderId },
                        { id: "_model_builtin_header", label: "内置模型", disabled: true },
                        ...builtInItems,
                        { id: "_model_custom_header", label: "自定义模型", disabled: true },
                        ...customItems,
                        { id: "_model_config_divider", label: "", divider: true },
                        { id: "_model_configure", label: "+ 配置自定义模型", action: true },
                      ];
                      return (
                        <ComposerDropdown
                          menuId="model"
                          icon="🧠"
                          triggerLabel={current}
                          triggerTitle={t("chat.modelLabel")}
                          items={items}
                          open={composerMenuOpen === "model"}
                          onOpenChange={(open) => setComposerMenuOpen(open ? "model" : null)}
                          onSelect={(id) => {
                            if (id === "_model_configure") {
                              setComposerMenuOpen(null);
                              onOpenSettings?.("models");
                              return;
                            }
                            setSelectedModelProviderId(id);
                          }}
                          disabled={running}
                          searchPlaceholder={t("chat.modelLabel")}
                          emptyLabel={t("ide.noResults")}
                          placement="above"
                        />
                      );
                    })()}
                  </div>
                  </>
                  )}
                  <div className="composer-selector permission-selector">
                    {(() => {
                      const globalPolicy = settings?.policy_mode || "balanced";
                      const effectivePolicy = displaySession?.policy_mode || globalPolicy;
                      const globalAllowOutside = settings?.allow_outside_workspace ?? false;
                      const effectiveAllowOutside =
                        displaySession?.allow_outside_workspace ?? globalAllowOutside;
                      const policyMeta: Record<string, { icon: string; label: string }> = {
                        strict: { icon: "🔒", label: t("chat.permStrict") },
                        balanced: { icon: "⚖️", label: t("chat.permBalanced") },
                        dev: { icon: "🔓", label: t("chat.permDev") },
                      };
                      const meta = policyMeta[effectivePolicy] || policyMeta.balanced;
                      const items: ComposerMenuItem[] = [
                        ...Object.entries(policyMeta).map(([id, m]) => ({
                          id,
                          label: m.label,
                          icon: m.icon,
                          selected: id === effectivePolicy,
                        })),
                        { id: "_perm_divider", label: "", divider: true },
                        {
                          id: "allow_outside_workspace",
                          label: t("settings.allowOutsideWorkspace"),
                          toggle: true,
                          selected: effectiveAllowOutside,
                        },
                      ];
                      return (
                        <ComposerDropdown
                          menuId="permission"
                          icon={meta.icon}
                          triggerLabel={meta.label}
                          triggerTitle={t("chat.permLabel")}
                          items={items}
                          open={composerMenuOpen === "permission"}
                          onOpenChange={(open) => setComposerMenuOpen(open ? "permission" : null)}
                          onSelect={async (id) => {
                            if (!displaySessionId) return;
                            if (id === "allow_outside_workspace") {
                              const next = !effectiveAllowOutside;
                              try {
                                await sessionsApi.setAllowOutsideWorkspace(displaySessionId, next);
                                dispatch(sessionsActions.updateSessionAllowOutside({
                                  id: displaySessionId,
                                  allow_outside_workspace: next,
                                }));
                              } catch (e) {
                                console.error("[Chat] session allow-outside update error:", e);
                              }
                              return;
                            }
                            if (id === effectivePolicy) return;
                            try {
                              await sessionsApi.setPolicyMode(displaySessionId, id);
                              dispatch(sessionsActions.updateSessionPolicy({
                                id: displaySessionId,
                                policy_mode: id,
                              }));
                              setComposerMenuOpen(null);
                            } catch (e) {
                              console.error("[Chat] session policy update error:", e);
                            }
                          }}
                          disabled={running}
                          closeOnSelect={false}
                          variant="wide"
                          placement="above"
                        />
                      );
                    })()}
                  </div>
                </div>
                <ContextUsageRing
                  usage={displaySessionId ? contextUsage[displaySessionId] : undefined}
                  t={t}
                />
                <button
                  type="button"
                  className="btn-icon"
                  onClick={handleShowContextPreview}
                  disabled={contextPreviewLoading || !displaySessionId}
                  title={t("chat.debugContextTitle")}
                >
                  {contextPreviewLoading ? "…" : "🔍"}
                </button>
                {voiceSupported && (
                  <button
                    type="button"
                    className={`btn-icon ${listening ? "voice-active" : ""}`}
                    onClick={toggleVoice}
                    disabled={running}
                    title={listening ? t("chat.voiceStop") : t("chat.voiceStart")}
                  >
                    <Mic size={16} strokeWidth={1.5} />
                  </button>
                )}
                <button
                  type="button"
                  className="btn-icon"
                  onClick={handleAttach}
                  disabled={running}
                  title={t("chat.attachFile")}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                  </svg>
                </button>
                {running ? (
                  <button className="btn btn-danger" onClick={handleCancel}>
                    ⏹ {t("common.stop")}
                  </button>
                ) : (
                  <button
                    className="btn btn-primary"
                    onClick={handleSend}
                    disabled={!canSend}
                  >
                    {t("common.send")} ↵
                  </button>
                )}
              </div>
            </div>}
          </>
            )}
          </>
        ) : sessionFilter === "cli" ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true" style={{ fontSize: 48 }}>
              🐟
            </div>
            <div className="empty-state-title">{t("chat.cliEmptyTitle")}</div>
            <div className="empty-state-desc">{t("chat.cliEmptyDesc")}</div>
          </div>
        ) : variant === "im" ? (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true" style={{ fontSize: 48 }}>
              📩
            </div>
            <div className="empty-state-title">{t("chat.imEmptyTitle")}</div>
            <div className="empty-state-desc">{t("chat.imEmptyDesc")}</div>
            <div className="assistant-im-connect">{imConnectFooter}</div>
          </div>
        ) : (
          <div className="empty-state chat-welcome-state">
            {sendError && (
              <div className="error-banner" role="alert" style={{ marginBottom: 16, maxWidth: 480, width: "100%" }}>
                <span>{sendError}</span>
                <button className="error-dismiss" onClick={() => setSendError(null)}>✕</button>
              </div>
            )}
            <div className="chat-welcome-copy">
              <div className="chat-welcome-brand">WorkBuddy</div>
              <div className="chat-welcome-title">
                {chatScene === "design"
                  ? "你的设计超能力"
                  : chatScene === "code"
                    ? "你的开发搭档"
                    : "你的办公助手"}
              </div>
            </div>
            <div className="chat-welcome-scenes" role="tablist" aria-label="Chat scene">
              {CHAT_SCENES.map((scene) => (
                <button
                  key={scene.id}
                  type="button"
                  role="tab"
                  aria-selected={chatScene === scene.id}
                  className={`chat-welcome-scene${chatScene === scene.id ? " active" : ""}`}
                  title={scene.title}
                  onClick={() => setChatScene(scene.id)}
                >
                  <span className="chat-welcome-scene-icon" aria-hidden>{scene.icon}</span>
                  <span>{scene.label}</span>
                </button>
              ))}
            </div>
            <div className="chat-welcome-actions">
              {(chatScene === "design"
                ? ["网站设计", "PPT设计", "视觉海报", "更多"]
                : chatScene === "code"
                  ? ["代码审查", "修复报错", "生成脚本", "更多"]
                  : ["文档处理", "会议总结", "邮件撰写", "更多"]
              ).map((label) => (
                <button
                  key={label}
                  type="button"
                  className="chat-welcome-action"
                  onClick={() => setInput(label === "更多" ? "" : `帮我做${label}`)}
                >
                  {label}
                </button>
              ))}
            </div>
            <button className="btn btn-primary" onClick={handleNewSession}>
              {t("chat.newChatBtn")}
            </button>
          </div>
        )}
      </div>

      {rightPanelOpen && (
        <ChatRightPanel
          artifact={previewArtifact}
          onClose={() => setRightPanelOpen(false)}
        />
      )}

      <TeamTaskCreateDialog
        open={teamTaskDialogOpen}
        defaultWorkspace={effectiveWorkspace}
        onClose={() => setTeamTaskDialogOpen(false)}
        onCreated={({ chatSessionId, poolSessionId }) => {
          dispatch(sessionsActions.setActiveSession(chatSessionId));
          dispatch(poolActions.setActivePoolSession(poolSessionId));
          setChatViewTab("main");
          setTeamTaskDialogOpen(false);
        }}
      />

      {permissionRequest && (
        <div className="permission-overlay">
          <div className="permission-dialog">
          <h3>{t("chat.permissionTitle")}</h3>
          <p>{permissionRequest.description}</p>
            <div className="tool-info">
              <strong>{permissionRequest.toolName}</strong>
              <pre>{JSON.stringify(permissionRequest.toolInput, null, 2)}</pre>
            </div>
            <div className="actions">
              <button
                className="btn-deny"
                onClick={() => handlePermissionResponse(false)}
              >
                {t("chat.permissionDeny")}
              </button>
              <button
                className="btn-allow"
                onClick={() => handlePermissionResponse(true)}
              >
                {t("chat.permissionAllow")}
              </button>
            </div>
          </div>
        </div>
      )}

      {contextPreview && (
        <div className="permission-overlay" onClick={() => setContextPreview(null)}>
          <div
            className="permission-dialog"
            style={{ maxWidth: 860, width: "92vw", maxHeight: "88vh", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{t("chat.debugContextTitle")}</span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--bg-secondary)", padding: "2px 7px", borderRadius: 8, border: "1px solid var(--border)" }}>
                  {contextPreview.model}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {t("chat.contextPreviewStats", {
                    count: contextPreview.messages.length,
                    total: contextPreview.total_tokens.toLocaleString(),
                    budget: contextPreview.total_input_budget.toLocaleString(),
                  })}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  {t("chat.contextPreviewBody", {
                    tokens: contextPreview.messages_tokens.toLocaleString(),
                    tools: contextPreview.tool_count,
                  })}
                </span>
                {contextPreview.rolling_summary_version > 0 && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--bg-secondary)", padding: "2px 7px", borderRadius: 8, border: "1px solid var(--border)" }}>
                    {t("chat.contextSummaryBadge", { version: contextPreview.rolling_summary_version })}
                  </span>
                )}
                <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--bg-secondary)", padding: "2px 7px", borderRadius: 8, border: "1px solid var(--border)" }}>
                  {t("chat.contextInputTokens", { value: formatTokenCount(contextPreview.total_input_tokens) })}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)", background: "var(--bg-secondary)", padding: "2px 7px", borderRadius: 8, border: "1px solid var(--border)" }}>
                  {t("chat.contextOutputTokens", { value: formatTokenCount(contextPreview.total_output_tokens) })}
                </span>
                {contextPreview.last_compacted_at && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                    {t("chat.contextLastCompacted", { time: formatContextTime(contextPreview.last_compacted_at) ?? contextPreview.last_compacted_at })}
                  </span>
                )}
                <div style={{ width: 60, height: 4, borderRadius: 2, background: "var(--bg-secondary)", overflow: "hidden" }}>
                  <div style={{
                    height: "100%",
                    width: `${Math.min(100, Math.round(contextPreview.total_tokens / contextPreview.total_input_budget * 100))}%`,
                    background: contextPreview.total_tokens / contextPreview.total_input_budget > 0.85 ? "#e05c5c" : "var(--accent)",
                    borderRadius: 2,
                  }} />
                </div>
              </div>
              <button
                onClick={() => setContextPreview(null)}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "var(--text-muted)", lineHeight: 1, padding: "0 4px" }}
              >✕</button>
            </div>

            {/* Message list — no tabs, just the raw LLM context */}
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 14px" }}>
              {contextPreview.messages.length === 0 ? (
                <div style={{ color: "var(--text-muted)", fontSize: 13, padding: "30px 0", textAlign: "center" }}>{t("chat.debugNoMessages")}</div>
              ) : (
                contextPreview.messages.map((msg, msgIdx) => (
                  <div key={msgIdx} style={{ marginBottom: 8, borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden" }}>
                    {/* Role header */}
                    <div style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "4px 10px",
                      background: msg.role === "user" ? "rgba(var(--accent-rgb),0.10)" : "var(--bg-secondary)",
                      fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
                    }}>
                      <span style={{ color: msg.role === "user" ? "var(--accent)" : "var(--text-secondary)", textTransform: "uppercase" }}>
                        {msg.role}
                      </span>
                      <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: 11 }}>~{msg.tokens} tok</span>
                    </div>
                    {/* Blocks */}
                    <div style={{ background: "var(--bg-primary)" }}>
                      {msg.blocks.map((block, blockIdx) => {
                        const key = `${msgIdx}-${blockIdx}`;
                        const expanded = expandedBlocks.has(key);
                        const sep = blockIdx > 0 ? { borderTop: "1px solid var(--border)" } : {};
                        if (block.type === "text") {
                          return (
                            <pre key={blockIdx} style={{
                              margin: 0, padding: "8px 10px",
                              fontSize: 12, lineHeight: 1.55,
                              whiteSpace: "pre-wrap", wordBreak: "break-word",
                              color: "var(--text-primary)",
                              ...sep,
                            }}>
                              {block.text || <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>(empty)</span>}
                            </pre>
                          );
                        }
                        if (block.type === "tool_use") {
                          let inputParsed: Record<string, unknown> | null = null;
                          try { inputParsed = JSON.parse(block.input); } catch { /* raw */ }
                          return (
                            <div key={blockIdx} style={sep}>
                              <button onClick={() => toggleBlock(key)} style={{
                                display: "flex", alignItems: "center", gap: 6, width: "100%",
                                padding: "5px 10px", background: "rgba(120,180,255,0.06)",
                                border: "none", cursor: "pointer", textAlign: "left",
                              }}>
                                <span style={{ fontSize: 11, color: "#7ab4ff", fontFamily: "monospace", fontWeight: 700 }}>⚙ {block.name}</span>
                                <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>{block.id}</span>
                                <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>{expanded ? "▲" : "▼"}</span>
                              </button>
                              {expanded && (
                                <pre style={{
                                  margin: 0, padding: "6px 10px 8px",
                                  fontSize: 11, lineHeight: 1.5,
                                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                                  color: "var(--text-primary)",
                                  background: "rgba(120,180,255,0.04)",
                                  borderTop: "1px solid var(--border)",
                                }}>
                                  {inputParsed !== null ? JSON.stringify(inputParsed, null, 2) : block.input}
                                </pre>
                              )}
                            </div>
                          );
                        }
                        if (block.type === "tool_result") {
                          const isErr = block.is_error;
                          return (
                            <div key={blockIdx} style={sep}>
                              <button onClick={() => toggleBlock(key)} style={{
                                display: "flex", alignItems: "center", gap: 6, width: "100%",
                                padding: "5px 10px",
                                background: isErr ? "rgba(224,92,92,0.06)" : "rgba(80,200,120,0.06)",
                                border: "none", cursor: "pointer", textAlign: "left",
                              }}>
                                <span style={{ fontSize: 11, fontFamily: "monospace", fontWeight: 700, color: isErr ? "#e05c5c" : "#50c878" }}>
                                  {isErr ? "✗" : "✓"} result
                                </span>
                                <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "monospace" }}>{block.tool_use_id}</span>
                                {block.truncated && <span style={{ fontSize: 10, color: "#e0a050" }}>truncated</span>}
                                <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>{expanded ? "▲" : "▼"}</span>
                              </button>
                              {expanded && (
                                <pre style={{
                                  margin: 0, padding: "6px 10px 8px",
                                  fontSize: 11, lineHeight: 1.5,
                                  whiteSpace: "pre-wrap", wordBreak: "break-word",
                                  color: isErr ? "#e05c5c" : "var(--text-primary)",
                                  background: isErr ? "rgba(224,92,92,0.04)" : "rgba(80,200,120,0.04)",
                                  borderTop: "1px solid var(--border)",
                                  maxHeight: 400, overflowY: "auto",
                                }}>
                                  {block.content}
                                </pre>
                              )}
                            </div>
                          );
                        }
                        if (block.type === "image") {
                          return (
                            <div key={blockIdx} style={{ padding: "5px 10px", fontSize: 11, color: "var(--text-muted)", fontStyle: "italic", ...sep }}>
                              {block.note}
                            </div>
                          );
                        }
                        return null;
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={!!deleteTarget}
        title={t("chat.confirmDeleteTitle")}
        message={t("chat.confirmDeleteMessage", { name: deleteTarget?.title ?? "" })}
        confirmLabel={t("common.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        loading={deletingSession}
        onConfirm={confirmDeleteSession}
        onCancel={() => !deletingSession && setDeleteTarget(null)}
      />

      {/* Plan resume dialog — shown when user sends a message while unfinished todos exist */}
      {planResumeDialog && (
        <div
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={() => setPlanResumeDialog(null)}
        >
          <div
            style={{
              background: "var(--bg-primary)", borderRadius: 12,
              padding: "24px 28px", maxWidth: 420, width: "90%",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
              border: "1px solid var(--border)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", marginBottom: 10 }}>
              {t("chat.planResumeTitle")}
            </div>
            <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.5 }}>
              {t("chat.planResumeMessage", {
                count: activePlan.filter(i => i.status === "pending" || i.status === "in_progress").length
              })}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                onClick={async () => {
                  const { pendingContent, pendingAttachments, pendingSkills, pendingKoi } = planResumeDialog;
                  setPlanResumeDialog(null);
                  await doSend(pendingContent, pendingAttachments, pendingSkills, pendingKoi, false);
                }}
                style={{
                  padding: "8px 16px", fontSize: 13, fontWeight: 600,
                  background: "var(--accent)", color: "#fff",
                  border: "none", borderRadius: 6, cursor: "pointer", textAlign: "left",
                }}
              >
                {t("chat.planResumeContinue")}
              </button>
              <button
                onClick={async () => {
                  const { pendingContent, pendingAttachments, pendingSkills, pendingKoi } = planResumeDialog;
                  setPlanResumeDialog(null);
                  await doSend(pendingContent, pendingAttachments, pendingSkills, pendingKoi, true);
                }}
                style={{
                  padding: "8px 16px", fontSize: 13, fontWeight: 600,
                  background: "#dc3545", color: "#fff",
                  border: "none", borderRadius: 6, cursor: "pointer", textAlign: "left",
                }}
              >
                {t("chat.planResumeClear")}
              </button>
              <button
                onClick={() => setPlanResumeDialog(null)}
                style={{
                  padding: "8px 16px", fontSize: 13,
                  background: "var(--bg-secondary)", color: "var(--text-secondary)",
                  border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer", textAlign: "left",
                }}
              >
                {t("chat.planResumeCancelSend")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { linkifyPaths, stripSendMarkers, isLocalPath, uriToNativePath } from "../../utils/linkify";

// Renders message content with full Markdown support (GFM: tables, strikethrough, task lists, etc.)
function MessageContent({ content }: { content: string }) {
  const processed = linkifyPaths(stripSendMarkers(content));
  const fallback = (
    <pre className="code-block">
      <span className="code-lang">text</span>
      <code>{content}</code>
    </pre>
  );
  return (
    <div className="markdown-body">
      <RenderErrorBoundary fallback={fallback}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          urlTransform={(url) => url.startsWith("file://") ? url : (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("mailto:") || url.startsWith("#") || url.startsWith("/") || !url.includes(":")) ? url : ""}
          components={{
            // Local paths → shell.open(); web URLs → new tab
            a: ({ href, children }) => {
              if (isLocalPath(href)) {
                return (
                  <a
                    href="#"
                    title={href}
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      e.preventDefault();
                      openPath(uriToNativePath(href!)).catch(console.error);
                    }}
                  >
                    {children}
                  </a>
                );
              }
              if (!href) return <span>{children}</span>;
              return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
            },
            // Code blocks with language label; mermaid gets special rendering
            code: ({ className, children, ...props }) => {
              const isBlock = !!className;
              const lang = className?.replace("language-", "") ?? "";
              if (isBlock) {
                if (lang === "mermaid") {
                  return <MermaidBlock code={String(children).trimEnd()} />;
                }
                return (
                  <pre className="code-block">
                    {lang && <span className="code-lang">{lang}</span>}
                    <code>{children}</code>
                  </pre>
                );
              }
              // Inline code: if it looks like a local file path, render as clickable link
              const text = String(children);
              if (isLocalPath(text)) {
                const uri = `file:///${text.replace(/\\/g, "/").replace(/^\//, "")}`;
                return (
                  <a
                    href="#"
                    title={text}
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      e.preventDefault();
                      openPath(uriToNativePath(uri)).catch(console.error);
                    }}
                  >
                    {text}
                  </a>
                );
              }
              return <code className="inline-code" {...props}>{children}</code>;
            },
            // Tables: wrap in a scrollable container so wide tables don't stretch the bubble
            table: ({ children }) => (
              <div className="table-scroll-wrapper">
                <table>{children}</table>
              </div>
            ),
            // Inline images — clickable for full-size view
            img: ({ src, alt }) => {
              const displaySrc = src?.startsWith("file://")
                ? convertFileSrc(uriToNativePath(src))
                : src;
              return (
                <img
                src={displaySrc}
                alt={alt || "image"}
                className="message-image"
                onClick={(e) => {
                  const w = window.open();
                  if (w) { w.document.write(`<img src="${displaySrc}" style="max-width:100%">`); }
                  e.stopPropagation();
                }}
                />
              );
            },
          }}
        >
          {processed}
        </ReactMarkdown>
      </RenderErrorBoundary>
    </div>
  );
}
