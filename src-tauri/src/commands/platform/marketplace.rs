//! GitHub JSON marketplace — fetch expert/team packs and install locally.

use crate::store::AppState;
use serde::{Deserialize, Serialize};
use tauri::State;

fn default_source() -> String {
    "github".into()
}

fn default_trusted() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketExpert {
    pub id: String,
    pub name: String,
    pub description: String,
    pub download_url: String,
    /// Origin source id: "github" | "cloud" | "clawhub" | custom.
    #[serde(default = "default_source")]
    pub source: String,
    /// Whether the source is an official/trusted registry.
    #[serde(default = "default_trusted")]
    pub trusted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketTeam {
    pub id: String,
    pub name: String,
    pub description: String,
    pub download_url: String,
    #[serde(default = "default_source")]
    pub source: String,
    #[serde(default = "default_trusted")]
    pub trusted: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketIndex {
    pub experts: Vec<MarketExpert>,
    pub teams: Vec<MarketTeam>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketTeamExpertMember {
    pub member_id: String,
    pub role: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub system_prompt: String,
    #[serde(default = "default_expert_icon")]
    pub icon: String,
    #[serde(default = "default_expert_color")]
    pub color: String,
    pub source_id: Option<String>,
    pub source_version: Option<String>,
}

fn default_expert_icon() -> String {
    "🎯".into()
}

fn default_expert_color() -> String {
    "#7c5cff".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketTeamPackage {
    pub id: String,
    #[serde(default)]
    pub spec_version: u32,
    pub name: String,
    pub description: String,
    #[serde(default)]
    pub roles: Vec<String>,
    pub org_spec: Option<String>,
    #[serde(default)]
    pub members: Vec<MarketTeamExpertMember>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketExpertPackage {
    pub id: String,
    #[serde(default)]
    pub spec_version: u32,
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    #[serde(default = "default_expert_icon")]
    pub icon: String,
    #[serde(default = "default_expert_color")]
    pub color: String,
}

fn default_market_url() -> String {
    "https://raw.githubusercontent.com/njbinbin/openpisci/main/marketplace/index.json".into()
}

async fn fetch_json<T: for<'de> Deserialize<'de>>(url: &str) -> Result<T, String> {
    let client = reqwest::Client::builder()
        .user_agent("XiaoNuo-Marketplace/1.0")
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.json().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn fetch_marketplace_index(url: Option<String>) -> Result<MarketIndex, String> {
    let url = url.filter(|s| !s.trim().is_empty()).unwrap_or_else(default_market_url);
    fetch_json(&url).await
}

// ─── Multi-source aggregation ─────────────────────────────────────────────────

/// Summary item as returned by the cloud `/api/marketplace/index` endpoint.
#[derive(Debug, Clone, Deserialize)]
struct CloudMarketSummary {
    id: String,
    name: String,
    #[serde(default)]
    description: String,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct CloudMarketIndex {
    #[serde(default)]
    experts: Vec<CloudMarketSummary>,
    #[serde(default)]
    teams: Vec<CloudMarketSummary>,
}

fn cloud_asset_url(base: &str, id: &str) -> String {
    format!("{}/api/marketplace/asset/{}", base.trim_end_matches('/'), id)
}

/// Aggregate the marketplace from multiple sources:
/// - the official GitHub registry (always), and
/// - the official cloud marketplace when a cloud base URL is known.
///
/// Items are tagged with their `source` and `trusted` flag so the UI can group
/// and label them. Individual source failures are tolerated.
#[tauri::command]
pub async fn fetch_marketplace_aggregated(
    cloud_base_url: Option<String>,
    github_url: Option<String>,
) -> Result<MarketIndex, String> {
    let mut experts: Vec<MarketExpert> = Vec::new();
    let mut teams: Vec<MarketTeam> = Vec::new();

    // 1) Official GitHub registry.
    let gh_url = github_url
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(default_market_url);
    if let Ok(idx) = fetch_json::<MarketIndex>(&gh_url).await {
        for mut e in idx.experts {
            e.source = "github".into();
            e.trusted = true;
            experts.push(e);
        }
        for mut t in idx.teams {
            t.source = "github".into();
            t.trusted = true;
            teams.push(t);
        }
    }

    // 2) Official cloud marketplace (public index; no auth required to browse).
    if let Some(base) = cloud_base_url.filter(|s| !s.trim().is_empty()) {
        let base = base.trim_end_matches('/').to_string();
        let url = format!("{base}/api/marketplace/index");
        if let Ok(cloud) = fetch_json::<CloudMarketIndex>(&url).await {
            for s in cloud.experts {
                experts.push(MarketExpert {
                    download_url: cloud_asset_url(&base, &s.id),
                    id: s.id,
                    name: s.name,
                    description: s.description,
                    source: "cloud".into(),
                    trusted: true,
                });
            }
            for s in cloud.teams {
                teams.push(MarketTeam {
                    download_url: cloud_asset_url(&base, &s.id),
                    id: s.id,
                    name: s.name,
                    description: s.description,
                    source: "cloud".into(),
                    trusted: true,
                });
            }
        }
    }

    Ok(MarketIndex { experts, teams })
}

#[tauri::command]
pub async fn fetch_market_team_package(url: String) -> Result<MarketTeamPackage, String> {
    fetch_json(&url).await
}

#[tauri::command]
pub async fn install_market_expert(
    state: State<'_, AppState>,
    download_url: String,
) -> Result<String, String> {
    let pkg: MarketExpertPackage = fetch_json(&download_url).await?;
    let db = state.db.lock().await;
    let koi = db
        .create_koi(
            &pkg.name,
            "expert",
            &pkg.icon,
            &pkg.color,
            &pkg.system_prompt,
            &pkg.description,
            None,
            0,
            0,
        )
        .map_err(|e| e.to_string())?;
    Ok(koi.id)
}
