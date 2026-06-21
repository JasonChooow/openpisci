//! GitHub JSON marketplace — fetch expert/team/skill packs and install locally.

use crate::commands::config::skills::{install_skill_from_content_sourced, SkillCatalogItem};
use crate::store::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
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
    #[serde(default)]
    pub featured: bool,
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
    #[serde(default)]
    pub featured: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketSkill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub download_url: String,
    #[serde(default = "default_source")]
    pub source: String,
    #[serde(default = "default_trusted")]
    pub trusted: bool,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub featured: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketConnector {
    pub id: String,
    pub name: String,
    pub description: String,
    pub download_url: String,
    #[serde(default = "default_source")]
    pub source: String,
    #[serde(default = "default_trusted")]
    pub trusted: bool,
    #[serde(default)]
    pub featured: bool,
    #[serde(default)]
    pub platform_compat: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MarketIndex {
    pub experts: Vec<MarketExpert>,
    pub teams: Vec<MarketTeam>,
    #[serde(default)]
    pub skills: Vec<MarketSkill>,
    #[serde(default)]
    pub connectors: Vec<MarketConnector>,
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

#[derive(Debug, Clone, Deserialize)]
struct MarketSkillManifest {
    #[allow(dead_code)]
    id: String,
    #[allow(dead_code)]
    name: String,
    #[allow(dead_code)]
    description: String,
}

fn default_market_url() -> String {
    "https://raw.githubusercontent.com/njbinbin/openpisci/main/marketplace/index.json".into()
}

async fn fetch_json<T: for<'de> Deserialize<'de>>(url: &str) -> Result<T, String> {
    let client = reqwest::Client::builder()
        .user_agent("XiaoNuo-Marketplace/1.0")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.json().await.map_err(|e| e.to_string())
}

async fn fetch_text(url: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("XiaoNuo-Marketplace/1.0")
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    resp.text().await.map_err(|e| e.to_string())
}

fn skill_md_url_from_manifest_url(manifest_url: &str) -> String {
    if manifest_url.ends_with("/manifest.json") {
        format!(
            "{}/SKILL.md",
            manifest_url.trim_end_matches("/manifest.json")
        )
    } else if manifest_url.ends_with("manifest.json") {
        manifest_url.replace("manifest.json", "SKILL.md")
    } else {
        format!("{}/SKILL.md", manifest_url.trim_end_matches('/'))
    }
}

fn dedup_key(source: &str, id: &str) -> String {
    format!("{source}:{id}")
}

#[tauri::command]
pub async fn fetch_marketplace_index(url: Option<String>) -> Result<MarketIndex, String> {
    let url = url
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(default_market_url);
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
    #[serde(default)]
    tags: Vec<String>,
    #[serde(default)]
    featured: bool,
    #[serde(default)]
    platform_compat: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct CloudMarketIndex {
    #[serde(default)]
    experts: Vec<CloudMarketSummary>,
    #[serde(default)]
    teams: Vec<CloudMarketSummary>,
    #[serde(default)]
    skills: Vec<CloudMarketSummary>,
    #[serde(default)]
    connectors: Vec<CloudMarketSummary>,
}

fn desktop_client_profile_query() -> String {
    let os = match std::env::consts::OS {
        "linux" => "linux",
        "macos" => "macos",
        "windows" => "windows",
        _ => "unknown",
    };
    let mut caps = vec!["mcp_stdio"];
    if os == "windows" {
        caps.push("com");
    }
    format!("surface=desktop&os={os}&capabilities={}", caps.join(","))
}

fn cloud_asset_url(base: &str, id: &str) -> String {
    format!(
        "{}/api/marketplace/asset/{}",
        base.trim_end_matches('/'),
        id
    )
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
    let mut skills: Vec<MarketSkill> = Vec::new();
    let mut connectors: Vec<MarketConnector> = Vec::new();
    let mut seen_experts: HashSet<String> = HashSet::new();
    let mut seen_teams: HashSet<String> = HashSet::new();
    let mut seen_skills: HashSet<String> = HashSet::new();
    let mut seen_connectors: HashSet<String> = HashSet::new();

    // 1) Official GitHub registry.
    let gh_url = github_url
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(default_market_url);
    if let Ok(idx) = fetch_json::<MarketIndex>(&gh_url).await {
        for mut e in idx.experts {
            e.source = "github".into();
            e.trusted = true;
            let key = dedup_key("github", &e.id);
            if seen_experts.insert(key) {
                experts.push(e);
            }
        }
        for mut t in idx.teams {
            t.source = "github".into();
            t.trusted = true;
            let key = dedup_key("github", &t.id);
            if seen_teams.insert(key) {
                teams.push(t);
            }
        }
        for mut s in idx.skills {
            s.source = "github".into();
            s.trusted = true;
            let key = dedup_key("github", &s.id);
            if seen_skills.insert(key) {
                skills.push(s);
            }
        }
    }

    // 2) Official cloud marketplace (public index; no auth required to browse).
    if let Some(base) = cloud_base_url.filter(|s| !s.trim().is_empty()) {
        let base = base.trim_end_matches('/').to_string();
        let profile = desktop_client_profile_query();
        let url = format!("{base}/api/marketplace/index?{profile}");
        if let Ok(cloud) = fetch_json::<CloudMarketIndex>(&url).await {
            for s in cloud.experts {
                let key = dedup_key("cloud", &s.id);
                if seen_experts.insert(key) {
                    experts.push(MarketExpert {
                        download_url: cloud_asset_url(&base, &s.id),
                        id: s.id,
                        name: s.name,
                        description: s.description,
                        source: "cloud".into(),
                        trusted: true,
                        featured: s.featured,
                    });
                }
            }
            for s in cloud.teams {
                let key = dedup_key("cloud", &s.id);
                if seen_teams.insert(key) {
                    teams.push(MarketTeam {
                        download_url: cloud_asset_url(&base, &s.id),
                        id: s.id,
                        name: s.name,
                        description: s.description,
                        source: "cloud".into(),
                        trusted: true,
                        featured: s.featured,
                    });
                }
            }
            for s in cloud.skills {
                let key = dedup_key("cloud", &s.id);
                if seen_skills.insert(key) {
                    skills.push(MarketSkill {
                        download_url: cloud_asset_url(&base, &s.id),
                        id: s.id,
                        name: s.name,
                        description: s.description,
                        source: "cloud".into(),
                        trusted: true,
                        tags: s.tags,
                        featured: s.featured,
                    });
                }
            }
            for s in cloud.connectors {
                let key = dedup_key("cloud", &s.id);
                if seen_connectors.insert(key) {
                    connectors.push(MarketConnector {
                        download_url: cloud_asset_url(&base, &s.id),
                        id: s.id,
                        name: s.name,
                        description: s.description,
                        source: "cloud".into(),
                        trusted: true,
                        featured: s.featured,
                        platform_compat: s.platform_compat,
                    });
                }
            }
        }
    }

    Ok(MarketIndex {
        experts,
        teams,
        skills,
        connectors,
    })
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

/// Install a skill from the OpenPisci marketplace catalog.
/// Fetches manifest.json, then SKILL.md from the same directory.
#[tauri::command]
pub async fn install_market_skill(
    state: State<'_, AppState>,
    download_url: String,
) -> Result<SkillCatalogItem, String> {
    let manifest_url = download_url.trim();
    if manifest_url.is_empty() {
        return Err("download_url is required".into());
    }

    let _manifest: MarketSkillManifest = fetch_json(manifest_url).await?;
    let skill_md_url = skill_md_url_from_manifest_url(manifest_url);
    let content = fetch_text(&skill_md_url)
        .await
        .map_err(|e| format!("Failed to fetch SKILL.md from {}: {}", skill_md_url, e))?;

    install_skill_from_content_sourced(&state, content, "openpisci-market", Some(skill_md_url))
        .await
}
