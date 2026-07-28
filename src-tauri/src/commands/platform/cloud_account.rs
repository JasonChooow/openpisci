//! Cloud account commands for the required official cloud platform.
//!
//! Credentials are persisted in `cloud_account.json` under the app data dir,
//! while the endpoint itself is always supplied by the encrypted Cloud URL
//! module and never by frontend or persisted user configuration.
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
    let mut store: CloudAccountStore = std::fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default();
    if !store.access_token.is_empty() {
        // Ignore legacy caller-controlled endpoints persisted by older builds.
        store.base_url = crate::commands::platform::cloud_url::get_cloud_url();
    }
    store
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
    #[serde(default, deserialize_with = "deserialize_flex_id")]
    id: String,
    #[serde(default)]
    username: String,
    #[serde(default)]
    email: String,
}

fn deserialize_flex_id<'de, D>(deserializer: D) -> Result<String, D::Error>
where
    D: serde::Deserializer<'de>,
{
    let value = serde_json::Value::deserialize(deserializer)?;
    match value {
        serde_json::Value::Null => Ok(String::new()),
        serde_json::Value::String(s) => Ok(s),
        serde_json::Value::Number(n) => Ok(n.to_string()),
        other => Ok(other.to_string()),
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct WechatLoginResult {
    /// pending | needs_profile | authorized
    pub status: String,
    pub signed_in: bool,
    pub needs_profile: bool,
    pub pending_token: Option<String>,
    pub account: Option<CloudAccountInfo>,
    pub message: Option<String>,
}

async fn persist_token_response(
    app: &AppHandle,
    base: &str,
    parsed: DeviceTokenResponse,
    fallback_username: String,
) -> Result<CloudAccountInfo, String> {
    let access = parsed
        .access_token
        .or(parsed.session_id)
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "登录响应缺少 token".to_string())?;
    let user = parsed.user.or(parsed.user_info).unwrap_or(DeviceUser {
        id: String::new(),
        username: fallback_username.clone(),
        email: String::new(),
    });

    let store = CloudAccountStore {
        base_url: base.to_string(),
        access_token: access,
        refresh_token: parsed.refresh_token.unwrap_or_default(),
        user_id: user.id,
        username: if user.username.is_empty() {
            fallback_username
        } else {
            user.username
        },
        email: user.email,
    };
    save_store(app, &store)?;

    let client = http_client()?;
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

async fn post_json_auth(
    path: &str,
    body: serde_json::Value,
) -> Result<(reqwest::StatusCode, serde_json::Value), String> {
    let base = trim_base(&crate::commands::platform::cloud_url::get_cloud_url());
    let client = http_client()?;
    let resp = client
        .post(format!("{base}{path}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    let json = serde_json::from_str(&text).unwrap_or_else(|_| {
        serde_json::json!({ "detail": if text.is_empty() { status.to_string() } else { text } })
    });
    Ok((status, json))
}

fn api_error_message(json: &serde_json::Value, fallback: &str) -> String {
    json.get("detail")
        .and_then(|v| v.as_str())
        .or_else(|| json.get("error").and_then(|v| v.as_str()))
        .or_else(|| json.get("message").and_then(|v| v.as_str()))
        .map(str::to_string)
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

#[tauri::command]
pub async fn cloud_sign_in(
    app: AppHandle,
    username: String,
    password: String,
) -> Result<CloudAccountInfo, String> {
    let base = trim_base(&crate::commands::platform::cloud_url::get_cloud_url());
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
    persist_token_response(&app, &base, parsed, username).await
}

#[tauri::command]
pub async fn cloud_create_captcha() -> Result<serde_json::Value, String> {
    let base = trim_base(&crate::commands::platform::cloud_url::get_cloud_url());
    let client = http_client()?;
    let resp = client
        .get(format!("{base}/api/auth/captcha"))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    let json = serde_json::from_str(&text).unwrap_or_else(|_| {
        serde_json::json!({ "detail": if text.is_empty() { status.to_string() } else { text } })
    });
    if !status.is_success() {
        return Err(api_error_message(&json, "获取图形验证码失败"));
    }
    Ok(json)
}

#[tauri::command]
pub async fn cloud_send_sms_code(
    phone: String,
    purpose: String,
    captcha_id: String,
    captcha_code: String,
) -> Result<serde_json::Value, String> {
    let (status, json) = post_json_auth(
        "/api/auth/send-code",
        serde_json::json!({
            "phone": phone.trim(),
            "purpose": purpose,
            "captcha_id": captcha_id,
            "captcha_code": captcha_code.trim(),
        }),
    )
    .await?;
    if !status.is_success() {
        return Err(api_error_message(&json, "发送验证码失败"));
    }
    Ok(json)
}

#[tauri::command]
pub async fn cloud_wechat_start_session() -> Result<serde_json::Value, String> {
    let (status, json) = post_json_auth("/api/auth/wechat/desktop-session", serde_json::json!({}))
        .await?;
    if !status.is_success() {
        return Err(api_error_message(&json, "创建微信登录会话失败"));
    }
    Ok(json)
}

#[tauri::command]
pub async fn cloud_wechat_poll_session(
    app: AppHandle,
    session_id: String,
) -> Result<WechatLoginResult, String> {
    let base = trim_base(&crate::commands::platform::cloud_url::get_cloud_url());
    let client = http_client()?;
    let resp = client
        .get(format!(
            "{base}/api/auth/wechat/desktop-session/{}",
            session_id.trim()
        ))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let text = resp.text().await.unwrap_or_default();
    let json = serde_json::from_str(&text).unwrap_or_else(|_| {
        serde_json::json!({ "detail": if text.is_empty() { status.to_string() } else { text } })
    });
    if !status.is_success() {
        return Err(api_error_message(&json, "查询微信授权状态失败"));
    }

    let poll_status = json
        .get("status")
        .and_then(|v| v.as_str())
        .unwrap_or("pending");
    match poll_status {
        "pending" => Ok(WechatLoginResult {
            status: "pending".into(),
            signed_in: false,
            needs_profile: false,
            pending_token: None,
            account: None,
            message: None,
        }),
        "expired" => Err("微信授权已超时，请重试".into()),
        "needs_profile" => Ok(WechatLoginResult {
            status: "needs_profile".into(),
            signed_in: false,
            needs_profile: true,
            pending_token: json
                .get("pending_token")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            account: None,
            message: json
                .get("message")
                .and_then(|v| v.as_str())
                .map(str::to_string),
        }),
        "authorized" => {
            let parsed: DeviceTokenResponse = serde_json::from_value(json)
                .map_err(|e| format!("微信登录响应无效: {e}"))?;
            let account = persist_token_response(&app, &base, parsed, "微信用户".into()).await?;
            Ok(WechatLoginResult {
                status: "authorized".into(),
                signed_in: true,
                needs_profile: false,
                pending_token: None,
                account: Some(account),
                message: None,
            })
        }
        other => Err(format!("未知微信授权状态: {other}")),
    }
}

#[tauri::command]
pub async fn cloud_sign_in_sms(
    app: AppHandle,
    phone: String,
    code: String,
) -> Result<CloudAccountInfo, String> {
    let base = trim_base(&crate::commands::platform::cloud_url::get_cloud_url());
    let (status, json) = post_json_auth(
        "/api/auth/sms/login",
        serde_json::json!({
            "phone": phone.trim(),
            "code": code.trim(),
            "device_name": PRODUCT_NAME,
        }),
    )
    .await?;
    if !status.is_success() {
        return Err(api_error_message(&json, "短信登录失败"));
    }
    let parsed: DeviceTokenResponse =
        serde_json::from_value(json).map_err(|e| format!("短信登录响应无效: {e}"))?;
    persist_token_response(&app, &base, parsed, phone.trim().to_string()).await
}

#[tauri::command]
pub async fn cloud_reset_password(
    phone: String,
    code: String,
    new_password: String,
) -> Result<serde_json::Value, String> {
    let (status, json) = post_json_auth(
        "/api/auth/password/reset",
        serde_json::json!({
            "phone": phone.trim(),
            "code": code.trim(),
            "new_password": new_password,
        }),
    )
    .await?;
    if !status.is_success() {
        return Err(api_error_message(&json, "重置密码失败"));
    }
    Ok(json)
}

#[tauri::command]
pub async fn cloud_wechat_login(app: AppHandle, code: String) -> Result<WechatLoginResult, String> {
    let base = trim_base(&crate::commands::platform::cloud_url::get_cloud_url());
    let (status, json) = post_json_auth(
        "/api/auth/wechat/login",
        serde_json::json!({
            "code": code.trim(),
            "device_name": PRODUCT_NAME,
        }),
    )
    .await?;
    if !status.is_success() {
        return Err(api_error_message(&json, "微信登录失败"));
    }

    let needs_profile = json
        .get("needs_profile")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    if needs_profile {
        return Ok(WechatLoginResult {
            status: "needs_profile".into(),
            signed_in: false,
            needs_profile: true,
            pending_token: json
                .get("pending_token")
                .and_then(|v| v.as_str())
                .map(str::to_string),
            account: None,
            message: json
                .get("message")
                .and_then(|v| v.as_str())
                .map(str::to_string),
        });
    }

    let parsed: DeviceTokenResponse =
        serde_json::from_value(json).map_err(|e| format!("微信登录响应无效: {e}"))?;
    let account = persist_token_response(&app, &base, parsed, "微信用户".into()).await?;
    Ok(WechatLoginResult {
        status: "authorized".into(),
        signed_in: true,
        needs_profile: false,
        pending_token: None,
        account: Some(account),
        message: None,
    })
}

#[tauri::command]
pub async fn cloud_wechat_complete_profile(
    app: AppHandle,
    pending_token: String,
    username: String,
    phone: String,
    sms_code: String,
    password: Option<String>,
) -> Result<CloudAccountInfo, String> {
    let base = trim_base(&crate::commands::platform::cloud_url::get_cloud_url());
    let mut body = serde_json::json!({
        "pending_token": pending_token,
        "username": username.trim(),
        "phone": phone.trim(),
        "sms_code": sms_code.trim(),
    });
    if let Some(pwd) = password.filter(|s| !s.is_empty()) {
        body["password"] = serde_json::Value::String(pwd);
    }
    let (status, json) = post_json_auth("/api/auth/wechat/complete-profile", body).await?;
    if !status.is_success() {
        return Err(api_error_message(&json, "完善资料失败"));
    }
    let parsed: DeviceTokenResponse =
        serde_json::from_value(json).map_err(|e| format!("完善资料响应无效: {e}"))?;
    persist_token_response(&app, &base, parsed, username.trim().to_string()).await
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
        Ok(client) => match check_balance(&client, &store).await {
            BalanceCheck::Valid(balance) => balance,
            BalanceCheck::Unauthorized => {
                // A 401/403 is authoritative: remove the revoked or expired
                // session before reporting status to the frontend gate.
                clear_store(&app)?;
                return Ok(local_account());
            }
            // Preserve the session during transient connectivity failures. The
            // frontend gate will validate again on focus and on a short timer.
            BalanceCheck::Unavailable => None,
        },
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

enum BalanceCheck {
    Valid(Option<f64>),
    Unauthorized,
    Unavailable,
}

async fn check_balance(client: &reqwest::Client, store: &CloudAccountStore) -> BalanceCheck {
    let response = client
        .get(format!(
            "{}/api/auth/user/balance",
            trim_base(&store.base_url)
        ))
        .bearer_auth(&store.access_token)
        .send()
        .await;
    let Ok(response) = response else {
        return BalanceCheck::Unavailable;
    };
    if matches!(
        response.status(),
        reqwest::StatusCode::UNAUTHORIZED | reqwest::StatusCode::FORBIDDEN
    ) {
        return BalanceCheck::Unauthorized;
    }
    if !response.status().is_success() {
        return BalanceCheck::Unavailable;
    }

    let Ok(value) = response.json::<serde_json::Value>().await else {
        return BalanceCheck::Valid(None);
    };
    let balance = value
        .get("balance")
        .or_else(|| value.get("token_balance"))
        .or_else(|| value.pointer("/data/balance"))
        .and_then(|item| item.as_f64());
    BalanceCheck::Valid(balance)
}

async fn fetch_balance(client: &reqwest::Client, store: &CloudAccountStore) -> Option<f64> {
    match check_balance(client, store).await {
        BalanceCheck::Valid(balance) => balance,
        BalanceCheck::Unauthorized | BalanceCheck::Unavailable => None,
    }
}

/// Stable provider id for the synced cloud LLM provider in desktop Settings.
pub const CLOUD_PROVIDER_ID: &str = "pisci-cloud";

fn official_cloud_provider(
    gateway_base: String,
    access_token: String,
    primary_model: String,
) -> crate::store::settings::LlmProviderConfig {
    crate::store::settings::LlmProviderConfig {
        id: CLOUD_PROVIDER_ID.to_string(),
        label: "云端模型".to_string(),
        provider: "openai".to_string(),
        model: primary_model,
        api_key: access_token,
        base_url: gateway_base,
        max_tokens: 0,
    }
}

fn clear_local_llm_configuration(settings: &mut crate::store::settings::Settings) {
    settings.anthropic_api_key.clear();
    settings.openai_api_key.clear();
    settings.deepseek_api_key.clear();
    settings.qwen_api_key.clear();
    settings.minimax_api_key.clear();
    settings.zhipu_api_key.clear();
    settings.kimi_api_key.clear();
    settings.custom_base_url.clear();
    settings.fallback_models.clear();
    settings.vision_use_main_llm = true;
    settings.vision_provider.clear();
    settings.vision_model.clear();
    settings.vision_api_key.clear();
    settings.vision_base_url.clear();
}

/// Sync the exclusive official cloud LLM provider into desktop Settings.
///
/// A valid cloud session replaces every legacy or user-defined provider with
/// the official gateway provider. Signed-out state clears the provider list,
/// so local API keys cannot remain as a bypass.
#[tauri::command]
pub async fn sync_cloud_llm_config(
    app: AppHandle,
    state: tauri::State<'_, crate::store::AppState>,
) -> Result<Vec<String>, String> {
    let store = load_store(&app);
    let mut settings = state.settings.lock().await;
    clear_local_llm_configuration(&mut settings);

    if store.access_token.is_empty() {
        settings.llm_providers.clear();
        settings.provider = "openai".to_string();
        settings.model.clear();
        settings.save().map_err(|e| e.to_string())?;
        return Ok(vec![]);
    }

    let base = trim_base(&crate::commands::platform::cloud_url::get_cloud_url());
    let gateway_base = format!("{base}/api/llm/v1");
    let models = fetch_models(&gateway_base, &store.access_token).await;
    let primary = models.first().cloned().unwrap_or_default();

    let provider = official_cloud_provider(gateway_base, store.access_token.clone(), primary);
    settings.provider = provider.provider.clone();
    settings.model = provider.model.clone();
    settings.openai_api_key = provider.api_key.clone();
    settings.custom_base_url = provider.base_url.clone();
    settings.llm_providers = vec![provider];
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

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudUsageQuery {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudUsageRequest {
    pub method: String,
    pub path: String,
    #[serde(default)]
    pub query: Vec<CloudUsageQuery>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudUsageResponse {
    pub status: u16,
    pub body: serde_json::Value,
}

fn validate_usage_request(request: &CloudUsageRequest) -> Result<(), String> {
    let expected_method = match request.path.as_str() {
        "/api/auth/user/balance"
        | "/api/usage/summary"
        | "/api/usage/by-model"
        | "/api/usage/transactions" => "GET",
        "/api/billing/claim-daily" => "POST",
        _ => return Err("unsupported cloud usage endpoint".to_string()),
    };
    if !request.method.eq_ignore_ascii_case(expected_method) {
        return Err("unsupported method for cloud usage endpoint".to_string());
    }

    let allowed_query_keys: &[&str] = match request.path.as_str() {
        "/api/usage/summary" | "/api/usage/by-model" => &["period"],
        "/api/usage/transactions" => &["page", "page_size", "start_date", "end_date"],
        _ => &[],
    };
    if request
        .query
        .iter()
        .any(|item| !allowed_query_keys.contains(&item.key.as_str()))
    {
        return Err("unsupported cloud usage query parameter".to_string());
    }
    Ok(())
}

fn build_usage_http_request(
    client: &reqwest::Client,
    token: &str,
    request: &CloudUsageRequest,
) -> Result<reqwest::Request, String> {
    validate_usage_request(request)?;
    if token.is_empty() {
        return Err("cloud session is not authenticated".to_string());
    }

    let base = trim_base(&crate::commands::platform::cloud_url::get_cloud_url());
    let url = format!("{base}{}", request.path);
    let builder = if request.method.eq_ignore_ascii_case("POST") {
        client.post(url)
    } else {
        client.get(url)
    };
    let query = request
        .query
        .iter()
        .map(|item| (item.key.as_str(), item.value.as_str()))
        .collect::<Vec<_>>();
    builder
        .bearer_auth(token)
        .query(&query)
        .build()
        .map_err(|error| error.to_string())
}

/// Executes the small, allow-listed set of usage dashboard requests. The
/// browser receives response data but never the persisted cloud session token.
#[tauri::command]
pub async fn cloud_usage_request(
    app: AppHandle,
    request: CloudUsageRequest,
) -> Result<CloudUsageResponse, String> {
    let store = load_store(&app);
    let client = http_client()?;
    let request = build_usage_http_request(&client, &store.access_token, &request)?;
    let response = client
        .execute(request)
        .await
        .map_err(|error| error.to_string())?;
    let status = response.status().as_u16();
    let text = response.text().await.map_err(|error| error.to_string())?;
    let body = serde_json::from_str(&text).unwrap_or_else(|_| {
        serde_json::json!({ "message": if text.is_empty() { "empty cloud response" } else { &text } })
    });
    Ok(CloudUsageResponse { status, body })
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

#[cfg(test)]
mod tests {
    use super::{
        build_usage_http_request, clear_local_llm_configuration, official_cloud_provider,
        CloudUsageQuery, CloudUsageRequest, CLOUD_PROVIDER_ID,
    };
    use crate::store::settings::Settings;
    use reqwest::header::AUTHORIZATION;

    #[test]
    fn official_cloud_provider_contains_only_gateway_credentials() {
        let provider = official_cloud_provider(
            "https://www.dimnuo.com/api/llm/v1".to_string(),
            "cloud-session-token".to_string(),
            "qwen-plus".to_string(),
        );
        let providers = vec![provider];

        assert_eq!(providers.len(), 1);
        assert_eq!(providers[0].id, CLOUD_PROVIDER_ID);
        assert_eq!(providers[0].provider, "openai");
        assert_eq!(providers[0].model, "qwen-plus");
        assert_eq!(providers[0].api_key, "cloud-session-token");
        assert_eq!(providers[0].base_url, "https://www.dimnuo.com/api/llm/v1");
    }

    #[test]
    fn cloud_lock_clears_legacy_provider_credentials_and_fallbacks() {
        let mut settings = Settings::default();
        settings.anthropic_api_key = "anthropic-secret".to_string();
        settings.openai_api_key = "openai-secret".to_string();
        settings.deepseek_api_key = "deepseek-secret".to_string();
        settings.qwen_api_key = "qwen-secret".to_string();
        settings.minimax_api_key = "minimax-secret".to_string();
        settings.zhipu_api_key = "zhipu-secret".to_string();
        settings.kimi_api_key = "kimi-secret".to_string();
        settings.custom_base_url = "https://custom.example/v1".to_string();
        settings.fallback_models = vec!["anthropic/claude".to_string()];
        settings.vision_use_main_llm = false;
        settings.vision_api_key = "vision-secret".to_string();
        settings.vision_base_url = "https://vision.example/v1".to_string();

        clear_local_llm_configuration(&mut settings);

        assert!(settings.anthropic_api_key.is_empty());
        assert!(settings.openai_api_key.is_empty());
        assert!(settings.deepseek_api_key.is_empty());
        assert!(settings.qwen_api_key.is_empty());
        assert!(settings.minimax_api_key.is_empty());
        assert!(settings.zhipu_api_key.is_empty());
        assert!(settings.kimi_api_key.is_empty());
        assert!(settings.custom_base_url.is_empty());
        assert!(settings.fallback_models.is_empty());
        assert!(settings.vision_use_main_llm);
        assert!(settings.vision_api_key.is_empty());
        assert!(settings.vision_base_url.is_empty());
    }

    #[test]
    fn usage_request_uses_bearer_session_and_expected_query() {
        let client = reqwest::Client::new();
        let request = CloudUsageRequest {
            method: "GET".to_string(),
            path: "/api/usage/transactions".to_string(),
            query: vec![
                CloudUsageQuery {
                    key: "page".to_string(),
                    value: "2".to_string(),
                },
                CloudUsageQuery {
                    key: "page_size".to_string(),
                    value: "20".to_string(),
                },
            ],
        };

        let built = build_usage_http_request(&client, "session-token", &request).unwrap();

        assert_eq!(built.method(), reqwest::Method::GET);
        assert_eq!(built.url().path(), "/api/usage/transactions");
        assert_eq!(built.url().query(), Some("page=2&page_size=20"));
        assert_eq!(
            built.headers().get(AUTHORIZATION).unwrap(),
            "Bearer session-token"
        );
    }

    #[test]
    fn usage_request_rejects_non_allowlisted_endpoint() {
        let client = reqwest::Client::new();
        let request = CloudUsageRequest {
            method: "GET".to_string(),
            path: "https://attacker.example/steal".to_string(),
            query: vec![],
        };

        assert!(build_usage_http_request(&client, "session-token", &request).is_err());
    }
}
