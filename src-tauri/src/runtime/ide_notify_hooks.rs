//! Agent hooks that journal file edits and notify the IDE file tree / git panel.
//!
//! `notify` watchers can miss same-process writes on some platforms; emitting
//! `ide-file-changed` after successful `file_write` / `file_edit` keeps the
//! Pond IDE explorer and git status in sync when Piscis runs from the CLI panel.

use std::sync::Arc;

use async_trait::async_trait;
use once_cell::sync::Lazy;
use piscis_kernel::agent::file_journal::FileJournal;
use piscis_kernel::agent::hooks::{AgentHooks, ContextHookEvent, HookDecision, ToolHookEvent};
use piscis_kernel::agent::tool::ToolResult;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, SystemTime};

use tauri::{AppHandle, Emitter, Manager};

const FILE_TOOLS: &[&str] = &["file_write", "file_edit"];
const INDIRECT_ARTIFACT_TOOLS: &[&str] = &[
    "shell",
    "powershell",
    "powershell_query",
    "code_run",
    "office",
];
const COMPACTION_CONSOLIDATION_THRESHOLD: u32 = 3;
const MAX_INDIRECT_ARTIFACTS_PER_TOOL: usize = 20;

static SESSION_COMPACTION_COUNTS: Lazy<Mutex<HashMap<String, u32>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));
static TOOL_START_TIMES: Lazy<Mutex<HashMap<String, SystemTime>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

/// Wraps [`FileJournal`] and broadcasts IDE refresh events after file mutations.
pub struct JournalWithIdeNotify {
    journal: Arc<FileJournal>,
    app: AppHandle,
    artifact_session_id: Option<String>,
}

impl JournalWithIdeNotify {
    pub fn new(journal: Arc<FileJournal>, app: AppHandle) -> Self {
        Self {
            journal,
            app,
            artifact_session_id: None,
        }
    }

    pub fn new_with_artifact_session(
        journal: Arc<FileJournal>,
        app: AppHandle,
        artifact_session_id: String,
    ) -> Self {
        Self {
            journal,
            app,
            artifact_session_id: Some(artifact_session_id),
        }
    }

    fn rel_path(workspace_root: &std::path::Path, raw: &str) -> Option<String> {
        let p = std::path::Path::new(raw);
        let rel = p
            .strip_prefix(workspace_root)
            .unwrap_or(p)
            .to_string_lossy()
            .replace('\\', "/");
        let rel = rel.trim_start_matches('/').to_string();
        if rel.is_empty() || rel == ".git" || rel.starts_with(".git/") {
            return None;
        }
        Some(rel)
    }

    fn artifact_path(workspace_root: &Path, raw: &str) -> Option<PathBuf> {
        let raw = raw.trim();
        if raw.is_empty() {
            return None;
        }
        let path = PathBuf::from(raw);
        let path = if path.is_absolute() {
            path
        } else {
            workspace_root.join(path)
        };
        let metadata = std::fs::metadata(&path).ok()?;
        if !metadata.is_file() {
            return None;
        }
        Some(std::fs::canonicalize(&path).unwrap_or(path))
    }

    fn artifact_type(path: &Path) -> &'static str {
        match path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase())
            .as_deref()
        {
            Some("png" | "jpg" | "jpeg" | "gif" | "webp" | "svg" | "bmp" | "ico" | "avif") => {
                "image"
            }
            Some("md" | "markdown" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "pdf") => {
                "document"
            }
            Some("html" | "htm") => "file",
            _ => "file",
        }
    }

    fn is_indirect_artifact_tool(tool_name: &str) -> bool {
        INDIRECT_ARTIFACT_TOOLS.contains(&tool_name)
    }

    fn is_candidate_artifact_path(path: &Path) -> bool {
        matches!(
            path.extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.to_ascii_lowercase())
                .as_deref(),
            Some(
                "md" | "markdown"
                    | "doc"
                    | "docx"
                    | "xls"
                    | "xlsx"
                    | "ppt"
                    | "pptx"
                    | "pdf"
                    | "html"
                    | "htm"
                    | "txt"
                    | "csv"
                    | "tsv"
                    | "json"
                    | "png"
                    | "jpg"
                    | "jpeg"
                    | "gif"
                    | "webp"
                    | "svg"
                    | "bmp"
            )
        )
    }

    fn should_skip_dir(path: &Path) -> bool {
        path.file_name()
            .and_then(|name| name.to_str())
            .map(|name| {
                matches!(
                    name.to_ascii_lowercase().as_str(),
                    ".git"
                        | ".piscis"
                        | "node_modules"
                        | "target"
                        | "dist"
                        | "build"
                        | ".vite"
                        | ".cache"
                )
            })
            .unwrap_or(false)
    }

    fn collect_recent_artifacts(
        dir: &Path,
        started_at: SystemTime,
        depth: usize,
        out: &mut Vec<(PathBuf, SystemTime)>,
    ) {
        if depth > 6 || Self::should_skip_dir(dir) {
            return;
        }
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        let threshold = started_at
            .checked_sub(Duration::from_secs(2))
            .unwrap_or(started_at);

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                Self::collect_recent_artifacts(&path, started_at, depth + 1, out);
                continue;
            }
            if !path.is_file() || !Self::is_candidate_artifact_path(&path) {
                continue;
            }
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            let Ok(modified) = metadata.modified() else {
                continue;
            };
            if modified >= threshold {
                out.push((path, modified));
            }
        }
    }

    fn emit_file_changed(&self, ev: &ToolHookEvent<'_>, kind: &str) {
        let Some(path) = ev
            .input
            .get("path")
            .and_then(|v| v.as_str())
            .and_then(|raw| Self::rel_path(ev.workspace_root, raw))
        else {
            return;
        };
        let project_dir = ev.workspace_root.to_string_lossy().to_string();
        let _ = self.app.emit(
            "ide-file-changed",
            serde_json::json!({
                "project_dir": project_dir,
                "path": path,
                "kind": kind,
            }),
        );
    }

    async fn register_artifact_path(&self, ev: &ToolHookEvent<'_>, path: PathBuf) {
        let Some(state) = self.app.try_state::<crate::store::AppState>() else {
            return;
        };

        let uri = path.to_string_lossy().to_string();
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("生成文件")
            .to_string();
        let artifact_type = Self::artifact_type(&path);
        let metadata_json = serde_json::json!({
            "auto_registered": true,
            "workspace_root": ev.workspace_root.to_string_lossy(),
            "path": uri,
        })
        .to_string();

        let session_id = self.artifact_session_id.as_deref().unwrap_or(ev.session_id);

        let artifact = {
            let db = state.db.lock().await;
            if let Ok(existing) = db.list_session_artifacts(session_id, 500) {
                if existing.iter().any(|artifact| {
                    artifact
                        .uri
                        .as_deref()
                        .map(|value| value.eq_ignore_ascii_case(&uri))
                        .unwrap_or(false)
                }) {
                    return;
                }
            }

            match db.add_session_artifact(
                session_id,
                &name,
                artifact_type,
                Some(&uri),
                "本回合生成或修改的文件",
                Some(ev.tool_name),
                Some(ev.tool_use_id),
                Some(&metadata_json),
            ) {
                Ok(artifact) => artifact,
                Err(err) => {
                    tracing::debug!("auto artifact registration skipped for {}: {}", uri, err);
                    return;
                }
            }
        };

        let _ = self.app.emit(
            &format!("session_artifacts_updated_{}", session_id),
            &artifact,
        );
    }

    async fn register_file_artifact(&self, ev: &ToolHookEvent<'_>) {
        let Some(path) = ev
            .input
            .get("path")
            .and_then(|v| v.as_str())
            .and_then(|raw| Self::artifact_path(ev.workspace_root, raw))
        else {
            return;
        };

        self.register_artifact_path(ev, path).await;
    }

    async fn register_recent_artifacts_from_indirect_tool(&self, ev: &ToolHookEvent<'_>) {
        let started_at = {
            let mut times = TOOL_START_TIMES.lock().unwrap_or_else(|e| e.into_inner());
            times.remove(ev.tool_use_id)
        };
        let Some(started_at) = started_at else {
            return;
        };

        let mut candidates = Vec::new();
        Self::collect_recent_artifacts(ev.workspace_root, started_at, 0, &mut candidates);
        candidates.sort_by(|a, b| b.1.cmp(&a.1));

        for (path, _) in candidates.into_iter().take(MAX_INDIRECT_ARTIFACTS_PER_TOOL) {
            self.register_artifact_path(ev, path).await;
        }
    }
}

#[async_trait]
impl AgentHooks for JournalWithIdeNotify {
    async fn before_tool(&self, ev: &ToolHookEvent<'_>) -> HookDecision {
        if Self::is_indirect_artifact_tool(ev.tool_name) {
            let mut times = TOOL_START_TIMES.lock().unwrap_or_else(|e| e.into_inner());
            times.insert(ev.tool_use_id.to_string(), SystemTime::now());
        }

        if FILE_TOOLS.contains(&ev.tool_name) {
            if let Some(path) = ev.input.get("path").and_then(|v| v.as_str()) {
                let normalized = path.replace('\\', "/").to_lowercase();
                if normalized.contains("/skills/installed/")
                    || normalized.contains("/skills/.hub/")
                    || normalized.ends_with("/skill.md") && normalized.contains("/skills/")
                {
                    return HookDecision::Deny(
                        "Cannot modify locked skill files via file_write/file_edit. Use skill_manage for draft/learned skills.".into(),
                    );
                }
            }
        }
        self.journal.before_tool(ev).await
    }

    async fn after_tool(&self, ev: &ToolHookEvent<'_>, result: &ToolResult) {
        self.journal.after_tool(ev, result).await;
        if result.is_error {
            if Self::is_indirect_artifact_tool(ev.tool_name) {
                let mut times = TOOL_START_TIMES.lock().unwrap_or_else(|e| e.into_inner());
                times.remove(ev.tool_use_id);
            }
            return;
        }
        if Self::is_indirect_artifact_tool(ev.tool_name) {
            self.register_recent_artifacts_from_indirect_tool(ev).await;
        }
        if result.is_error || !FILE_TOOLS.contains(&ev.tool_name) {
            return;
        }
        self.emit_file_changed(ev, "modified");
        self.register_file_artifact(ev).await;
    }

    async fn on_context_event(&self, ev: &ContextHookEvent<'_>) {
        if let ContextHookEvent::AfterCompact { session_id, .. } = ev {
            let count = {
                let mut counts = SESSION_COMPACTION_COUNTS
                    .lock()
                    .unwrap_or_else(|e| e.into_inner());
                let entry = counts.entry(session_id.to_string()).or_insert(0);
                *entry = entry.saturating_add(1);
                *entry
            };
            if count >= COMPACTION_CONSOLIDATION_THRESHOLD {
                SESSION_COMPACTION_COUNTS
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .remove(*session_id);
                if let Some(state) = self.app.try_state::<crate::store::AppState>() {
                    let state = state.inner().clone();
                    let sid = session_id.to_string();
                    tokio::spawn(async move {
                        let _ =
                            crate::commands::chat::scheduler::trigger_consolidation_for_session(
                                &state, &sid,
                            )
                            .await;
                    });
                }
            }
        }
    }
}
