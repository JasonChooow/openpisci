//! Platform "extras" — lightweight host endpoints introduced with the XiaoNuo
//! rebrand: update check, cloud-storage connectors, account info, and team
//! templates.
//!
//! These are intentionally minimal, dependency-free scaffolds with stable
//! shapes so the frontend can build complete UX against them now; the real
//! integrations (release feed, OAuth connectors, sign-in/sync, persisted
//! templates) can be filled in behind these same signatures later.

use serde::Serialize;

// ─── Update check ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub notes: String,
}

/// Report the running version. No remote release feed is wired yet, so this
/// always reports "up to date"; swap the body for a real feed fetch later.
#[tauri::command]
pub async fn check_update() -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    Ok(UpdateInfo {
        latest_version: current.clone(),
        update_available: false,
        notes: String::new(),
        current_version: current,
    })
}

// ─── Cloud connectors ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct CloudConnector {
    pub id: String,
    pub name: String,
    pub provider: String,
    /// Whether the user has connected this provider.
    pub connected: bool,
    /// Whether the integration is implemented and selectable.
    pub available: bool,
}

#[tauri::command]
pub async fn list_cloud_connectors() -> Result<Vec<CloudConnector>, String> {
    Ok(vec![
        CloudConnector {
            id: "tencent_docs".into(),
            name: "腾讯文档".into(),
            provider: "tencent".into(),
            connected: false,
            available: false,
        },
        CloudConnector {
            id: "feishu_docs".into(),
            name: "飞书云文档".into(),
            provider: "feishu".into(),
            connected: false,
            available: false,
        },
        CloudConnector {
            id: "webdav".into(),
            name: "WebDAV".into(),
            provider: "webdav".into(),
            connected: false,
            available: false,
        },
    ])
}

// ─── Account ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct AccountInfo {
    /// "guest" | "local" | "cloud"
    pub kind: String,
    pub name: String,
    pub signed_in: bool,
}

#[tauri::command]
pub async fn get_account() -> Result<AccountInfo, String> {
    Ok(AccountInfo {
        kind: "guest".into(),
        name: "本地用户".into(),
        signed_in: false,
    })
}

// ─── Team templates ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct TeamTemplate {
    pub id: String,
    pub name: String,
    pub description: String,
    pub roles: Vec<String>,
}

#[tauri::command]
pub async fn list_team_templates() -> Result<Vec<TeamTemplate>, String> {
    Ok(vec![
        TeamTemplate {
            id: "research".into(),
            name: "调研小队".into(),
            description: "信息搜集 + 分析 + 汇总报告".into(),
            roles: vec!["调研员".into(), "分析师".into(), "撰稿".into()],
        },
        TeamTemplate {
            id: "dev".into(),
            name: "开发小队".into(),
            description: "需求拆解 + 编码 + 代码评审".into(),
            roles: vec!["架构".into(), "开发".into(), "评审".into()],
        },
        TeamTemplate {
            id: "content".into(),
            name: "内容小队".into(),
            description: "选题 + 创作 + 校对发布".into(),
            roles: vec!["策划".into(), "写作".into(), "校对".into()],
        },
    ])
}
