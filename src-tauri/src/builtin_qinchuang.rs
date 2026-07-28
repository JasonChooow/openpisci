use serde::Deserialize;
use std::collections::{HashMap, HashSet};

#[derive(Debug, Deserialize)]
struct BuiltinQinchuangExpert {
    slug: String,
    name: String,
    original_name: String,
    department: String,
    subcategory: String,
    role: String,
    description: String,
    system_prompt: String,
    icon: String,
    color: String,
    source_path: String,
}

const EXPERTS_JSON: &str = include_str!("builtin_qinchuang_experts.json");
const SOURCE: &str = "builtin-qinchuang";
const USER_INSTALLED_MARKER: &str = "9xbot-user-added-qinchuang-expert";
const CURATED_INSTALLED_EXPERT_SLUGS: &[&str] = &[
    "engineering-frontend-developer",
    "engineering-backend-architect",
    "engineering-minimal-change-engineer",
];

#[derive(Debug, Clone)]
pub struct BuiltinQinchuangSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub download_url: String,
    pub source: String,
    pub featured: bool,
    pub category: String,
    pub subcategory: String,
    pub source_path: String,
}

pub fn market_summaries() -> Result<Vec<BuiltinQinchuangSummary>, String> {
    let experts = parse_experts()?;
    Ok(experts
        .into_iter()
        .map(|expert| {
            let featured = is_curated_installed_slug(&expert.slug);
            BuiltinQinchuangSummary {
                id: format!("qinchuang/expert/{}@1.0.0", expert.slug),
                name: expert.name,
                description: expert.description,
                download_url: format!("qinchuang://expert/{}", expert.slug),
                source: SOURCE.to_string(),
                featured,
                category: expert.department,
                subcategory: expert.subcategory,
                source_path: expert.source_path,
            }
        })
        .collect())
}

pub fn install_expert_by_slug(
    db: &crate::store::Database,
    slug: &str,
) -> Result<String, String> {
    let experts = parse_experts()?;
    let expert = experts
        .into_iter()
        .find(|expert| expert.slug == slug)
        .ok_or_else(|| format!("unknown qinchuang expert slug: {slug}"))?;
    upsert_one(db, with_user_installed_marker(expert)).map(|koi_id| koi_id.unwrap_or_default())
}

pub fn seed_experts(db: &crate::store::Database) -> Result<usize, String> {
    let experts = parse_experts()?;
    let active_sources: HashSet<String> = experts
        .iter()
        .filter(|expert| is_curated_installed_slug(&expert.slug))
        .map(|expert| expert.source_path.clone())
        .collect();
    let mut created_or_updated = 0usize;
    for expert in experts {
        if !is_curated_installed_slug(&expert.slug) {
            continue;
        }
        if upsert_one(db, expert)?.is_some() {
            created_or_updated += 1;
        }
    }
    created_or_updated += remove_obsolete_experts(db, &active_sources)?;
    Ok(created_or_updated)
}

fn parse_experts() -> Result<Vec<BuiltinQinchuangExpert>, String> {
    serde_json::from_str(EXPERTS_JSON).map_err(|e| format!("invalid qinchuang experts: {e}"))
}

fn upsert_one(
    db: &crate::store::Database,
    expert: BuiltinQinchuangExpert,
) -> Result<Option<String>, String> {
    let existing_kois = db.list_kois().map_err(|e| e.to_string())?;
    let existing_by_name: HashMap<String, piscis_core::models::KoiDefinition> = existing_kois
        .iter()
        .cloned()
        .map(|koi| (koi.name.clone(), koi))
        .collect();
    let source_marker = format!("agency-agents-qinchuang / {}", expert.source_path);
    let existing_by_source = existing_kois
        .iter()
        .find(|koi| koi.system_prompt.contains(&source_marker))
        .cloned();
    let experts: Vec<BuiltinQinchuangExpert> =
        serde_json::from_str(EXPERTS_JSON).map_err(|e| format!("invalid qinchuang experts: {e}"))?;
    let expected_names = expected_seed_names(&experts);
    let clean_name = normalize_koi_name(&expert.name);
    let legacy_name = normalize_koi_name(&expert.original_name);
    let target_name = expected_names
        .get(&expert.slug)
        .cloned()
        .unwrap_or_else(|| clean_name.clone());

    let existing = existing_by_source.or_else(|| {
        existing_by_name
            .get(&target_name)
            .or_else(|| {
            if target_name == clean_name {
                existing_by_name.get(&legacy_name)
            } else {
                None
            }
            })
            .cloned()
    });

    if let Some(koi) = existing {
        let target_name_taken_by_other = existing_by_name
            .get(&target_name)
            .map(|other| other.id != koi.id)
            .unwrap_or(false);
        let name_update = if target_name_taken_by_other {
            None
        } else {
            Some(target_name.as_str())
        };

        db.update_koi(
            &koi.id,
            name_update,
            Some(&expert.role),
            Some(&expert.icon),
            Some(&expert.color),
            Some(&expert.system_prompt),
            Some(&expert.description),
            None,
            None,
            None,
        )
        .map_err(|e| format!("failed to update qinchuang expert {clean_name}: {e}"))?;
        return Ok(Some(koi.id.clone()));
    }

    let existing_names: HashSet<String> = existing_by_name.keys().cloned().collect();
    let name = target_name;
    if name.is_empty() || existing_names.contains(&name) {
        return Ok(None);
    }

    let koi = db
        .create_koi(
            &name,
            &expert.role,
            &expert.icon,
            &expert.color,
            &expert.system_prompt,
            &expert.description,
            None,
            0,
            0,
        )
        .map_err(|e| format!("failed to seed qinchuang expert {name}: {e}"))?;

    Ok(Some(koi.id))
}

fn remove_obsolete_experts(
    db: &crate::store::Database,
    active_sources: &HashSet<String>,
) -> Result<usize, String> {
    let existing_kois = db.list_kois().map_err(|e| e.to_string())?;
    let mut removed = 0usize;
    for koi in existing_kois {
        if should_keep_existing_expert(&koi, active_sources) {
            continue;
        }
        db.delete_koi(&koi.id)
            .map_err(|e| format!("failed to remove obsolete qinchuang expert {}: {e}", koi.name))?;
        removed += 1;
    }
    Ok(removed)
}

fn should_keep_existing_expert(
    koi: &piscis_core::models::KoiDefinition,
    active_sources: &HashSet<String>,
) -> bool {
    let name = koi.name.trim();
    let role = koi.role.trim();
    if contains_bad_text(name) || contains_bad_text(role) {
        return false;
    }

    if force_deleted_name(name) {
        return false;
    }

    let Some(source_path) = qinchuang_source_path(&koi.system_prompt) else {
        return true;
    };

    if force_deleted_source(source_path) {
        return false;
    }

    active_sources.contains(source_path)
        || koi.system_prompt.contains(USER_INSTALLED_MARKER)
}

fn is_curated_installed_slug(slug: &str) -> bool {
    CURATED_INSTALLED_EXPERT_SLUGS.contains(&slug)
}

fn with_user_installed_marker(mut expert: BuiltinQinchuangExpert) -> BuiltinQinchuangExpert {
    if !expert.system_prompt.contains(USER_INSTALLED_MARKER) {
        expert
            .system_prompt
            .push_str(&format!("\n\n{}", USER_INSTALLED_MARKER));
    }
    expert
}

fn contains_bad_text(value: &str) -> bool {
    value.contains('?') || value.contains('\u{fffd}')
}

fn force_deleted_name(name: &str) -> bool {
    matches!(
        name,
        "小红书专家"
            | "微信公众号管理"
            | "软件架构师"
            | "高级开发者"
            | "代码审查员"
            | "威胁检测工程师"
            | "招聘专家"
            | "现实检验者"
            | "证据收集者"
            | "XR座舱交互专家"
            | "XR 座舱交互专家"
    )
}

fn force_deleted_source(source_path: &str) -> bool {
    source_path.starts_with("gis/")
        || source_path.starts_with("specialized/")
        || source_path.starts_with("spatial-computing/")
        || matches!(
            source_path,
            "engineering/engineering-software-architect.md"
                | "engineering/engineering-senior-developer.md"
                | "engineering/engineering-code-reviewer.md"
                | "engineering/engineering-threat-detection-engineer.md"
                | "security/security-threat-detection-engineer.md"
                | "hr/hr-recruiter.md"
                | "marketing/marketing-wechat-official-account.md"
                | "marketing/marketing-xiaohongshu-specialist.md"
                | "testing/testing-reality-checker.md"
                | "testing/testing-evidence-collector.md"
        )
}

fn qinchuang_source_path(system_prompt: &str) -> Option<&str> {
    let marker = "agency-agents-qinchuang / ";
    let start = system_prompt.rfind(marker)? + marker.len();
    system_prompt[start..]
        .lines()
        .next()
        .map(str::trim)
        .filter(|s| !s.is_empty())
}

fn expected_seed_names(experts: &[BuiltinQinchuangExpert]) -> HashMap<String, String> {
    let existing_names = HashSet::new();
    let mut seeded_names = HashSet::new();
    let mut out = HashMap::new();
    for expert in experts {
        let base_name = normalize_koi_name(&expert.name);
        let name = unique_seed_name(&base_name, &expert.role, &existing_names, &seeded_names);
        seeded_names.insert(name.clone());
        out.insert(expert.slug.clone(), name);
    }
    out
}

fn unique_seed_name(
    base_name: &str,
    role: &str,
    existing_names: &HashSet<String>,
    seeded_names: &HashSet<String>,
) -> String {
    if !seeded_names.contains(base_name) {
        return base_name.to_string();
    }

    let role_name = normalize_koi_name(role);
    if !role_name.is_empty() {
        let candidate = format!("{base_name}-{role_name}");
        if !existing_names.contains(&candidate) && !seeded_names.contains(&candidate) {
            return candidate;
        }
    }

    for i in 2.. {
        let candidate = format!("{base_name}-{i}");
        if !existing_names.contains(&candidate) && !seeded_names.contains(&candidate) {
            return candidate;
        }
    }
    unreachable!("unbounded suffix search should always return a name")
}

fn normalize_koi_name(name: &str) -> String {
    name.trim()
        .chars()
        .filter(|ch| !ch.is_whitespace() && !is_pictographic_or_emoji(*ch))
        .collect()
}

fn is_pictographic_or_emoji(ch: char) -> bool {
    let cp = ch as u32;
    matches!(
        cp,
        0x200D
            | 0xFE0F
            | 0x1F1E6..=0x1F1FF
            | 0x1F300..=0x1FAFF
            | 0x2600..=0x27BF
            | 0x2300..=0x23FF
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_experts_have_unique_seed_names() {
        let experts: Vec<BuiltinQinchuangExpert> =
            serde_json::from_str(EXPERTS_JSON).expect("bundled experts JSON should parse");
        assert!(experts.len() >= 150);

        let existing_names = HashSet::new();
        let mut seeded_names = HashSet::new();
        for expert in experts {
            let base_name = normalize_koi_name(&expert.name);
            let name = unique_seed_name(&base_name, &expert.role, &existing_names, &seeded_names);
            assert!(seeded_names.insert(name));
        }
    }

    #[test]
    fn curated_default_experts_are_bounded_and_present() {
        let experts: Vec<BuiltinQinchuangExpert> =
            serde_json::from_str(EXPERTS_JSON).expect("bundled experts JSON should parse");
        let slugs: HashSet<&str> = experts.iter().map(|expert| expert.slug.as_str()).collect();

        assert!(CURATED_INSTALLED_EXPERT_SLUGS.len() <= 20);
        for slug in CURATED_INSTALLED_EXPERT_SLUGS {
            assert!(slugs.contains(slug), "missing curated expert slug: {slug}");
        }
    }
}
