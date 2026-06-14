import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useSelector, useDispatch } from "react-redux";
import { listen } from "@tauri-apps/api/event";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Board from "../Board";
import PiscisInbox from "../PiscisInbox";
import { openPath, poolApi, koiApi, PoolMessage, KoiWithStats, poolSessionFromWire, type PoolSessionSnapshot } from "../../../services/tauri";
import { RootState, poolActions, koiActions, boardActions, POOL_DEFAULT_CAPACITY, parseMentions, hasMentions } from "../../../store";
import { useScrollPrependedHistory } from "../../../hooks/useScrollPrependedHistory";
import { containsDelegatedPiscisMention } from "../../../utils/poolMention";
import {
  handleInputHistoryKeyDown,
  pushInputHistory,
  resetInputHistoryNav,
  seedInputHistory,
} from "../../../utils/inputHistory";
import { linkifyPaths, isLocalPath, uriToNativePath } from "../../../utils/linkify";
import ChatRightPanel from "../../Chat/ChatRightPanel";
import type { SessionArtifact } from "../../../services/tauri";
import {
  MembersPanel,
  OrgSpecPanel,
  TeamProjectFilesPanel,
} from "../TeamTaskPanels";
import "../ChatPool/ChatPool.css";
import "../../Chat/Chat.css";
import "./Collab.css";

type ContentView = "chat" | "board" | "inbox" | "koiObserver";
type TaskPanelTab = "artifacts" | "members" | "spec";

const VIEW_ORDER: ContentView[] = ["chat", "board", "inbox", "koiObserver"];

const VIEW_ICONS: Record<ContentView, string> = {
  chat: "💬",
  board: "📋",
  inbox: "📬",
  koiObserver: "🔎",
};

const VIEW_I18N_KEY: Record<ContentView, string> = {
  chat: "pond.tabChat",
  board: "pond.tabBoard",
  inbox: "pond.tabInbox",
  koiObserver: "pond.tabKoiObserver",
};

function PoolMessageContent({ content }: { content: string }) {
  const processed = linkifyPaths(content);
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      urlTransform={(url) => url.startsWith("file://") ? url : (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("mailto:") || url.startsWith("#") || url.startsWith("/") || !url.includes(":")) ? url : ""}
      components={{
        a: ({ href, children }) => {
          if (isLocalPath(href)) {
            return (
              <a
                href="#"
                title={href}
                style={{ cursor: "pointer", color: "var(--accent)" }}
                onClick={(e) => {
                  e.preventDefault();
                  openPath(uriToNativePath(href!)).catch(console.error);
                }}
              >
                {children}
              </a>
            );
          }
          return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
        },
      }}
    >
      {processed}
    </ReactMarkdown>
  );
}

function formatTime(iso: string): string {
  let dateStr = iso;
  if (!/[Zz]$/.test(dateStr) && !/[+-]\d{2}:\d{2}$/.test(dateStr)) {
    dateStr = iso + "Z";
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return iso;
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function parseMeta(metadata: string): Record<string, unknown> {
  try { return JSON.parse(metadata || "{}"); }
  catch { return {}; }
}

function MessageBubble({ msg, kois }: { msg: PoolMessage; kois: KoiWithStats[] }) {
  const sender = kois.find((k) => k.id === msg.sender_id);
  const isPiscis = msg.sender_id === "piscis";
  const icon = isPiscis ? "🐋" : sender?.icon ?? "🐟";
  const color = isPiscis ? "#7c3aed" : sender?.color ?? "#6b7280";
  const name = isPiscis ? "小诺" : sender?.name ?? msg.sender_id;
  const meta = parseMeta(msg.metadata);

  return (
    <div className={`pool-msg pool-msg--${msg.msg_type}`}>
      <div className="pool-msg-bar" style={{ background: color }} />
      <div className="pool-msg-body">
        <div className="pool-msg-header">
          <span className="pool-msg-icon">{icon}</span>
          <span className="pool-msg-name" style={{ color }}>{name}</span>
          <span className="pool-msg-time">{formatTime(msg.created_at)}</span>
        </div>

        {msg.msg_type === "task_assign" ? (
          <div className="pool-msg-task-card">
            <div className="pool-msg-task-title">{(meta.title as string) || msg.content}</div>
            {typeof meta.priority === "string" && (
              <span className={`pool-msg-priority pool-msg-priority--${meta.priority}`}>
                {meta.priority}
              </span>
            )}
            {msg.todo_id && <span className="pool-msg-todo-link">📋 {msg.todo_id.slice(0, 8)}</span>}
            {!meta.title && <div className="pool-msg-text">{msg.content}</div>}
          </div>
        ) : msg.msg_type === "task_claimed" ? (
          <div className="pool-msg-event-line pool-msg-event--claimed">✋ {msg.content}</div>
        ) : msg.msg_type === "task_blocked" ? (
          <div className="pool-msg-event-line pool-msg-event--blocked">🚫 {msg.content}</div>
        ) : msg.msg_type === "task_done" ? (
          <div className="pool-msg-event-line pool-msg-event--done">✅ {msg.content}</div>
        ) : msg.msg_type === "status_update" ? (
          <div className="pool-msg-status-line"><PoolMessageContent content={msg.content} /></div>
        ) : msg.msg_type === "result" ? (
          <div className="pool-msg-result-card"><PoolMessageContent content={msg.content} /></div>
        ) : msg.msg_type === "mention" ? (
          <div className="pool-msg-mention"><PoolMessageContent content={msg.content} /></div>
        ) : (
          <div className="pool-msg-text"><PoolMessageContent content={msg.content} /></div>
        )}
      </div>
    </div>
  );
}

const INITIAL_LOAD_SIZE = 100;
const LAZY_LOAD_STEP = 10;

interface CollabProps {
  onNavigateToSchoolKoi?: () => void;
  visible?: boolean;
  embedded?: boolean;
  poolSessionId?: string | null;
}

export default function Collab({
  onNavigateToSchoolKoi,
  visible = true,
  embedded = false,
  poolSessionId = null,
}: CollabProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();

  const sessions = useSelector((s: RootState) => s.pool.sessions);
  const reduxActiveSessionId = useSelector((s: RootState) => s.pool.activeSessionId);
  const activeSessionId =
    embedded && poolSessionId ? poolSessionId : reduxActiveSessionId;
  const messagesBySession = useSelector((s: RootState) => s.pool.messagesBySession);
  const hasMoreBySession = useSelector((s: RootState) => s.pool.hasMoreBySession);
  const kois = useSelector((s: RootState) => s.koi.kois);

  const messages = activeSessionId ? messagesBySession[activeSessionId] ?? [] : [];
  const poolInputHistoryScope = activeSessionId ? `pool:${activeSessionId}` : null;
  const hasMore = activeSessionId ? hasMoreBySession[activeSessionId] ?? false : false;
  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId),
    [sessions, activeSessionId],
  );
  const projectDir = activeSession?.project_dir ?? null;
  const memberCount = activeSession?.member_koi_ids?.length ?? 0;

  const poolMembers = useMemo(() => {
    const ids = new Set(activeSession?.member_koi_ids ?? []);
    return kois.filter((k) => ids.has(k.id));
  }, [kois, activeSession]);

  const [loadingMore, setLoadingMore] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [capacity, setCapacity] = useState(POOL_DEFAULT_CAPACITY);
  const scrolledSessionRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const prevLastIdRef = useRef<number | null>(null);

  const [userInput, setUserInput] = useState("");
  const [mentionError, setMentionError] = useState("");
  const [sending, setSending] = useState(false);
  const [mentionFilter, setMentionFilter] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const mentionCandidates = useMemo(() => {
    const list: { name: string; icon: string; desc: string }[] = [];
    poolMembers.filter((k) => k.status !== "offline").forEach((k) => {
      list.push({ name: k.name, icon: k.icon || "🐡", desc: k.description || k.role });
    });
    return list;
  }, [poolMembers]);

  const filteredMentions = useMemo(() => {
    if (mentionFilter === null) return [];
    if (!mentionFilter) return mentionCandidates;
    const lower = mentionFilter.toLowerCase();
    const exact = mentionCandidates.filter((c) => c.name.toLowerCase() === lower);
    const partial = mentionCandidates.filter(
      (c) => c.name.toLowerCase().startsWith(lower) && c.name.toLowerCase() !== lower,
    );
    return [...exact, ...partial];
  }, [mentionCandidates, mentionFilter]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setUserInput(val);
    setMentionError("");
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const match = before.match(/(?:^|\s)@(\S*)$/);
    if (match) {
      setMentionFilter(match[1]);
      setMentionIndex(0);
    } else {
      setMentionFilter(null);
    }
  }, []);

  const insertMention = useCallback((name: string) => {
    const cursor = inputRef.current?.selectionStart ?? userInput.length;
    const before = userInput.slice(0, cursor);
    const after = userInput.slice(cursor);
    const replaced = before.replace(/@\S*$/, `@!${name} `);
    setUserInput(replaced + after);
    setMentionFilter(null);
    setTimeout(() => {
      const pos = replaced.length;
      inputRef.current?.setSelectionRange(pos, pos);
      inputRef.current?.focus();
    }, 0);
  }, [userInput]);

  const [contentView, setContentView] = useState<ContentView>("chat");
  const [taskPanelOpen, setTaskPanelOpen] = useState(true);
  const [taskPanelTab, setTaskPanelTab] = useState<TaskPanelTab>("artifacts");
  const [previewArtifact, setPreviewArtifact] = useState<SessionArtifact | null>(null);

  const selectTaskTab = useCallback((tab: TaskPanelTab) => {
    setTaskPanelTab((prev) => {
      if (prev === tab) {
        setTaskPanelOpen((open) => !open);
      } else {
        setTaskPanelOpen(true);
      }
      return tab;
    });
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      dispatch(poolActions.setLoading(true));
      const list = await poolApi.listSessions();
      dispatch(poolActions.setPoolSessions(list));
    } catch {
      // silently ignore
    } finally {
      dispatch(poolActions.setLoading(false));
    }
  }, [dispatch]);

  const loadMessages = useCallback(async (sessionId: string) => {
    try {
      const msgs = await poolApi.getMessages({ session_id: sessionId, limit: INITIAL_LOAD_SIZE });
      dispatch(poolActions.setPoolMessages({
        sessionId,
        messages: msgs,
        hasMore: msgs.length === INITIAL_LOAD_SIZE,
      }));
      if (msgs.length > 0) {
        prevLastIdRef.current = msgs[msgs.length - 1].id;
      }
    } catch {
      // silently ignore
    }
  }, [dispatch]);

  const scrollCancelRef = useRef<(() => void) | null>(null);

  const loadOlderMessages = useCallback(async (sessionId: string, currentCount: number) => {
    const msgs = await poolApi.getMessages({
      session_id: sessionId,
      limit: LAZY_LOAD_STEP,
      offset: currentCount,
    });
    if (msgs.length > 0) {
      dispatch(poolActions.prependPoolMessages({
        sessionId,
        messages: msgs,
        hasMore: msgs.length === LAZY_LOAD_STEP,
      }));
      setCapacity((c) => c + LAZY_LOAD_STEP);
    } else {
      dispatch(poolActions.prependPoolMessages({ sessionId, messages: [], hasMore: false }));
      scrollCancelRef.current?.();
    }
  }, [dispatch]);

  const scrollHistory = useScrollPrependedHistory({
    containerRef: messagesContainerRef,
    itemCount: messages.length,
    hasMore,
    setLoading: setLoadingMore,
    loadOlder: () => {
      if (!activeSessionId) return Promise.resolve();
      return loadOlderMessages(activeSessionId, messages.length);
    },
    active: Boolean(activeSessionId),
  });
  scrollCancelRef.current = scrollHistory.cancelPendingRestore;

  useEffect(() => {
    if (poolInputHistoryScope) {
      const texts = messages
        .filter((m) => m.sender_id === "piscis")
        .map((m) => m.content);
      seedInputHistory(poolInputHistoryScope, texts);
    }
  }, [poolInputHistoryScope, messages]);

  useEffect(() => {
    if (embedded && poolSessionId && visible) {
      dispatch(poolActions.setActivePoolSession(poolSessionId));
    }
  }, [embedded, poolSessionId, visible, dispatch]);

  useEffect(() => {
    loadSessions();
    if (kois.length === 0) {
      koiApi.list().then((list) => dispatch(koiActions.setKois(list))).catch(() => {});
    }
  }, [loadSessions, dispatch, kois.length]);

  const prevVisibleRef = useRef(false);
  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      loadSessions();
    }
    prevVisibleRef.current = visible;
  }, [visible, loadSessions]);

  useEffect(() => {
    if (mentionFilter === null) return;
    const activeEl = document.querySelector(".collab-mention-item.active");
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" });
    }
  }, [mentionIndex, mentionFilter]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<{ id: string; status: string }>("koi_status_changed", () => {
      koiApi.list().then((list) => dispatch(koiActions.setKois(list))).catch(() => {});
    }).then((fn) => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, [dispatch]);

  useEffect(() => {
    if (!activeSessionId) return;
    setUnreadCount(0);
    setCapacity(POOL_DEFAULT_CAPACITY);
    prevLastIdRef.current = null;
    scrolledSessionRef.current = null;
    loadMessages(activeSessionId);

    let unlisten: (() => void) | null = null;
    poolApi.onMessage(activeSessionId, (msg) => {
      dispatch(poolActions.appendPoolMessage(msg));
    }).then((fn) => { unlisten = fn; });

    return () => { unlisten?.(); };
  }, [activeSessionId, loadMessages, dispatch]);

  useEffect(() => {
    if (contentView !== "chat") {
      scrolledSessionRef.current = null;
    }
  }, [contentView]);

  useEffect(() => {
    if (contentView !== "chat") return;
    if (!activeSessionId || messages.length === 0) return;
    const pinKey = `${activeSessionId}|${contentView}`;
    if (scrolledSessionRef.current === pinKey) return;
    const el = messagesContainerRef.current;
    if (!el) return;

    const sessionAtStart = activeSessionId;
    let cancelled = false;

    const pin = () => {
      if (cancelled) return;
      if (scrolledSessionRef.current === pinKey) return;
      if (activeSessionId !== sessionAtStart) return;
      el.scrollTop = el.scrollHeight;
    };

    requestAnimationFrame(pin);
    const ro = new ResizeObserver(() => pin());
    ro.observe(el);
    Array.from(el.children).forEach((child) => ro.observe(child as Element));

    const finalize = window.setTimeout(() => {
      cancelled = true;
      ro.disconnect();
      if (scrolledSessionRef.current !== pinKey && activeSessionId === sessionAtStart) {
        el.scrollTop = el.scrollHeight;
      }
      scrolledSessionRef.current = pinKey;
    }, 600);

    return () => {
      cancelled = true;
      ro.disconnect();
      window.clearTimeout(finalize);
    };
  }, [activeSessionId, messages.length, contentView]);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el || messages.length === 0) return;
    const lastId = messages[messages.length - 1].id;
    const isAppend = lastId !== prevLastIdRef.current && prevLastIdRef.current !== null;
    prevLastIdRef.current = lastId;
    if (!isAppend) return;

    if (activeSessionId && messages.length > capacity) {
      dispatch(poolActions.trimPoolMessages({ sessionId: activeSessionId, capacity }));
    }

    const scrollable = el.scrollHeight - el.clientHeight;
    const nearBottom = scrollable <= 0 || el.scrollTop >= scrollable * 0.9;
    if (nearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setUnreadCount(0);
    } else {
      setUnreadCount((n) => n + 1);
    }
  }, [messages, capacity, activeSessionId, dispatch]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setUnreadCount(0);
  }, []);

  const handleMessagesScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const scrollable = el.scrollHeight - el.clientHeight;
    const nearBottom = scrollable <= 0 || el.scrollTop >= scrollable * 0.9;
    if (nearBottom) setUnreadCount(0);
    scrollHistory.handleScroll(e);
  }, [scrollHistory]);

  useEffect(() => {
    let unlistenCreated: (() => void) | null = null;
    let unlistenUpdated: (() => void) | null = null;

    listen<PoolSessionSnapshot>("pool_session_created", (e) => {
      dispatch(poolActions.upsertPoolSession(poolSessionFromWire(e.payload)));
    }).then((fn) => { unlistenCreated = fn; });

    listen<PoolSessionSnapshot & { id: string; status: string }>("pool_session_updated", (e) => {
      const payload = e.payload;
      if (payload.name) {
        dispatch(poolActions.upsertPoolSession(poolSessionFromWire(payload)));
      } else {
        dispatch(poolActions.updatePoolSessionStatus({ id: payload.id, status: payload.status }));
      }
    }).then((fn) => { unlistenUpdated = fn; });

    return () => {
      unlistenCreated?.();
      unlistenUpdated?.();
    };
  }, [dispatch]);

  useEffect(() => {
    if (contentView === "board" && activeSessionId) {
      dispatch(boardActions.setFilterSessionId(activeSessionId));
    }
  }, [contentView, activeSessionId, dispatch]);

  const handleSendMessage = async () => {
    const text = userInput.trim();
    if (!text || !activeSessionId) return;
    if (containsDelegatedPiscisMention(text)) {
      setMentionError(t("pool.noDelegateSelfPiscis"));
      setTimeout(() => setMentionError(""), 8000);
      return;
    }
    if (!hasMentions(text)) {
      setMentionError(t("pool.mustMention"));
      setTimeout(() => setMentionError(""), 5000);
      return;
    }
    setSending(true);
    setMentionError("");
    try {
      const mentions = parseMentions(text);
      const metadata = mentions.includes("all") ? "all" : mentions.join(",");
      await poolApi.sendMessage({
        session_id: activeSessionId,
        sender_id: "piscis",
        content: text,
        msg_type: "mention",
        metadata,
      });
      if (poolInputHistoryScope) pushInputHistory(poolInputHistoryScope, text);
      if (poolInputHistoryScope) resetInputHistoryNav(poolInputHistoryScope);
      setUserInput("");
    } catch (e) {
      console.error("[Collab] send message error:", e);
      const msg = typeof e === "string" ? e : e instanceof Error ? e.message : String(e);
      setMentionError(msg);
      setTimeout(() => setMentionError(""), 8000);
    } finally {
      setSending(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionFilter !== null) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionIndex((i) => Math.min(i + 1, filteredMentions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setMentionFilter(null);
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const target = filteredMentions[mentionIndex];
        if (target) insertMention(target.name);
        return;
      }
    }
    if (poolInputHistoryScope && handleInputHistoryKeyDown(e, poolInputHistoryScope, setUserInput)) {
      return;
    }
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (poolInputHistoryScope) resetInputHistoryNav(poolInputHistoryScope);
      handleSendMessage();
    }
  };

  const taskTabs: { id: TaskPanelTab; label: string; count?: number; cornerBadge?: boolean }[] = [
    { id: "artifacts", label: t("team.tab.artifacts") },
    { id: "members", label: t("team.tab.members"), count: memberCount + 1, cornerBadge: true },
    { id: "spec", label: t("team.tab.spec") },
  ];

  const handlePreviewFile = useCallback((absPath: string, name: string) => {
    setPreviewArtifact({
      id: absPath,
      session_id: activeSessionId ?? "",
      name,
      artifact_type: "file",
      uri: absPath,
      content_summary: "",
      created_at: new Date().toISOString(),
    });
  }, [activeSessionId]);

  return (
    <div className={`collab${embedded ? " collab-embedded" : ""}${previewArtifact ? " has-preview" : ""}`}>
      <div className="collab-center">
        {activeSessionId && (
          <div className="collab-topbar">
            <span className="collab-session-name">{activeSession?.name}</span>
            <div className="chat-topbar-tasks collab-topbar-tabs" role="tablist" aria-label={t("team.panelTabs")}>
              {taskTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  className={`chat-topbar-task-tab${taskPanelTab === tab.id && taskPanelOpen ? " active" : ""}${tab.cornerBadge ? " has-corner-badge" : ""}`}
                  onClick={() => selectTaskTab(tab.id)}
                  role="tab"
                  aria-selected={taskPanelTab === tab.id}
                >
                  {tab.label}
                  {tab.count != null && tab.count > 0 && tab.cornerBadge && (
                    <span className="chat-topbar-corner-badge">{tab.count}</span>
                  )}
                  {tab.count != null && tab.count > 0 && !tab.cornerBadge && (
                    <span className="chat-topbar-task-count">{tab.count}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {activeSessionId && taskPanelOpen && (
          <div className="session-task-panel collab-task-panel">
            <div className="session-task-panel-content">
              {taskPanelTab === "artifacts" && (
                <TeamProjectFilesPanel
                  projectDir={projectDir}
                  onPreviewFile={handlePreviewFile}
                />
              )}
              {taskPanelTab === "members" && activeSessionId && (
                <MembersPanel
                  sessionId={activeSessionId}
                  activeSession={activeSession}
                  onNavigateToSchoolKoi={onNavigateToSchoolKoi}
                />
              )}
              {taskPanelTab === "spec" && activeSessionId && (
                <OrgSpecPanel
                  sessionId={activeSessionId}
                  activeSession={activeSession}
                  onSaved={loadSessions}
                />
              )}
            </div>
          </div>
        )}

        <div className="collab-main-view">
          {contentView === "chat" && (
            <>
              <div className="collab-chat-area">
                {!activeSessionId ? (
                  <div className="collab-empty">
                    <span className="collab-empty-icon">💬</span>
                    <p>{t("team.selectTask")}</p>
                  </div>
                ) : messages.length === 0 ? (
                  <div className="collab-empty">
                    <span className="collab-empty-icon">💬</span>
                    <p>{t("pool.noMessages")}</p>
                  </div>
                ) : (
                  <div className="collab-messages-scroll" ref={messagesContainerRef} onScroll={handleMessagesScroll}>
                    {hasMore && (
                      <button
                        type="button"
                        className="chatpool-load-more-btn"
                        disabled={loadingMore}
                        onClick={() => scrollHistory.loadOlder()}
                      >
                        {loadingMore ? t("common.loading") : t("common.loadMore")}
                      </button>
                    )}
                    {messages.map((msg) => (
                      <MessageBubble key={msg.id} msg={msg} kois={kois} />
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                )}
                {unreadCount > 0 && (
                  <button type="button" className="chatpool-unread-badge" onClick={scrollToBottom}>
                    ↓ {t("chat.unreadMessages", { count: unreadCount })}
                  </button>
                )}
              </div>
              <div className="collab-input-area">
                {mentionError && <div className="collab-mention-error">{mentionError}</div>}
                {mentionFilter !== null && filteredMentions.length > 0 && (
                  <div className="collab-mention-dropdown">
                    {filteredMentions.map((m, i) => (
                      <div
                        key={m.name}
                        className={`collab-mention-item${i === mentionIndex ? " active" : ""}`}
                        onMouseDown={(e) => { e.preventDefault(); insertMention(m.name); }}
                        onMouseEnter={() => setMentionIndex(i)}
                      >
                        <span className="collab-mention-icon">{m.icon}</span>
                        <span className="collab-mention-name">@!{m.name}</span>
                        <span className="collab-mention-desc">{m.desc}</span>
                      </div>
                    ))}
                    <div className="collab-mention-hint">
                      ↑↓ {t("common.navigate")} &nbsp; Enter {t("common.select")} &nbsp; Esc {t("common.dismiss")}
                    </div>
                  </div>
                )}
                <div className="collab-input-row">
                  <textarea
                    className="collab-input"
                    ref={inputRef}
                    value={userInput}
                    onChange={handleInputChange}
                    onKeyDown={handleInputKeyDown}
                    placeholder={t("pool.messageInputPlaceholder")}
                    rows={3}
                    disabled={!activeSessionId || sending}
                  />
                  <button
                    type="button"
                    className="chatpool-btn chatpool-btn-primary"
                    onClick={handleSendMessage}
                    disabled={sending || !userInput.trim() || !activeSessionId}
                    title={t("pool.sendShortcut")}
                  >
                    {sending ? "..." : t("common.send")}
                  </button>
                </div>
              </div>
            </>
          )}

          {contentView === "board" && <Board />}

          {contentView === "inbox" && (
            <PiscisInbox mode="coordination" poolSessionId={activeSessionId} />
          )}

          {contentView === "koiObserver" && (
            <PiscisInbox mode="koiObserver" poolSessionId={activeSessionId} />
          )}
        </div>
      </div>

      {previewArtifact && (
        <ChatRightPanel
          artifact={previewArtifact}
          onClose={() => setPreviewArtifact(null)}
        />
      )}

      <div className="collab-right">
        <div className="collab-right-icons">
          {VIEW_ORDER.map((view) => (
            <button
              key={view}
              type="button"
              className={`collab-right-icon${contentView === view ? " active" : ""}`}
              onClick={() => setContentView(view)}
              title={t(VIEW_I18N_KEY[view])}
            >
              <span className="activity-icon">{VIEW_ICONS[view]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
