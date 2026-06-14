import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { chatApi, sessionsApi, type AgentEventType } from "../../../services/tauri/chat";
import { isIdeAgentSession } from "../../../utils/session";
import "./IDE.css";

const FILE_MUTATION_TOOLS = new Set(["file_write", "file_read", "shell", "powershell"]);

type IdeAgentPanelProps = {
  projectDir: string | null;
  poolSessionId: string | null;
  width?: number;
  onWorkspaceFilesChanged?: () => void;
};

export default function IdeAgentPanel({
  projectDir,
  poolSessionId: _poolSessionId,
  width = 360,
  onWorkspaceFilesChanged,
}: IdeAgentPanelProps) {
  const { t } = useTranslation();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<Array<{ kind: string; text: string }>>([]);
  const [sending, setSending] = useState(false);
  const unlistenRef = useRef<(() => void) | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const ensureSession = useCallback(async (): Promise<string | null> => {
    if (!projectDir) return null;
    const title = `IDE Agent — ${projectDir.split(/[\\/]/).pop() ?? projectDir}`;
    try {
      const { sessions } = await sessionsApi.list(200);
      const existing = sessions.find(
        (s) => (s.source === "ide_agent" || isIdeAgentSession(s)) && s.workspace_root === projectDir,
      );
      if (existing) {
        setSessionId(existing.id);
        return existing.id;
      }
      const session = await sessionsApi.create(title, "ide_agent");
      await sessionsApi.setWorkspace(session.id, projectDir);
      setSessionId(session.id);
      return session.id;
    } catch (e) {
      console.error("IDE agent session error:", e);
      return null;
    }
  }, [projectDir]);

  useEffect(() => {
    void ensureSession();
  }, [ensureSession]);

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    chatApi.onEvent(sessionId, (evt: AgentEventType) => {
      if (cancelled) return;
      if (evt.type === "text_delta") {
        setLines((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.kind === "assistant") {
            next[next.length - 1] = { ...last, text: last.text + evt.delta };
          } else {
            next.push({ kind: "assistant", text: evt.delta });
          }
          return next;
        });
      }
      if (evt.type === "tool_end" && !evt.is_error && FILE_MUTATION_TOOLS.has(evt.name)) {
        onWorkspaceFilesChanged?.();
      }
    }).then((fn) => { unlistenRef.current = fn; });
    return () => {
      cancelled = true;
      unlistenRef.current?.();
    };
  }, [sessionId, onWorkspaceFilesChanged]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [lines]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput("");
    setLines((prev) => [...prev, { kind: "user", text }]);
    try {
      const sid = sessionId ?? (await ensureSession());
      if (!sid) return;
      await chatApi.send(sid, text, { mode: "craft" });
    } catch (e) {
      setLines((prev) => [...prev, { kind: "error", text: String(e) }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <aside className="ide-agent-panel" style={{ width }}>
      <div className="ide-agent-head">{t("team.ideAgent")}</div>
      <div className="ide-agent-messages" ref={scrollRef}>
        {lines.length === 0 && (
          <div className="ide-agent-empty">{t("team.ideAgentHint")}</div>
        )}
        {lines.map((line, i) => (
          <div key={i} className={`ide-agent-line ide-agent-${line.kind}`}>{line.text}</div>
        ))}
      </div>
      <div className="ide-agent-composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("chat.inputPlaceholder")}
          rows={3}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button type="button" className="btn btn-primary" disabled={sending || !input.trim()} onClick={() => void send()}>
          {t("common.send")}
        </button>
      </div>
    </aside>
  );
}
