//! Cloud account commands — optional sign-in to the cloud platform.
//!
//! The desktop works fully as a **local account** without signing in. Signing
//! in unlocks cloud capabilities (cloud LLM billing, official marketplace
//! publish/paid installs, balance). Credentials are persisted in
//! `cloud_account.json` under the app data dir.
//!
//! Auth strategy: prefer a long-lived device token
//! (`POST {base}/api/auth/device/token`); if that endpoint is unavailable we
//! fall back to the legacy session login (`POST {base}/api/auth/login`) and
//! treat the returned `session_id` as the bearer token.

use crate::brand_generated::PRODUCT_NAME;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CloudAccountStore {
    pub base_url: String,
    pub access_token: String,
    #[serde(default)]
    pub refresh_token: String,
    #[serde(default)]
    pub user_id: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub email: String,
}

fn store_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("cloud_account.json"))
        .map_err(|e| e.to_string())
}

pub fn load_store(app: &AppHandle) -> CloudAccountStore {
    let Ok(path) = store_path(app) else {
        return CloudAccountStore::default();
    };
    if !path.exists() {
        return CloudAccountStore::default();
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save_store(app: &AppHandle, store: &CloudAccountStore) -> Result<(), String> {
    let path = store_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| e.to_string())
}

fn clear_store(app: &AppHandle) -> Result<(), String> {
    let path = store_path(app)?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent(format!("{PRODUCT_NAME}-Cloud/1.0"))
        .build()
        .map_err(|e| e.to_string())
}

fn trim_base(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

// ─── Public account view ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct CloudAccountInfo {
    /// "local" when signed out, "cloud" when signed in.
    pub kind: String,
    pub signed_in: bool,
    pub name: String,
    pub email: Option<String>,
    pub base_url: Option<String>,
    pub balance: Option<f64>,
}

fn local_account() -> CloudAccountInfo {
    CloudAccountInfo {
        kind: "local".into(),
        signed_in: false,
        name: "本地账户".into(),
        email: None,
        base_url: None,
        balance: None,
    }
}

// ─── Sign-in / sign-out / status ───────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct DeviceTokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    // Fallback session login shape:
    session_id: Option<String>,
    user: Option<DeviceUser>,
    user_info: Option<DeviceUser>,
}

#[derive(Debug, Deserialize)]
struct DeviceUser {
    #[serde(default)]
    id: String,
    #[serde(default)]
    username: String,
    #[serde(default)]
    email: String,
}

#[tauri::command]
pub async fn cloud_sign_in(
    app: AppHandle,
    base_url: String,
    username: String,
    password: String,
) -> Result<CloudAccountInfo, String> {
    let base = trim_base(&base_url);
    if base.is_empty() {
        return Err("云端地址不能为空".into());
    }
    let client = http_client()?;

    // 1) Try the long-lived device token endpoint.
    let device_body = serde_json::json!({
        "username": username,
        "password": password,
        "device_name": PRODUCT_NAME,
    });
    let mut resp = client
        .post(format!("{base}/api/auth/device/token"))
        .json(&device_body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    // 2) Fall back to legacy session login when device endpoint is absent.
    if resp.status() == reqwest::StatusCode::NOT_FOUND {
        resp = client
            .post(format!("{base}/api/auth/login"))
            .json(&serde_json::json!({ "username": username, "password": password }))
            .send()
            .await
            .map_err(|e| e.to_string())?;
    }

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("登录失败 (HTTP {status}): {text}"));
    }

    let parsed: DeviceTokenResponse = resp.json().await.map_err(|e| e.to_string())?;
    let access = parsed
        .access_token
        .or(parsed.session_id)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "登录响应缺少 token".to_string())?;
    let user = parsed.user.or(parsed.user_info).unwrap_or(DeviceUser {
        id: String::new(),
        username: username.clone(),
        email: String::new(),
    });

    let store = CloudAccountStore {
        base_url: base.clone(),
        access_token: access,
        refresh_token: parsed.refresh_token.unwrap_or_default(),
        user_id: user.id,
        username: if user.username.is_empty() {
            username
        } else {
            user.username
        },
        email: user.email,
    };
    save_store(&app, &store)?;

    let balance = fetch_balance(&client, &store).await;
    Ok(CloudAccountInfo {
        kind: "cloud".into(),
        signed_in: true,
        name: store.username.clone(),
        email: if store.email.is_empty() {
            None
        } else {
            Some(store.email.clone())
        },
        base_url: Some(store.base_url.clone()),
        balance,
    })
}

#[tauri::command]
pub async fn cloud_sign_out(app: AppHandle) -> Result<CloudAccountInfo, String> {
    let store = load_store(&app);
    if !store.access_token.is_empty() && !store.base_url.is_empty() {
        // Best-effort server-side logout; ignore failures.
        if let Ok(client) = http_client() {
            let _ = client
                .post(format!("{}/api/auth/logout", trim_base(&store.base_url)))
                .bearer_auth(&store.access_token)
                .send()
                .await;
        }
    }
    clear_store(&app)?;
    Ok(local_account())
}

#[tauri::command]
pub async fn cloud_account_status(app: AppHandle) -> Result<CloudAccountInfo, String> {
    let store = load_store(&app);
    if store.access_token.is_empty() {
        return Ok(local_account());
    }
    let balance = match http_client() {
        Ok(client) => fetch_balance(&client, &store).await,
        Err(_) => None,
    };
    Ok(CloudAccountInfo {
        kind: "cloud".into(),
        signed_in: true,
        name: if store.username.is_empty() {
            "云账户".into()
        } else {
            store.username.clone()
        },
        email: if store.email.is_empty() {
            None
        } else {
            Some(store.email.clone())
        },
        base_url: Some(store.base_url.clone()),
        balance,
    })
}

async fn fetch_balance(client: &reqwest::Client, store: &CloudAccountStore) -> Option<f64> {
    let resp = client
        .get(format!(
            "{}/api/auth/user/balance",
            trim_base(&store.base_url)
        ))
        .bearer_auth(&store.access_token)
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let v: serde_json::Value = resp.json().await.ok()?;
    v.get("balance")
        .or_else(|| v.get("token_balance"))
        .or_else(|| v.pointer("/data/balance"))
        .and_then(|b| b.as_f64())
}

/// Stable provider id for the synced cloud LLM provider in desktop Settings.
pub const CLOUD_PROVIDER_ID: &str = "pisci-cloud";

/// Sync the cloud LLM provider into desktop Settings.
///
/// When signed in, upserts a named provider pointing at the cloud OpenAI-
/// compatible gateway (`{base}/api/llm/v1`) authenticated with the session
/// token — so cloud usage is billed by the platform. When signed out, removes
/// it. Self-hosted / own-key providers configured by the user are untouched and
/// remain billed locally (i.e. not by the cloud).
#[tauri::command]
pub async fn sync_cloud_llm_config(
    app: AppHandle,
    state: tauri::State<'_, crate::store::AppState>,
) -> Result<Vec<String>, String> {
    let store = load_store(&app);
    let mut settings = state.settings.lock().await;

    if store.access_token.is_empty() || store.base_url.is_empty() {
        let before = settings.llm_providers.len();
        settings.llm_providers.retain(|p| p.id != CLOUD_PROVIDER_ID);
        if settings.llm_providers.len() != before {
            settings.save().map_err(|e| e.to_string())?;
        }
        return Ok(vec![]);
    }

    let base = trim_base(&store.base_url);
    let gateway_base = format!("{base}/api/llm/v1");
    let models = fetch_models(&gateway_base, &store.access_token).await;
    let primary = models.first().cloned().unwrap_or_default();

    let cfg = crate::store::settings::LlmProviderConfig {
        id: CLOUD_PROVIDER_ID.to_string(),
        label: "云端模型".to_string(),
        provider: "openai".to_string(),
        model: primary,
        api_key: store.access_token.clone(),
        base_url: gateway_base,
        max_tokens: 0,
    };

    match settings
        .llm_providers
        .iter_mut()
        .find(|p| p.id == CLOUD_PROVIDER_ID)
    {
        Some(existing) => *existing = cfg,
        None => settings.llm_providers.push(cfg),
    }
    settings.save().map_err(|e| e.to_string())?;
    Ok(models)
}

async fn fetch_models(gateway_base: &str, token: &str) -> Vec<String> {
    let Ok(client) = http_client() else {
        return vec![];
    };
    let resp = client
        .get(format!("{gateway_base}/models"))
        .bearer_auth(token)
        .send()
        .await;
    let Ok(resp) = resp else { return vec![] };
    if !resp.status().is_success() {
        return vec![];
    }
    let Ok(v) = resp.json::<serde_json::Value>().await else {
        return vec![];
    };
    v.get("data")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m.get("id").and_then(|i| i.as_str()).map(String::from))
                .collect()
        })
        .unwrap_or_default()
}

/// Shared helper for other modules (LLM gateway, marketplace) to issue an
/// authenticated GET against the cloud platform. Returns `None` when signed out.
#[allow(dead_code)]
pub async fn authed_get_json(app: &AppHandle, path: &str) -> Option<serde_json::Value> {
    let store = load_store(app);
    if store.access_token.is_empty() || store.base_url.is_empty() {
        return None;
    }
    let client = http_client().ok()?;
    let url = format!(
        "{}/{}",
        trim_base(&store.base_url),
        path.trim_start_matches('/')
    );
    let resp = client
        .get(url)
        .bearer_auth(&store.access_token)
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.json().await.ok()
}
