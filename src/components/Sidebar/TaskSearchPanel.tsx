import { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import { useTranslation } from "react-i18next";
import { MessageSquare } from "lucide-react";
import type { RootState } from "../../store";
import { isTaskListSession } from "../../utils/session";
import RoundedSearch from "../ui/RoundedSearch";

export type TaskSearchPanelProps = {
  onSelectChat: (id: string) => void;
};

export default function TaskSearchPanel({ onSelectChat }: TaskSearchPanelProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const sessions = useSelector((s: RootState) => s.sessions.sessions);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions
      .filter((s) => isTaskListSession(s))
      .filter((s) => !q || (s.title || "").toLowerCase().includes(q))
      .map((s) => ({ id: s.id, title: s.title?.trim() || t("chat.newChat") }))
      .slice(0, 40);
  }, [sessions, query, t]);

  return (
    <div className="task-search-popover" role="dialog" aria-label={t("sidebar.searchTasks")}>
      <RoundedSearch
        value={query}
        onChange={setQuery}
        placeholder={t("sidebar.searchTasks")}
        size="sm"
        autoFocus
      />
      <div className="task-search-results">
        {results.length === 0 ? (
          <div className="task-search-empty">{t("sidebar.searchEmpty")}</div>
        ) : (
          results.map((r) => (
            <button
              key={r.id}
              type="button"
              className="task-search-item"
              onClick={() => onSelectChat(r.id)}
            >
              <MessageSquare size={14} />
              <span>{r.title}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
