//! Platform "extras" — lightweight host endpoints introduced with the XiaoNuo
//! rebrand: update check, cloud-storage connectors, account info, and team
//! templates.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use super::cloud;
use crate::brand_generated::{GITHUB_REPO, PRODUCT_NAME};

// ─── Update check ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub notes: String,
    pub release_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GhRelease {
    tag_name: String,
    body: Option<String>,
    html_url: String,
}

fn parse_version_triple(v: &str) -> Option<(u64, u64, u64)> {
    let clean = v.trim().trim_start_matches('v').trim_start_matches('V');
    let mut parts = clean.split('.');
    let major = parts.next()?.parse().ok()?;
    let minor = parts.next()?.parse().ok()?;
    let patch = parts
        .next()
        .unwrap_or("0")
        .split('-')
        .next()
        .unwrap_or("0")
        .parse()
        .ok()?;
    Some((major, minor, patch))
}

fn version_gt(latest: &str, current: &str) -> bool {
    match (parse_version_triple(latest), parse_version_triple(current)) {
        (Some(l), Some(c)) => l > c,
        _ => latest != current,
    }
}

/// Compare the running version against the latest GitHub release of openpisci.
#[tauri::command]
pub async fn check_update() -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let client = reqwest::Client::builder()
        .user_agent(format!("{PRODUCT_NAME}/{}", current))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Ok(UpdateInfo {
            latest_version: current.clone(),
            update_available: false,
            notes: String::new(),
            current_version: current,
            release_url: None,
        });
    }

    let release: GhRelease = resp.json().await.map_err(|e| e.to_string())?;
    let latest = release
        .tag_name
        .trim()
        .trim_start_matches('v')
        .trim_start_matches('V')
        .to_string();
    let update_available = version_gt(&latest, &current);

    Ok(UpdateInfo {
        current_version: current,
        latest_version: latest,
        update_available,
        notes: release.body.unwrap_or_default(),
        release_url: Some(release.html_url),
    })
}

// ─── Cloud connectors ────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct CloudConnector {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub connected: bool,
    pub available: bool,
}

#[tauri::command]
pub async fn list_cloud_connectors(app: AppHandle) -> Result<Vec<CloudConnector>, String> {
    cloud::list_cloud_connectors(app).await
}

// ─── Account ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct AccountInfo {
    /// "local" when signed out, "cloud" when signed in.
    pub kind: String,
    pub name: String,
    pub signed_in: bool,
    pub email: Option<String>,
    pub base_url: Option<String>,
    pub balance: Option<f64>,
}

/// Real account state: returns the cloud account when signed in, otherwise a
/// local account. The desktop is fully usable without signing in.
#[tauri::command]
pub async fn get_account(app: AppHandle) -> Result<AccountInfo, String> {
    let info = super::cloud_account::cloud_account_status(app).await?;
    Ok(AccountInfo {
        kind: info.kind,
        name: info.name,
        signed_in: info.signed_in,
        email: info.email,
        base_url: info.base_url,
        balance: info.balance,
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn version_gt_works() {
        assert!(version_gt("0.8.65", "0.8.64"));
        assert!(!version_gt("0.8.64", "0.8.64"));
        assert!(version_gt("0.9.0", "0.8.99"));
    }
}
