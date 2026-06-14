//! Cloud connector commands — WebDAV MVP (local credential store + PROPFIND list).

use crate::brand_generated::PRODUCT_NAME;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct WebDavStore {
    url: String,
    username: String,
    password: String,
}

fn webdav_config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("cloud_webdav.json"))
        .map_err(|e| e.to_string())
}

fn load_webdav_store(app: &AppHandle) -> Result<WebDavStore, String> {
    let path = webdav_config_path(app)?;
    if !path.exists() {
        return Ok(WebDavStore::default());
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&raw).map_err(|e| e.to_string())
}

fn save_webdav_store(app: &AppHandle, store: &WebDavStore) -> Result<(), String> {
    let path = webdav_config_path(app)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let raw = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    std::fs::write(path, raw).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize)]
pub struct WebDavConfigPublic {
    pub url: String,
    pub username: String,
    pub connected: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct WebDavEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
}

#[tauri::command]
pub async fn get_webdav_config(app: AppHandle) -> Result<WebDavConfigPublic, String> {
    let store = load_webdav_store(&app)?;
    Ok(WebDavConfigPublic {
        url: store.url.clone(),
        username: store.username.clone(),
        connected: !store.url.trim().is_empty() && !store.username.trim().is_empty(),
    })
}

#[tauri::command]
pub async fn save_webdav_config(
    app: AppHandle,
    url: String,
    username: String,
    password: Option<String>,
) -> Result<WebDavConfigPublic, String> {
    let mut store = load_webdav_store(&app)?;
    store.url = url.trim().to_string();
    store.username = username.trim().to_string();
    if let Some(p) = password.filter(|s| !s.is_empty()) {
        store.password = p;
    }
    save_webdav_store(&app, &store)?;
    Ok(WebDavConfigPublic {
        url: store.url.clone(),
        username: store.username.clone(),
        connected: !store.url.is_empty() && !store.username.is_empty(),
    })
}

#[tauri::command]
pub async fn disconnect_webdav(app: AppHandle) -> Result<(), String> {
    let path = webdav_config_path(&app)?;
    if path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn join_webdav_url(base: &str, rel: &str) -> String {
    let base = base.trim_end_matches('/');
    let rel = rel.trim_start_matches('/');
    if rel.is_empty() {
        format!("{base}/")
    } else {
        format!("{base}/{rel}")
    }
}

fn parse_propfind_entries(xml: &str, base_path: &str) -> Vec<WebDavEntry> {
    let response_re =
        Regex::new(r"(?is)<(?:[a-z0-9]+:)?response>(.*?)</(?:[a-z0-9]+:)?response>").unwrap();
    let href_re = Regex::new(r"(?i)<(?:[a-z0-9]+:)?href>([^<]+)</(?:[a-z0-9]+:)?href>").unwrap();
    let mut entries = Vec::new();
    for cap in response_re.captures_iter(xml) {
        let block = cap.get(1).map(|m| m.as_str()).unwrap_or("");
        let href = href_re
            .captures(block)
            .and_then(|c| c.get(1))
            .map(|m| m.as_str())
            .unwrap_or("")
            .trim();
        if href.is_empty() {
            continue;
        }
        let decoded = urlencoding::decode(href)
            .map(|s| s.into_owned())
            .unwrap_or_else(|_| href.to_string());
        let name = decoded
            .trim_end_matches('/')
            .rsplit('/')
            .next()
            .unwrap_or("")
            .to_string();
        if name.is_empty() {
            continue;
        }
        let is_dir = decoded.ends_with('/')
            || block.contains("<collection")
            || block.contains(":collection");
        if decoded.trim_end_matches('/') == base_path.trim_end_matches('/') {
            continue;
        }
        entries.push(WebDavEntry {
            name,
            path: decoded,
            is_dir,
            size: None,
        });
    }
    entries.sort_by(|a, b| b.is_dir.cmp(&a.is_dir).then(a.name.cmp(&b.name)));
    entries
}

#[tauri::command]
pub async fn list_webdav_files(
    app: AppHandle,
    path: Option<String>,
) -> Result<Vec<WebDavEntry>, String> {
    let store = load_webdav_store(&app)?;
    if store.url.trim().is_empty() {
        return Err("WebDAV not configured".into());
    }
    let rel = path.unwrap_or_default();
    let target = if rel.starts_with("http://") || rel.starts_with("https://") {
        rel
    } else {
        join_webdav_url(&store.url, &rel)
    };
    let body = r#"<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:getcontentlength/><d:resourcetype/></d:prop></d:propfind>"#;

    let client = reqwest::Client::builder()
        .user_agent(format!("{PRODUCT_NAME}-WebDAV/1.0"))
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .request(
            reqwest::Method::from_bytes(b"PROPFIND").map_err(|e| e.to_string())?,
            &target,
        )
        .header("Depth", "1")
        .header("Content-Type", "application/xml; charset=utf-8")
        .basic_auth(&store.username, Some(&store.password))
        .body(body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("WebDAV PROPFIND failed: HTTP {}", resp.status()));
    }

    let xml = resp.text().await.map_err(|e| e.to_string())?;
    Ok(parse_propfind_entries(&xml, &target))
}

/// Refresh cloud connector list — marks WebDAV connected when credentials exist.
pub async fn list_cloud_connectors(
    app: AppHandle,
) -> Result<Vec<super::extras::CloudConnector>, String> {
    let webdav = load_webdav_store(&app).ok();
    let webdav_connected = webdav
        .as_ref()
        .map(|s| !s.url.trim().is_empty() && !s.username.trim().is_empty())
        .unwrap_or(false);

    Ok(vec![
        super::extras::CloudConnector {
            id: "tencent_docs".into(),
            name: "腾讯文档".into(),
            provider: "tencent".into(),
            connected: false,
            available: false,
        },
        super::extras::CloudConnector {
            id: "feishu_docs".into(),
            name: "飞书云文档".into(),
            provider: "feishu".into(),
            connected: false,
            available: false,
        },
        super::extras::CloudConnector {
            id: "webdav".into(),
            name: "WebDAV".into(),
            provider: "webdav".into(),
            connected: webdav_connected,
            available: true,
        },
    ])
}
