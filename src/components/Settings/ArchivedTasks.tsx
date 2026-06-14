import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDispatch, useSelector } from "react-redux";
import { MessageSquare, Users } from "lucide-react";
import { sessionsApi, poolApi } from "../../services/tauri";
import { sessionsActions, poolActions, type RootState } from "../../store";
import type { Session } from "../../services/tauri";
import type { PoolSession } from "../../services/tauri";

type ArchivedItem = {
  id: string;
  kind: "chat" | "pool";
  title: string;
  archivedAt?: string;
};

export default function ArchivedTasks() {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const archivedTasksRevision = useSelector((s: RootState) => s.sessions.archivedTasksRevision);
  const [items, setItems] = useState<ArchivedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const loadedOnceRef = useRef(false);

  const refresh = useCallback(async () => {
    if (!loadedOnceRef.current) setLoading(true);
    try {
      const [{ sessions }, pools] = await Promise.all([
        sessionsApi.listArchived(200),
        poolApi.listSessions(),
      ]);
      const chatItems: ArchivedItem[] = sessions.map((s: Session) => ({
        id: s.id,
        kind: "chat",
        title: s.title?.trim() || t("chat.newChat"),
        archivedAt: s.archived_at ?? undefined,
      }));
      const poolItems: ArchivedItem[] = pools
        .filter((p: PoolSession) => p.status === "archived")
        .map((p) => ({
          id: p.id,
          kind: "pool",
          title: p.name?.trim() || p.id,
        }));
      setItems([...chatItems, ...poolItems]);
      loadedOnceRef.current = true;
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void refresh();
  }, [refresh, archivedTasksRevision]);

  const restore = async (item: ArchivedItem) => {
    if (item.kind === "chat") {
      await sessionsApi.restore(item.id);
      const { sessions } = await sessionsApi.list(200);
      dispatch(sessionsActions.setSessions(sessions));
    } else {
      await poolApi.resumeSession(item.id);
      const pools = await poolApi.listSessions();
      dispatch(poolActions.setPoolSessions(pools));
    }
    dispatch(sessionsActions.notifyArchivedTasksChanged());
  };

  const remove = async (item: ArchivedItem) => {
    if (item.kind === "chat") {
      await sessionsApi.delete(item.id);
    } else {
      await poolApi.deleteSession(item.id);
    }
    dispatch(sessionsActions.notifyArchivedTasksChanged());
  };

  if (loading) return <div className="archived-tasks-empty">{t("common.loading")}</div>;
  if (items.length === 0) return <div className="archived-tasks-empty">{t("archive.empty")}</div>;

  return (
    <div className="archived-tasks">
      <p className="archived-tasks-intro">{t("archive.intro")}</p>
      {items.map((item) => (
        <div key={`${item.kind}-${item.id}`} className="archived-task-row">
          <span className="archived-task-icon">
            {item.kind === "chat" ? <MessageSquare size={14} /> : <Users size={14} />}
          </span>
          <span className="archived-task-title">{item.title}</span>
          <div className="archived-task-actions">
            <button type="button" className="btn btn-secondary" onClick={() => void restore(item)}>
              {t("archive.restore")}
            </button>
            <button type="button" className="btn btn-secondary danger" onClick={() => void remove(item)}>
              {t("archive.deletePermanently")}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
