import { useMemo, useState, useRef, useEffect, useLayoutEffect, useCallback, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { useSelector, useDispatch } from "react-redux";
import { useTranslation } from "react-i18next";
import { MessageSquare, Pin, PinOff, MoreHorizontal, Users, FolderOpen, Pencil, Archive, Trash2 } from "lucide-react";
import type { RootState } from "../../store";
import { sessionsActions } from "../../store";
import { sessionsApi, openPath } from "../../services/tauri";
import { isTaskListSession } from "../../utils/session";
import { parseUtcTimestamp } from "../../utils/parseTimestamp";
import { taskMatchesDateFilter, type TaskDateFilter } from "./taskFilters";
import ConfirmDialog from "../ConfirmDialog";
import "./Sidebar.css";

export type UnifiedTask = {
  id: string;
  title: string;
  updatedAt: number;
  pinned?: boolean;
  workspace?: string | null;
  isTeam?: boolean;
};

export type TaskListProps = {
  activeChatSessionId: string | null;
  activeTab: string;
  dateFilter: TaskDateFilter;
  onSelectChat: (id: string) => void;
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

type TaskMenuLayout = {
  taskId: string;
  top: number;
  right: number;
  maxHeight: number;
  placement: "below" | "above";
};

const TASK_MENU_GAP = 6;
const TASK_MENU_ROW_HEIGHT = 33;
const TASK_MENU_PADDING = 8;
const TASK_MENU_DIVIDER = 9;

function estimateTaskMenuHeight(hasWorkspace: boolean): number {
  const rows = (hasWorkspace ? 1 : 0) + 4;
  return rows * TASK_MENU_ROW_HEIGHT + TASK_MENU_DIVIDER + TASK_MENU_PADDING;
}

function computeTaskMenuLayout(
  button: HTMLElement,
  menuHeight: number,
): Omit<TaskMenuLayout, "taskId"> {
  const buttonRect = button.getBoundingClientRect();
  const scrollEl = button.closest(".sidebar-scroll");
  const accountBar = document.querySelector(".account-bar");

  const boundaryTop = (scrollEl?.getBoundingClientRect().top ?? 0) + 4;
  const boundaryBottom = accountBar
    ? accountBar.getBoundingClientRect().top - 4
    : window.innerHeight - 8;

  const spaceBelow = boundaryBottom - buttonRect.bottom - TASK_MENU_GAP;
  const spaceAbove = buttonRect.top - boundaryTop - TASK_MENU_GAP;

  const placement: "below" | "above" =
    spaceBelow >= menuHeight || spaceBelow >= spaceAbove ? "below" : "above";

  const maxHeight = Math.max(
    80,
    Math.min(menuHeight, placement === "below" ? spaceBelow : spaceAbove),
  );

  const top =
    placement === "below"
      ? buttonRect.bottom + TASK_MENU_GAP
      : buttonRect.top - TASK_MENU_GAP;

  return {
    top,
    right: window.innerWidth - buttonRect.right,
    maxHeight,
    placement,
  };
}

export default function TaskList({
  activeChatSessionId,
  activeTab,
  dateFilter,
  onSelectChat,
}: TaskListProps) {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const sessions = useSelector((s: RootState) => s.sessions.sessions);
  const [menuLayout, setMenuLayout] = useState<TaskMenuLayout | null>(null);
  const [renameTarget, setRenameTarget] = useState<UnifiedTask | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<UnifiedTask | null>(null);
  const menuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const menuMeasuredRef = useRef<string | null>(null);

  const closeMenu = useCallback(() => {
    setMenuLayout(null);
    menuAnchorRef.current = null;
    menuMeasuredRef.current = null;
  }, []);

  useEffect(() => {
    if (!menuLayout) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuAnchorRef.current?.contains(target) || menuPanelRef.current?.contains(target)) return;
      closeMenu();
    };
    const onDismiss = () => closeMenu();
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("resize", onDismiss);
    window.addEventListener("scroll", onDismiss, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("resize", onDismiss);
      window.removeEventListener("scroll", onDismiss, true);
    };
  }, [menuLayout, closeMenu]);

  useLayoutEffect(() => {
    if (!menuLayout || !menuAnchorRef.current || !menuPanelRef.current) return;
    if (menuMeasuredRef.current === menuLayout.taskId) return;
    const measured = menuPanelRef.current.offsetHeight;
    if (measured <= 0) return;
    menuMeasuredRef.current = menuLayout.taskId;
    const refined = computeTaskMenuLayout(menuAnchorRef.current, measured);
    setMenuLayout((prev) => (prev ? { ...prev, ...refined } : prev));
  }, [menuLayout]);

  const tasks = useMemo<UnifiedTask[]>(() => {
    return sessions
      .filter((s) => isTaskListSession(s))
      .map((s) => ({
        id: s.id,
        title: s.title?.trim() || t("chat.newChat"),
        updatedAt: parseUtcTimestamp(s.updated_at || s.created_at),
        pinned: Boolean(s.pinned_at),
        workspace: s.workspace_root,
        isTeam: Boolean(s.pool_session_id) || s.source === "team",
      }))
      .filter((task) => taskMatchesDateFilter(task.updatedAt, dateFilter))
      .sort((a, b) => {
        const ap = a.pinned ? 1 : 0;
        const bp = b.pinned ? 1 : 0;
        if (ap !== bp) return bp - ap;
        return b.updatedAt - a.updatedAt;
      });
  }, [sessions, t, dateFilter]);

  const runMenuAction = async (task: UnifiedTask, action: string) => {
    closeMenu();
    try {
      if (action === "folder" && task.workspace) await openPath(task.workspace);
      if (action === "rename") {
        setRenameTarget(task);
        setRenameValue(task.title);
        return;
      }
      if (action === "pin") {
        await sessionsApi.pin(task.id);
        const { sessions: fresh } = await sessionsApi.list(200);
        dispatch(sessionsActions.setSessions(fresh));
      }
      if (action === "unpin") {
        await sessionsApi.unpin(task.id);
        const { sessions: fresh } = await sessionsApi.list(200);
        dispatch(sessionsActions.setSessions(fresh));
      }
      if (action === "archive") {
        await sessionsApi.archive(task.id);
        dispatch(sessionsActions.removeSession(task.id));
        dispatch(sessionsActions.notifyArchivedTasksChanged());
      }
      if (action === "delete") setDeleteTarget(task);
    } catch (e) {
      console.error("Task action error:", e);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await sessionsApi.delete(deleteTarget.id);
      dispatch(sessionsActions.removeSession(deleteTarget.id));
    } finally {
      setDeleteTarget(null);
    }
  };

  const confirmRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await sessionsApi.rename(renameTarget.id, renameValue.trim());
      dispatch(sessionsActions.updateSessionTitle({ id: renameTarget.id, title: renameValue.trim() }));
    } finally {
      setRenameTarget(null);
    }
  };

  if (tasks.length === 0) {
    return <div className="task-list-empty">{t("tasks.empty")}</div>;
  }

  const openMenuTask = menuLayout ? tasks.find((task) => task.id === menuLayout.taskId) : null;

  const openTaskMenu = (task: UnifiedTask, e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (menuLayout?.taskId === task.id) {
      closeMenu();
      return;
    }
    const button = e.currentTarget;
    menuAnchorRef.current = button;
    menuMeasuredRef.current = null;
    setMenuLayout({
      taskId: task.id,
      ...computeTaskMenuLayout(button, estimateTaskMenuHeight(Boolean(task.workspace))),
    });
  };

  return (
    <>
      <div className="task-list">
        {tasks.map((task) => {
          const isActive = activeTab === "chat" && task.id === activeChatSessionId;
          return (
            <div key={task.id} className={`task-item-row ${isActive ? "active" : ""}`}>
              <button
                type="button"
                className="task-item"
                onClick={() => onSelectChat(task.id)}
              >
                <span className="task-item-icon">
                  {task.pinned && <Pin size={10} strokeWidth={2} className="task-pin" aria-hidden />}
                  <span className="task-item-type-icon" aria-hidden>
                    {task.isTeam ? (
                      <Users size={14} strokeWidth={1.5} />
                    ) : (
                      <MessageSquare size={14} strokeWidth={1.5} />
                    )}
                  </span>
                </span>
                <span className="task-item-title">{task.title}</span>
                <span className="task-item-time">{timeAgo(task.updatedAt, t)}</span>
              </button>
              <div
                className={`task-item-menu-wrap${menuLayout?.taskId === task.id ? " is-open" : ""}`}
              >
                <button
                  type="button"
                  className="task-item-menu-btn"
                  aria-label={t("tasks.moreActions")}
                  aria-expanded={menuLayout?.taskId === task.id}
                  onClick={(e) => openTaskMenu(task, e)}
                >
                  <MoreHorizontal size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {openMenuTask && menuLayout && createPortal(
        <div
          ref={menuPanelRef}
          className={`task-item-dropdown task-item-dropdown--fixed${menuLayout.placement === "above" ? " task-item-dropdown--above" : ""}`}
          role="menu"
          style={{
            top: menuLayout.top,
            right: menuLayout.right,
            maxHeight: menuLayout.maxHeight,
          }}
        >
          {openMenuTask.workspace && (
            <button type="button" onClick={() => void runMenuAction(openMenuTask, "folder")}>
              <FolderOpen size={14} strokeWidth={1.5} className="task-item-dropdown-icon" aria-hidden />
              <span>{t("tasks.openFolder")}</span>
            </button>
          )}
          <button type="button" onClick={() => void runMenuAction(openMenuTask, "rename")}>
            <Pencil size={14} strokeWidth={1.5} className="task-item-dropdown-icon" aria-hidden />
            <span>{t("tasks.rename")}</span>
          </button>
          <button type="button" onClick={() => void runMenuAction(openMenuTask, openMenuTask.pinned ? "unpin" : "pin")}>
            {openMenuTask.pinned ? (
              <PinOff size={14} strokeWidth={1.5} className="task-item-dropdown-icon" aria-hidden />
            ) : (
              <Pin size={14} strokeWidth={1.5} className="task-item-dropdown-icon" aria-hidden />
            )}
            <span>{openMenuTask.pinned ? t("tasks.unpin") : t("tasks.pin")}</span>
          </button>
          <button type="button" onClick={() => void runMenuAction(openMenuTask, "archive")}>
            <Archive size={14} strokeWidth={1.5} className="task-item-dropdown-icon" aria-hidden />
            <span>{t("tasks.archive")}</span>
          </button>
          <div className="task-item-menu-divider" role="separator" />
          <button type="button" className="danger" onClick={() => void runMenuAction(openMenuTask, "delete")}>
            <Trash2 size={14} strokeWidth={1.5} className="task-item-dropdown-icon" aria-hidden />
            <span>{t("tasks.delete")}</span>
          </button>
        </div>,
        document.body,
      )}

      {renameTarget && (
        <div className="koi-modal-overlay" onClick={() => setRenameTarget(null)} role="presentation">
          <div className="team-task-create-dialog" onClick={(e) => e.stopPropagation()} role="dialog">
            <div className="team-task-create-header">
              <span>{t("tasks.rename")}</span>
            </div>
            <input
              className="chatpool-input task-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void confirmRename();
                if (e.key === "Escape") setRenameTarget(null);
              }}
            />
            <div className="chatpool-new-actions">
              <button type="button" className="chatpool-btn chatpool-btn-secondary" onClick={() => setRenameTarget(null)}>
                {t("common.cancel")}
              </button>
              <button type="button" className="chatpool-btn chatpool-btn-primary" onClick={() => void confirmRename()}>
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <ConfirmDialog
          open
          title={t("tasks.delete")}
          message={t("tasks.deleteConfirm", { name: deleteTarget.title })}
          confirmLabel={t("common.delete")}
          variant="danger"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  );
}
