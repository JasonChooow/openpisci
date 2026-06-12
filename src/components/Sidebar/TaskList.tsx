import { useMemo } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { MessageSquare, Users } from "lucide-react";
import type { RootState } from "../../store";
import { classifyMainChatSession, isInternalSession } from "../../utils/session";
import "./Sidebar.css";

export type UnifiedTask = {
  id: string;
  kind: "chat" | "pool";
  title: string;
  updatedAt: number;
  status?: string;
};

export type TaskListProps = {
  activeChatSessionId: string | null;
  activePoolSessionId: string | null;
  activeTab: string;
  onSelectChat: (id: string) => void;
  onSelectPool: (id: string) => void;
};

function timeAgo(ts: number, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return t("tasks.justNow");
  if (min < 60) return t("tasks.minutesAgo", { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t("tasks.hoursAgo", { n: hr });
  const day = Math.floor(hr / 24);
  return t("tasks.daysAgo", { n: day });
}

export default function TaskList({
  activeChatSessionId,
  activePoolSessionId,
  activeTab,
  onSelectChat,
  onSelectPool,
}: TaskListProps) {
  const { t } = useTranslation();
  const sessions = useSelector((s: RootState) => s.sessions.sessions);
  const poolSessions = useSelector((s: RootState) => s.pool.sessions);

  const tasks = useMemo<UnifiedTask[]>(() => {
    const chatTasks: UnifiedTask[] = sessions
      .filter((s) => !isInternalSession(s) && classifyMainChatSession(s) === "chat")
      .map((s) => ({
        id: s.id,
        kind: "chat" as const,
        title: s.title?.trim() || t("chat.newChat"),
        updatedAt: Date.parse(s.updated_at || s.created_at || "") || 0,
      }));
    const poolTasks: UnifiedTask[] = poolSessions.map((p) => ({
      id: p.id,
      kind: "pool" as const,
      title: p.name?.trim() || p.id,
      updatedAt: Date.parse((p as { updated_at?: string }).updated_at || (p as { created_at?: string }).created_at || "") || 0,
      status: p.status,
    }));
    return [...chatTasks, ...poolTasks].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [sessions, poolSessions, t]);

  if (tasks.length === 0) {
    return <div className="task-list-empty">{t("tasks.empty")}</div>;
  }

  return (
    <div className="task-list">
      {tasks.map((task) => {
        const isActive =
          task.kind === "chat"
            ? activeTab === "chat" && task.id === activeChatSessionId
            : activeTab === "pond" && task.id === activePoolSessionId;
        return (
          <button
            key={`${task.kind}-${task.id}`}
            className={`task-item${isActive ? " active" : ""}`}
            onClick={() => (task.kind === "chat" ? onSelectChat(task.id) : onSelectPool(task.id))}
            title={task.title}
          >
            <span className={`task-item-icon task-item-${task.kind}`}>
              {task.kind === "chat" ? (
                <MessageSquare size={15} strokeWidth={1.5} />
              ) : (
                <Users size={15} strokeWidth={1.5} />
              )}
            </span>
            <span className="task-item-body">
              <span className="task-item-title">{task.title}</span>
              <span className="task-item-meta">
                {task.kind === "pool" ? t("tasks.kindPool") : t("tasks.kindChat")}
                {task.updatedAt ? ` · ${timeAgo(task.updatedAt, t)}` : ""}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
