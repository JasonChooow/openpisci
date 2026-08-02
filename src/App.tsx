import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import {
  Bot,
  Store,
  Clock,
  LayoutGrid,
  FolderOpen,
  Lightbulb,
  Cloud,
  Globe,
  BookOpen,
  ChevronRight,
  ShoppingBag,
  MonitorCloud,
  Wallet,
} from "lucide-react";
import { store, RootState, settingsActions, sessionsActions, chatActions, poolActions } from "./store";
import { settingsApi, sessionsApi, poolApi, windowApi, extrasApi } from "./services/tauri";
import { orgSpecFromTeamTemplate } from "./utils/teamTemplate";
import { joinProjectPath } from "./utils/projectPath";
import { isInternalSession, isMainChatVisibleSession } from "./utils/session";
import { applyFontScale, getFontScale } from "./utils/fontScale";
import i18n, { setLanguage } from "./i18n";
import AuthGate from "./components/AuthGate/AuthGate";
import Chat from "./components/Chat";
import Toaster from "./components/Toaster";
import MyFiles from "./components/MyFiles";
import Inspiration, { type InspirationAction } from "./components/Inspiration";
import CloudFiles from "./components/CloudFiles";
import CloudBrowser from "./components/CloudBrowser";
import AgentComputerPage from "./components/AgentComputerPage";
import TaskList from "./components/Sidebar/TaskList";
import SidebarHeader from "./components/Sidebar/SidebarHeader";
import AccountMenu from "./components/Sidebar/AccountMenu";
import type { TaskDateFilter } from "./components/Sidebar/taskFilters";
import type { SettingsSubTab, ToolsSubTab, OpenSettingsOptions } from "./components/SettingsHub/types";
import type { MarketLevelTab, MarketScopeTab } from "./components/ExpertHub";
import "./theme.css";
import "./App.css";
import "./components/Sidebar/Sidebar.css";
import "./components/AssistantPage/AssistantPage.css";

const ExpertHub = lazy(() => import("./components/ExpertHub"));
const Scheduler = lazy(() => import("./components/Scheduler"));
const SettingsHub = lazy(() => import("./components/SettingsHub"));
const OverlayApp = lazy(() => import("./components/Overlay"));
const ProWindow = lazy(() => import("./components/ProWindow"));
const UsageDashboardPage = lazy(() => import("./components/UsageDashboard/UsageDashboardPage"));

type Tab = "chat" | "assistant" | "school" | "scheduler" | "myfiles" | "inspiration" | "cloud" | "browser" | "settings" | "usage";
type SpaceLink = "browser" | "glamoon" | "qinchuang";
type AppTheme = "violet" | "gold" | "minimal";
const SIDEBAR_COLLAPSED_KEY = "piscis-sidebar-collapsed";
const SIDEBAR_DATE_FILTER_KEY = "piscis-task-date-filter";
const GUIDED_TOUR_DONE_KEY = "9xbot-guided-tour-v1-done";
const GUIDED_TOUR_PENDING_KEY = "9xbot-guided-tour-v1-pending";
const GLAMOON_MALL_URL = "https://glamoon.cn/h5/1.html#/pages/index/index";
const ICON = 18;

type GuidedTourStep = {
  target: string;
  title: string;
  body: string;
};

const GUIDED_TOUR_STEPS: GuidedTourStep[] = [
  {
    target: "new-task",
    title: "第一步：新建任务",
    body: "点这里开一个新任务。写文档、总结会议、整理资料，都从这里开始。",
  },
  {
    target: "chat-scene",
    title: "第二步：选择工作类型",
    body: "日常办公、代码开发、设计创意会让包子用不同方式帮你。拿不准时，保持日常办公就行。",
  },
  {
    target: "market",
    title: "第三步：找专家和技能",
    body: "市场里有专家、团队和技能。需要营销、PPT、文档处理时，可以先来这里添加。",
  },
  {
    target: "guide",
    title: "第四步：不会开头就点这里",
    body: "新手指引会把示例需求放进输入框，你改几个字就能发给包子。",
  },
];

function GuidedTour({ onComplete }: { onComplete: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const step = GUIDED_TOUR_STEPS[stepIndex];

  const updateTargetRect = useCallback(() => {
    const target = document.querySelector<HTMLElement>(`[data-tour-target="${step.target}"]`);
    setTargetRect(target?.getBoundingClientRect() ?? null);
  }, [step.target]);

  useEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-tour-target="${step.target}"]`);
    target?.scrollIntoView({ block: "center", inline: "center" });

    const raf = window.requestAnimationFrame(updateTargetRect);
    const timeout = window.setTimeout(updateTargetRect, 180);
    window.addEventListener("resize", updateTargetRect);
    window.addEventListener("scroll", updateTargetRect, true);

    return () => {
      window.cancelAnimationFrame(raf);
      window.clearTimeout(timeout);
      window.removeEventListener("resize", updateTargetRect);
      window.removeEventListener("scroll", updateTargetRect, true);
    };
  }, [step.target, updateTargetRect]);

  const finishTour = () => {
    localStorage.setItem(GUIDED_TOUR_DONE_KEY, "1");
    localStorage.removeItem(GUIDED_TOUR_PENDING_KEY);
    onComplete();
  };

  const nextStep = () => {
    if (stepIndex >= GUIDED_TOUR_STEPS.length - 1) {
      finishTour();
      return;
    }
    setStepIndex((value) => value + 1);
  };

  const cardWidth = Math.min(340, window.innerWidth - 32);
  const cardStyle = targetRect
    ? {
        width: cardWidth,
        left: Math.min(Math.max(targetRect.right + 16, 16), window.innerWidth - cardWidth - 16),
        top:
          targetRect.bottom + 178 < window.innerHeight
            ? Math.max(16, targetRect.bottom + 14)
            : Math.max(16, targetRect.top - 178),
      }
    : {
        width: cardWidth,
        left: Math.max(16, (window.innerWidth - cardWidth) / 2),
        top: Math.max(16, window.innerHeight / 2 - 110),
      };

  return (
    <div className="guided-tour" role="dialog" aria-modal="true" aria-labelledby="guided-tour-title">
      {targetRect && (
        <div
          className="guided-tour-spotlight"
          style={{
            left: Math.max(8, targetRect.left - 8),
            top: Math.max(8, targetRect.top - 8),
            width: targetRect.width + 16,
            height: targetRect.height + 16,
          }}
        />
      )}
      <div className="guided-tour-card" style={cardStyle}>
        <div className="guided-tour-count">
          {stepIndex + 1} / {GUIDED_TOUR_STEPS.length}
        </div>
        <h2 id="guided-tour-title">{step.title}</h2>
        <p>{step.body}</p>
        <div className="guided-tour-actions">
          <button type="button" className="btn btn-primary" onClick={nextStep}>
            {stepIndex >= GUIDED_TOUR_STEPS.length - 1 ? "开始使用" : "下一步"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Detect if we are running in the overlay window
const IS_OVERLAY = new URLSearchParams(window.location.search).get("overlay") === "1";
// Detect if we are running in the standalone "professional features" window
const IS_PRO_WINDOW = Boolean(new URLSearchParams(window.location.search).get("proview"));
const IS_LOCAL_DEV_HOST = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
const IS_GUIDED_TOUR_PREVIEW = IS_LOCAL_DEV_HOST && new URLSearchParams(window.location.search).get("tour") === "1";

function AppContent() {
  const dispatch = useDispatch();
  const { t } = useTranslation();
  const { settings } = useSelector((s: RootState) => s.settings);
  const pendingMainChatNav = useSelector((s: RootState) => s.sessions.pendingMainChatNav);
  const activeSessionId = useSelector((s: RootState) => s.sessions.activeSessionId);
  const sessions = useSelector((s: RootState) => s.sessions.sessions);
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>("general");
  const [settingsToolsSubTab, setSettingsToolsSubTab] = useState<ToolsSubTab>("builtin");
  const [marketLevelTab, setMarketLevelTab] = useState<MarketLevelTab>("experts");
  const [marketScopeTab, setMarketScopeTab] = useState<MarketScopeTab>("installed");
  const [activeKoiId, setActiveKoiId] = useState<string | null>(null);
  const [summonKoiRequest, setSummonKoiRequest] = useState<{ koiId: string | null; nonce: number } | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showGuidedTour, setShowGuidedTour] = useState(false);
  const [activeSpaceLink, setActiveSpaceLink] = useState<SpaceLink>("browser");
  const [browserRequest, setBrowserRequest] = useState<{ url: string | null; key: number }>({ url: null, key: 0 });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  });
  const [dateFilter, setDateFilter] = useState<TaskDateFilter>(() => {
    const saved = localStorage.getItem(SIDEBAR_DATE_FILTER_KEY);
    if (saved === "today" || saved === "last7" || saved === "last30" || saved === "all") return saved;
    return "all";
  });
  /** Tabs that have been opened at least once — stay mounted to preserve state. */
  const [mountedTabs, setMountedTabs] = useState<Set<Tab>>(() => new Set(["chat"]));
  const [initialized, setInitialized] = useState(false);
  const [theme, setTheme] = useState<AppTheme>(() => {
    const saved = localStorage.getItem('piscis-theme');
    return saved === 'gold' || saved === 'minimal' ? saved : 'violet';
  });
  const [colorMode, setColorMode] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('piscis-color-mode') as 'light' | 'dark') || 'light';
  });

  useEffect(() => {
    applyFontScale(getFontScale());
  }, []);

  useEffect(() => {
    setMountedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_DATE_FILTER_KEY, dateFilter);
  }, [dateFilter]);

  // Pond IDE assistant → jump to main Chat (legacy).
  useEffect(() => {
    if (pendingMainChatNav) setActiveTab("chat");
  }, [pendingMainChatNav]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-color-mode', colorMode);
    localStorage.setItem('piscis-theme', theme);
    localStorage.setItem('piscis-color-mode', colorMode);
    // Sync window border/title bar color with theme (Windows 11+)
    if (!IS_OVERLAY) {
      const apply = () => windowApi.setThemeBorder(theme).catch(() => {});
      apply();
      const tid = setTimeout(apply, 800); // Retry after window ready
      return () => clearTimeout(tid);
    }
  }, [theme, colorMode]);

  useEffect(() => {
    const unlisten = listen<string>("app_theme_changed", (event) => {
      const next = event.payload === "gold" || event.payload === "minimal" ? event.payload : "violet";
      setTheme(next);
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  // 当 settings.language 变化时同步 i18n
  useEffect(() => {
    if (settings?.language) {
      setLanguage(settings.language as "zh" | "en");
    }
  }, [settings?.language]);

  useEffect(() => {
    async function init() {
      try {
        const [settings, configured] = await Promise.all([
          settingsApi.get(),
          settingsApi.isConfigured(),
        ]);
        dispatch(settingsActions.setSettings(settings));
        dispatch(settingsActions.setConfigured(configured));
        if (IS_GUIDED_TOUR_PREVIEW) {
          setActiveTab("chat");
          setSidebarCollapsed(false);
          setShowGuidedTour(true);
        } else if (
          localStorage.getItem(GUIDED_TOUR_PENDING_KEY) === "1" &&
          localStorage.getItem(GUIDED_TOUR_DONE_KEY) !== "1"
        ) {
          setActiveTab("chat");
          setSidebarCollapsed(false);
          setShowGuidedTour(true);
        }

        // Load sessions — skip internal sessions (heartbeat, piscis_inbox, etc.)
        // when choosing the initial active session so the user always lands on
        // a real chat session, not an invisible internal one.
        const { sessions } = await sessionsApi.list(100);
        dispatch(sessionsActions.setSessions(sessions));
        const firstVisible = sessions.find((s) => !isInternalSession(s));
        dispatch(sessionsActions.setActiveSession(firstVisible?.id ?? null));

        // Load pool projects so the unified task list can show them
        // alongside chat sessions without opening Pond first.
        try {
          const poolSessions = await poolApi.listSessions();
          dispatch(poolActions.setPoolSessions(poolSessions));
        } catch (e) {
          console.error("Init pool sessions error:", e);
        }
      } catch (e) {
        console.error("Init error:", e);
      } finally {
        setInitialized(true);
      }
    }
    init();
  }, [dispatch]);

  useEffect(() => {
    if (!initialized || !IS_GUIDED_TOUR_PREVIEW) return;
    setActiveTab("chat");
    setSidebarCollapsed(false);
    setShowGuidedTour(true);
  }, [initialized]);

  // im_session_updated: inbound user message arrived and was pre-written to DB.
  // Reload messages immediately so the user sees their own message right away.
  // Mark session as running to show the processing indicator.
  // Also refresh the session list so IM sessions (which are created on demand)
  // appear in the sidebar and can be selected.
  useEffect(() => {
    const unlisten = listen<string>("im_session_updated", async (event) => {
      const sid = event.payload;
      if (!sid) return;
      console.log('[IM] im_session_updated sid=', sid);
      try {
        const [messages, { sessions: fresh }] = await Promise.all([
          sessionsApi.getMessages(sid),
          sessionsApi.list(100),
        ]);
        console.log('[IM] im_session_updated: loaded', messages.length, 'messages');
        // Update session list so the IM session appears in the sidebar.
        // setSessions does NOT change activeSessionId, so the user's current
        // session selection is preserved.
        dispatch(sessionsActions.setSessions(fresh));
        dispatch(chatActions.setMessages({ sessionId: sid, messages }));
        dispatch(chatActions.setRunning({ sessionId: sid, running: true }));
        // Clear any stale streaming state / tool steps / frozen bubble from a previous run
        // so the UI doesn't show overlapping output from the old agent.
        // frozenBubble MUST be cleared here because the IM agent event listener
        // (Chat/index.tsx) is only subscribed when this session is the active one.
        // If the user is viewing a different session, freezeStreaming never fires
        // for this IM session, so the stale frozenBubble from the previous turn
        // would be reused by im_session_done's setMessagesWithFrozen, causing
        // a stale collapsed bubble to appear in the middle of the message list.
        dispatch(chatActions.clearFrozenBubble(sid));
        dispatch(chatActions.clearStreaming(sid));
        dispatch(chatActions.clearToolSteps(sid));
        dispatch(chatActions.clearContextUsage(sid));
      } catch (e) {
        console.error("[IM] im_session_updated error:", e);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [dispatch]);

  // im_session_done: agent finished AND persisted all messages to DB.
  // This is emitted AFTER persist_agent_turn completes, so getMessages will see the full reply.
  useEffect(() => {
    const unlisten = listen<string>("im_session_done", async (event) => {
      const sid = event.payload;
      if (!sid) return;
      console.log('[IM] im_session_done sid=', sid);
      try {
        const messages = await sessionsApi.getMessages(sid, 200);
        console.log('[IM] im_session_done: loaded', messages.length, 'messages');
        // Use setMessagesWithFrozen so the frozenBubble (merged streaming text) is preserved
        // as a single bubble, rather than being replaced by the raw multi-row DB data.
        dispatch(chatActions.setMessagesWithFrozen({ sessionId: sid, messages }));
      } catch (e) {
        console.error("[IM] im_session_done error:", e);
      }
      dispatch(chatActions.setRunning({ sessionId: sid, running: false }));
      dispatch(chatActions.clearStreaming(sid));
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [dispatch]);

  // settings_changed: emitted by app_control tool when Agent modifies settings
  // (SSH servers, API keys, tool toggles, etc.) — re-fetch and sync Redux store
  // so the Settings page reflects changes without requiring a manual restart.
  useEffect(() => {
    const unlisten = listen("settings_changed", async () => {
      try {
        const updated = await settingsApi.get();
        dispatch(settingsActions.setSettings(updated));
      } catch (e) {
        console.error("[settings_changed] failed to reload settings:", e);
      }
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [dispatch]);

  if (!initialized) {
    return (
      <>
        <div className="loading-screen">
          <div className="loading-spinner" />
          <p>{t("common.loadingApp")}</p>
        </div>
        <Toaster />
      </>
    );
  }

  const navigateTab = (tab: Tab) => {
    setActiveTab(tab);
  };

  const openSettings = (sub: SettingsSubTab = "general", options?: OpenSettingsOptions) => {
    setSettingsSubTab(sub);
    if (options?.toolsSubTab) {
      setSettingsToolsSubTab(options.toolsSubTab);
    }
    setActiveTab("settings");
  };

  const handleNewAssistantTask = async () => {
    try {
      const session = await sessionsApi.create(t("chat.newChat"));
      dispatch(sessionsActions.addSession(session));
      dispatch(sessionsActions.openMainChatView({ filter: "chat", sessionId: session.id }));
    } catch (e) {
      console.error("New task error:", e);
    }
    setActiveTab("chat");
  };

  const handleAssistant = () => {
    setActiveTab("assistant");
  };

  const handleSummonExpert = (koiId: string | null) => {
    setActiveKoiId(koiId);
    setSummonKoiRequest({ koiId, nonce: Date.now() });
    setActiveTab("chat");
  };

  const handleGuide = async () => {
    const prompt = t("guide.prompt");
    const activeSession = sessions.find((session) => session.id === activeSessionId);
    if (activeSession && isMainChatVisibleSession(activeSession, "chat")) {
      dispatch(sessionsActions.openMainChatView({ filter: "chat", composerDraft: prompt }));
      setActiveTab("chat");
      return;
    }

    try {
      const session = await sessionsApi.create(t("chat.newChat"));
      dispatch(sessionsActions.addSession(session));
      dispatch(sessionsActions.openMainChatView({ filter: "chat", sessionId: session.id, composerDraft: prompt }));
    } catch (e) {
      console.error("Guide session error:", e);
      dispatch(sessionsActions.openMainChatView({ filter: "chat", composerDraft: prompt }));
    }
    setActiveTab("chat");
  };

  const handleMakeSimilar = async (prompt: string) => {
    try {
      const session = await sessionsApi.create(t("chat.newChat"));
      dispatch(sessionsActions.addSession(session));
      dispatch(sessionsActions.openMainChatView({ filter: "chat", sessionId: session.id, composerDraft: prompt }));
    } catch (e) {
      console.error("Make similar error:", e);
      dispatch(sessionsActions.openMainChatView({ filter: "chat", composerDraft: prompt }));
    }
    setActiveTab("chat");
  };

  const handleInspirationAction = async (action: InspirationAction) => {
    if (action.target === "chat") {
      await handleMakeSimilar(action.prompt);
      return;
    }

    let projectDir = settings?.workspace_root?.trim() || "";
    if (!projectDir) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const dir = await open({
          directory: true,
          multiple: false,
          title: t("pool.selectProjectDir"),
        });
        if (!dir || typeof dir !== "string") return;
        projectDir = dir;
      } catch {
        return;
      }
    }

    try {
      let orgSpec: string | undefined;
      if (action.teamTemplateId) {
        const templates = await extrasApi.listTeamTemplates();
        const tpl = templates.find((item) => item.id === action.teamTemplateId);
        if (tpl) orgSpec = orgSpecFromTeamTemplate(tpl);
      }

      const fullProjectDir = joinProjectPath(projectDir, action.title);
      const bundle = await poolApi.createTeamTaskBundle({
        name: action.title,
        projectDir: fullProjectDir,
        taskTimeoutSecs: 0,
        mode: action.teamTemplateId ? "template" : "adhoc",
        koiIds: [],
        orgSpec,
      });
      dispatch(poolActions.addPoolSession(bundle.pool_session));
      const { sessions: fresh } = await sessionsApi.list(200);
      dispatch(sessionsActions.setSessions(fresh));
      dispatch(sessionsActions.openMainChatView({ filter: "chat", sessionId: bundle.chat_session_id }));
      dispatch(poolActions.setActivePoolSession(bundle.pool_session_id));

      await poolApi.sendMessage({
        session_id: bundle.pool_session_id,
        sender_id: "piscis",
        content: `@all ${action.prompt}`,
        msg_type: "mention",
        metadata: "all",
      });
      setActiveTab("chat");
    } catch (e) {
      console.error("Inspiration pool error:", e);
    }
  };

  const handleSelectChatTask = (id: string) => {
    dispatch(sessionsActions.openMainChatView({ filter: "chat", sessionId: id }));
    setActiveTab("chat");
  };

  const openSpaceLink = (link: SpaceLink, url: string | null = null) => {
    setActiveSpaceLink(link);
    setBrowserRequest({ url, key: Date.now() });
    setActiveTab("browser");
  };

  const conversationVisible = activeTab === "chat" || activeTab === "assistant";
  const conversationMounted = mountedTabs.has("chat") || mountedTabs.has("assistant");

  return (
    <div className="app">
      <aside className={`sidebar${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
        <SidebarHeader
          collapsed={sidebarCollapsed}
          onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
          dateFilter={dateFilter}
          onDateFilterChange={setDateFilter}
          onNewAssistantTask={handleNewAssistantTask}
          onSelectChat={handleSelectChatTask}
        />

        {!sidebarCollapsed && (
          <div className="sidebar-new-task-wrap">
            <button
              type="button"
              className="sidebar-new-task-btn"
              data-tour-target="new-task"
              onClick={handleNewAssistantTask}
            >
              {t("sidebar.newShort")}
            </button>
          </div>
        )}

        <div className="sidebar-scroll">
          <button
            type="button"
            className={`nav-item ${activeTab === "assistant" ? "active" : ""}`}
            onClick={handleAssistant}
            title={t("nav.assistant")}
          >
            <span className="nav-icon"><Bot size={ICON} strokeWidth={1.5} /></span>
            <span className="nav-label-wrap">
              <span className="nav-label">{t("nav.assistant")}</span>
              <span className="nav-sub">{t("nav.assistantSub")}</span>
            </span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === "school" ? "active" : ""}`}
            data-tour-target="market"
            onClick={() => navigateTab("school")}
            title={t("nav.market")}
          >
            <span className="nav-icon"><Store size={ICON} strokeWidth={1.5} /></span>
            <span className="nav-label-wrap">
              <span className="nav-label">{t("nav.market")}</span>
              <span className="nav-sub">{t("nav.marketSub")}</span>
            </span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === "scheduler" ? "active" : ""}`}
            onClick={() => setActiveTab("scheduler")}
            title={t("nav.automation")}
          >
            <span className="nav-icon"><Clock size={ICON} strokeWidth={1.5} /></span>
            <span className="nav-label">{t("nav.automation")}</span>
          </button>

          <button
            type="button"
            className={`nav-item ${activeTab === "usage" ? "active" : ""}`}
            onClick={() => setActiveTab("usage")}
            title={t("nav.usage")}
          >
            <span className="nav-icon"><Wallet size={ICON} strokeWidth={1.5} /></span>
            <span className="nav-label-wrap">
              <span className="nav-label">{t("nav.usage")}</span>
              <span className="nav-sub">{t("nav.usageSub")}</span>
            </span>
          </button>

          <button
            type="button"
            className="nav-item"
            onClick={() => setMoreOpen((v) => !v)}
            title={t("nav.more")}
          >
            <span className="nav-icon"><LayoutGrid size={ICON} strokeWidth={1.5} /></span>
            <span className="nav-label">{t("nav.more")}</span>
            <span className={`nav-chevron ${moreOpen ? "open" : ""}`}><ChevronRight size={15} strokeWidth={2} /></span>
          </button>
          {moreOpen && (
            <div className="nav-subitems">
              <button
                type="button"
                className={`nav-item nav-item-sub ${activeTab === "myfiles" ? "active" : ""}`}
                onClick={() => setActiveTab("myfiles")}
              >
                <span className="nav-icon"><FolderOpen size={16} strokeWidth={1.5} /></span>
                <span className="nav-label">{t("nav.myFiles")}</span>
              </button>
              <button
                type="button"
                className={`nav-item nav-item-sub ${activeTab === "inspiration" ? "active" : ""}`}
                onClick={() => setActiveTab("inspiration")}
              >
                <span className="nav-icon"><Lightbulb size={16} strokeWidth={1.5} /></span>
                <span className="nav-label">{t("nav.inspiration")}</span>
              </button>
              <button
                type="button"
                className={`nav-item nav-item-sub ${activeTab === "cloud" ? "active" : ""}`}
                onClick={() => setActiveTab("cloud")}
              >
                <span className="nav-icon"><Cloud size={16} strokeWidth={1.5} /></span>
                <span className="nav-label">{t("nav.cloudFiles")}</span>
              </button>
            </div>
          )}

          <div className="nav-section-label">{t("nav.tasks")}</div>
          <TaskList
            activeChatSessionId={activeSessionId}
            activeTab={activeTab}
            dateFilter={dateFilter}
            onSelectChat={handleSelectChatTask}
          />

          <div className="nav-section-label">{t("nav.space")}</div>
          <button
            type="button"
            className={`nav-item ${activeTab === "browser" && activeSpaceLink === "browser" ? "active" : ""}`}
            onClick={() => openSpaceLink("browser")}
            title={t("nav.browser")}
          >
            <span className="nav-icon"><Globe size={ICON} strokeWidth={1.5} /></span>
            <span className="nav-label">{t("nav.browser")}</span>
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === "browser" && activeSpaceLink === "glamoon" ? "active" : ""}`}
            onClick={() => openSpaceLink("glamoon", GLAMOON_MALL_URL)}
            title={t("nav.glamoonMallSub")}
          >
            <span className="nav-icon"><ShoppingBag size={ICON} strokeWidth={1.5} /></span>
            <span className="nav-label">{t("nav.glamoonMall")}</span>
          </button>
          <button
            type="button"
            className={`nav-item ${activeTab === "browser" && activeSpaceLink === "qinchuang" ? "active" : ""}`}
            onClick={() => openSpaceLink("qinchuang")}
            title={t("nav.agentComputerSub")}
          >
            <span className="nav-icon"><MonitorCloud size={ICON} strokeWidth={1.5} /></span>
            <span className="nav-label">{t("nav.agentComputer")}</span>
          </button>
          <button type="button" className="nav-item" data-tour-target="guide" onClick={handleGuide} title={t("nav.guide")}>
            <span className="nav-icon"><BookOpen size={ICON} strokeWidth={1.5} /></span>
            <span className="nav-label">{t("nav.guide")}</span>
          </button>
        </div>

        {!sidebarCollapsed && (
          <AccountMenu
            colorMode={colorMode}
            onToggleColorMode={() => setColorMode((m) => (m === "dark" ? "light" : "dark"))}
            onOpenSettings={() => openSettings("general")}
            onOpenUsage={() => setActiveTab("usage")}
            onHelp={handleGuide}
            onMinimalMode={() => windowApi.enterMinimalMode()}
          />
        )}
      </aside>
      <main className="main-content">
        <Suspense fallback={<div className="loading-screen"><div className="loading-spinner" /><p>{t("common.loadingApp")}</p></div>}>
          {conversationMounted && (
            <div className="tab-panel" hidden={!conversationVisible}>
              <div className={activeTab === "assistant" ? "assistant-page" : "conversation-shell"}>
                {activeTab === "assistant" && (
                  <div className="assistant-hero-illustration" aria-hidden="true">
                    <img src="/assistant-illustration.png" alt="" />
                  </div>
                )}
                <Chat
                  variant={activeTab === "assistant" ? "im" : "task"}
                  activeKoiId={activeKoiId}
                  summonKoiRequest={summonKoiRequest}
                  onActiveKoiChange={setActiveKoiId}
                  onOpenSettings={(sub) => openSettings(sub)}
                  onNavigateTab={(tab, opts) => {
                    if (tab === "skills" || tab === "school") {
                      navigateTab("school");
                      if (tab === "skills" || opts?.marketLevel === "skills") {
                        setMarketLevelTab("skills");
                        setMarketScopeTab(opts?.marketScope ?? "installed");
                      } else if (opts?.schoolSubTab === "koi") {
                        setMarketLevelTab("experts");
                        setMarketScopeTab("installed");
                      }
                    }
                  }}
                />
              </div>
            </div>
          )}
          {mountedTabs.has("school") && (
            <div className="tab-panel" hidden={activeTab !== "school"}>
              <ExpertHub
                levelTab={marketLevelTab}
                scopeTab={marketScopeTab}
                onLevelTabChange={setMarketLevelTab}
                onScopeTabChange={setMarketScopeTab}
                onNavigateToChat={() => navigateTab("chat")}
                activeKoiId={activeKoiId}
                onSummonExpert={handleSummonExpert}
              />
            </div>
          )}
          {mountedTabs.has("scheduler") && (
            <div className="tab-panel" hidden={activeTab !== "scheduler"}><Scheduler /></div>
          )}
          {mountedTabs.has("myfiles") && (
            <div className="tab-panel" hidden={activeTab !== "myfiles"}>
              <MyFiles visible={activeTab === "myfiles"} />
            </div>
          )}
          {mountedTabs.has("inspiration") && (
            <div className="tab-panel" hidden={activeTab !== "inspiration"}>
              <Inspiration onAction={handleInspirationAction} />
            </div>
          )}
          {mountedTabs.has("cloud") && (
            <div className="tab-panel" hidden={activeTab !== "cloud"}>
              <CloudFiles visible={activeTab === "cloud"} />
            </div>
          )}
          {mountedTabs.has("browser") && (
            <div className="tab-panel" hidden={activeTab !== "browser"}>
              {activeSpaceLink === "qinchuang" ? (
                <AgentComputerPage />
              ) : (
                <CloudBrowser
                  visible={activeTab === "browser"}
                  targetUrl={browserRequest.url}
                  requestKey={browserRequest.key}
                  mobilePreview={activeSpaceLink === "glamoon"}
                />
              )}
            </div>
          )}
          {mountedTabs.has("settings") && (
            <div className="tab-panel" hidden={activeTab !== "settings"}>
              <SettingsHub
                theme={theme}
                setTheme={setTheme}
                activeSubTab={settingsSubTab}
                onSubTabChange={setSettingsSubTab}
                toolsSubTab={settingsToolsSubTab}
                onOpenAssistant={handleAssistant}
              />
            </div>
          )}
          {mountedTabs.has("usage") && (
            <div className="tab-panel" hidden={activeTab !== "usage"}>
              <UsageDashboardPage />
            </div>
          )}
        </Suspense>
      </main>
      {showGuidedTour && <GuidedTour onComplete={() => setShowGuidedTour(false)} />}
      <Toaster />
    </div>
  );
}

export default function App() {
  let content;

  if (IS_OVERLAY) {
    content = (
      <Suspense fallback={<div className="loading-screen"><div className="loading-spinner" /><p>{i18n.t("common.loadingApp")}</p></div>}>
        <OverlayApp />
      </Suspense>
    );
  } else if (IS_PRO_WINDOW) {
    content = (
      <Suspense fallback={<div className="loading-screen"><div className="loading-spinner" /><p>{i18n.t("common.loadingApp")}</p></div>}>
        <ProWindow />
      </Suspense>
    );
  } else {
    content = (
      <Provider store={store}>
        <AppContent />
      </Provider>
    );
  }

  return <AuthGate>{content}</AuthGate>;
}
