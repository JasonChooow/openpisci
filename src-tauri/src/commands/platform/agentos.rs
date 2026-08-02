//! theAgentOS binding commands — "我的云Agent电脑".
//!
//! All calls go through the 9xBot cloud backend (`/api/auth/agentos/*`) with
//! the persisted cloud access token; the frontend never sees the token or
//! the theAgentOS refresh token. The handoff response carries a one-hop
//! `?sso_session=` URL the webview loads directly.

use super::cloud_account::load_store;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AgentosStatus {
    pub bound: bool,
    #[serde(default)]
    pub external_username: Option<String>,
    #[serde(default)]
    pub web_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentosHandoff {
    pub url: String,
    #[serde(default)]
    pub external_username: Option<String>,
}

fn cloud_base() -> String {
    // Resolved through discovery so moving the runtime is a document change
    // rather than a desktop release. Falls back to the edge, which is where it
    // used to point unconditionally.
    crate::commands::platform::cloud_url::service_url(
        crate::commands::platform::discovery::SERVICE_AGENTOS,
    )
    .trim()
    .trim_end_matches('/')
    .to_string()
}

async fn authed_request(
    app: &AppHandle,
    method: reqwest::Method,
    path: &str,
    body: Option<serde_json::Value>,
) -> Result<(reqwest::StatusCode, serde_json::Value), String> {
    let store = load_store(app);
    if store.access_token.is_empty() {
        return Err("请先登录云端账户".to_string());
    }
    let client = super::cloud_account::http_client()?;
    let builder = client
        .request(method, format!("{}{path}", cloud_base()))
        .bearer_auth(&store.access_token);
    let builder = match body {
        Some(b) => builder.json(&b),
        None => builder,
    };
    let resp = builder.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    let json = serde_json::from_str(&text).unwrap_or_else(|_| {
        serde_json::json!({ "detail": if text.is_empty() { status.to_string() } else { text } })
    });
    Ok((status, json))
}

fn error_message(json: &serde_json::Value, fallback: &str) -> String {
    json.get("detail")
        .and_then(|v| v.as_str())
        .map(str::to_string)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

#[tauri::command]
pub async fn agentos_status(app: AppHandle) -> Result<AgentosStatus, String> {
    let (status, json) =
        authed_request(&app, reqwest::Method::GET, "/api/auth/agentos/status", None).await?;
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("登录已过期，请重新登录".to_string());
    }
    if !status.is_success() {
        return Err(error_message(&json, "查询云 Agent 电脑绑定状态失败"));
    }
    serde_json::from_value(json).map_err(|e| format!("绑定状态响应无效: {e}"))
}

#[tauri::command]
pub async fn agentos_bind(
    app: AppHandle,
    username: String,
    password: String,
) -> Result<AgentosStatus, String> {
    let (status, json) = authed_request(
        &app,
        reqwest::Method::POST,
        "/api/auth/agentos/bind",
        Some(serde_json::json!({
            "username": username.trim(),
            "password": password,
        })),
    )
    .await?;
    if !status.is_success() {
        return Err(error_message(&json, "绑定云 Agent 电脑账号失败"));
    }
    Ok(AgentosStatus {
        bound: json
            .get("bound")
            .and_then(|v| v.as_bool())
            .unwrap_or(true),
        external_username: json
            .get("external_username")
            .and_then(|v| v.as_str())
            .map(str::to_string),
        web_url: None,
    })
}

#[tauri::command]
pub async fn agentos_unbind(app: AppHandle) -> Result<AgentosStatus, String> {
    let (status, json) =
        authed_request(&app, reqwest::Method::DELETE, "/api/auth/agentos/bind", None).await?;
    if !status.is_success() {
        return Err(error_message(&json, "解绑失败"));
    }
    Ok(AgentosStatus {
        bound: false,
        external_username: None,
        web_url: None,
    })
}

#[tauri::command]
pub async fn agentos_handoff(app: AppHandle) -> Result<AgentosHandoff, String> {
    let (status, json) =
        authed_request(&app, reqwest::Method::POST, "/api/auth/agentos/handoff", None).await?;
    if status == reqwest::StatusCode::NOT_FOUND {
        return Err("NOT_BOUND".to_string());
    }
    if status == reqwest::StatusCode::UNAUTHORIZED {
        return Err("REBIND_REQUIRED".to_string());
    }
    if !status.is_success() {
        return Err(error_message(&json, "进入云 Agent 电脑失败"));
    }
    serde_json::from_value(json).map_err(|e| format!("云 Agent 电脑响应无效: {e}"))
}
