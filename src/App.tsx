import { Suspense, lazy, useEffect, useState } from "react";
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
} from "lucide-react";
import { store, RootState, settingsActions, sessionsActions, chatActions, poolActions } from "./store";
import { settingsApi, sessionsApi, poolApi, windowApi, extrasApi } from "./services/tauri";
import { orgSpecFromTeamTemplate } from "./utils/teamTemplate";
import { joinProjectPath } from "./utils/projectPath";
import { isInternalSession } from "./utils/session";
import { applyFontScale, getFontScale } from "./utils/fontScale";
import i18n, { setLanguage } from "./i18n";
import Chat from "./components/Chat";
import Toaster from "./components/Toaster";
import MyFiles from "./components/MyFiles";
import Inspiration, { type InspirationAction } from "./components/Inspiration";
import CloudFiles from "./components/CloudFiles";
import CloudBrowser from "./components/CloudBrowser";
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
const Onboarding = lazy(() => import("./components/Onboarding"));
const OverlayApp = lazy(() => import("./components/Overlay"));
const ProWindow = lazy(() => import("./components/ProWindow"));

type Tab = "chat" | "assistant" | "school" | "scheduler" | "myfiles" | "inspiration" | "cloud" | "browser" | "settings";
const SIDEBAR_COLLAPSED_KEY = "piscis-sidebar-collapsed";
const SIDEBAR_DATE_FILTER_KEY = "piscis-task-date-filter";
const ICON = 18;

// Detect if we are running in the overlay window
const IS_OVERLAY = new URLSearchParams(window.location.search).get("overlay") === "1";
// Detect if we are running in the standalone "professional features" window
const IS_PRO_WINDOW = Boolean(new URLSearchParams(window.location.search).get("proview"));

function AppContent() {
  const dispatch = useDispatch();
  const { t } = useTranslation();
  const { showOnboarding, settings } = useSelector((s: RootState) => s.settings);
  const pendingMainChatNav = useSelector((s: RootState) => s.sessions.pendingMainChatNav);
  const activeSessionId = useSelector((s: RootState) => s.sessions.activeSessionId);
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [settingsSubTab, setSettingsSubTab] = useState<SettingsSubTab>("general");
  const [settingsToolsSubTab, setSettingsToolsSubTab] = useState<ToolsSubTab>("builtin");
  const [marketLevelTab, setMarketLevelTab] = useState<MarketLevelTab>("experts");
  const [marketScopeTab, setMarketScopeTab] = useState<MarketScopeTab>("market");
  const [moreOpen, setMoreOpen] = useState(false);
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
  const [theme, setTheme] = useState<'violet' | 'gold'>(() => {
    return (localStorage.getItem('piscis-theme') as 'violet' | 'gold') || 'violet';
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
      const next = event.payload === "gold" ? "gold" : "violet";
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
        if (!configured) {
          dispatch(settingsActions.setShowOnboarding(true));
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

  if (showOnboarding) {
    return (
      <>
        <Suspense fallback={<div className="loading-screen"><div className="loading-spinner" /><p>{t("common.loadingApp")}</p></div>}>
          <Onboarding onComplete={() => dispatch(settingsActions.setShowOnboarding(false))} />
        </Suspense>
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

  const handleGuide = () => {
    dispatch(sessionsActions.openMainChatView({ filter: "chat", composerDraft: t("guide.prompt") }));
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
            className={`nav-item ${activeTab === "browser" ? "active" : ""}`}
            onClick={() => setActiveTab("browser")}
            title={t("nav.browser")}
          >
            <span className="nav-icon"><Globe size={ICON} strokeWidth={1.5} /></span>
            <span className="nav-label">{t("nav.browser")}</span>
          </button>
          <button type="button" className="nav-item" onClick={handleGuide} title={t("nav.guide")}>
            <span className="nav-icon"><BookOpen size={ICON} strokeWidth={1.5} /></span>
            <span className="nav-label">{t("nav.guide")}</span>
          </button>
        </div>

        {!sidebarCollapsed && (
          <AccountMenu
            colorMode={colorMode}
            onToggleColorMode={() => setColorMode((m) => (m === "dark" ? "light" : "dark"))}
            onOpenSettings={() => openSettings("general")}
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
                <Chat
                  variant={activeTab === "assistant" ? "im" : "task"}
                  onOpenSettings={(sub) => openSettings(sub)}
                  onNavigateTab={(tab, opts) => {
                    if (tab === "skills" || tab === "school") {
                      navigateTab("school");
                      if (tab === "skills" || opts?.marketLevel === "skills") {
                        setMarketLevelTab("skills");
                        setMarketScopeTab(opts?.marketScope ?? "market");
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
              <CloudBrowser visible={activeTab === "browser"} />
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
        </Suspense>
      </main>
      <Toaster />
    </div>
  );
}

export default function App() {
  if (IS_OVERLAY) {
    return (
      <Suspense fallback={<div className="loading-screen"><div className="loading-spinner" /><p>{i18n.t("common.loadingApp")}</p></div>}>
        <OverlayApp />
      </Suspense>
    );
  }
  if (IS_PRO_WINDOW) {
    return (
      <Suspense fallback={<div className="loading-screen"><div className="loading-spinner" /><p>{i18n.t("common.loadingApp")}</p></div>}>
        <ProWindow />
      </Suspense>
    );
  }
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}
