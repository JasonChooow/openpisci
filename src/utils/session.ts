/** Pond / IDE assistant CLI sessions (`source === "cli"` or legacy title prefix). */
export function isPondCliSession(
  session: { source?: string | null; title?: string | null } | undefined | null,
): boolean {
  if (!session) return false;
  if (session.source === "cli") return true;
  const title = session.title ?? "";
  return title.startsWith("Piscis CLI") || title === "Piscis CLI";
}

/** IDE-bound agent session — hidden from main task list. */
export function isIdeAgentSession(
  session: { source?: string | null } | undefined | null,
): boolean {
  return session?.source === "ide_agent";
}

/** Scheduled cron task run sessions (`source === "scheduled_task"` or id `sched_*`). */
export function isScheduledTaskSession(
  session: { source?: string | null; id?: string | null } | undefined | null,
): boolean {
  if (!session) return false;
  const id = session.id ?? "";
  return session.source === "scheduled_task" || id.startsWith("sched_");
}

/** IM channel sessions — shown only on Assistant page. */
export function isImSession(
  session: { source?: string | null; id?: string | null; title?: string | null } | undefined | null,
): boolean {
  if (!session || isInternalSession(session)) return false;
  if (isPondCliSession(session) || isScheduledTaskSession(session)) return false;
  return Boolean(session.source?.startsWith("im_"));
}

/** User-facing assistant chat tasks in sidebar task list. */
export function isTaskListSession(
  session: { source?: string | null; id?: string | null; title?: string | null; archived_at?: string | null } | undefined | null,
): boolean {
  if (!session || isInternalSession(session)) return false;
  if (isImSession(session) || isPondCliSession(session) || isIdeAgentSession(session)) return false;
  if (isScheduledTaskSession(session)) return false;
  if (session.archived_at) return false;
  return classifyMainChatSession(session) === "chat";
}

export type MainChatSessionKind = "chat" | "im" | "cli";

/** Classify a session for the main Chat sidebar tabs (mirrors Chat/index.tsx). */
export function classifyMainChatSession(
  session: { source?: string | null; id?: string | null; title?: string | null } | undefined | null,
): MainChatSessionKind {
  if (isInternalSession(session) || isScheduledTaskSession(session)) return "chat";
  if (isPondCliSession(session)) return "cli";
  if (isImSession(session)) return "im";
  if (!session?.source || session.source === "chat") return "chat";
  return "chat";
}

/** User-visible in the main Chat sidebar for the given filter tab. */
export function isMainChatVisibleSession(
  session: { source?: string | null; id?: string | null; title?: string | null } | undefined | null,
  filter: MainChatSessionKind = "chat",
): boolean {
  if (!session || isInternalSession(session)) return false;
  return classifyMainChatSession(session) === filter;
}

/** First non-internal session suitable as the main Chat active session. */
export function pickMainChatActiveSession(
  sessions: Array<{ source?: string | null; id?: string | null; title?: string | null }>,
  filter: MainChatSessionKind = "chat",
): string | null {
  return sessions.find((s) => isMainChatVisibleSession(s, filter))?.id ?? null;
}

/** Returns true for sessions that are internal/system and should not appear in the
 *  user-facing session list (heartbeat, piscis_inbox, pool coordinators, etc.). */
export function isInternalSession(session: { source?: string | null; id?: string | null } | undefined | null): boolean {
  if (!session) return false;
  const id = session.id ?? "";
  return session.source === "heartbeat"
    || session.source === "heartbeat_pool"
    || session.source === "scheduled_task"
    || session.source === "piscis_inbox_global"
    || session.source === "piscis_inbox_pool"
    || session.source === "piscis_internal"
    || session.source === "ide_agent"
    || session.source === "piscis_pool"
    || session.source === "piscis_heartbeat_global"
    || session.source === "piscis_heartbeat_pool"
    || session.id === "heartbeat"
    || session.id === "piscis_inbox_global"
    || id.startsWith("piscis_pool_")
    || id.startsWith("koi_runtime_")
    || id.startsWith("koi_notify_")
    || id.startsWith("koi_")
    || id.startsWith("sched_");
}
