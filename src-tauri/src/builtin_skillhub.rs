use crate::store::Database;
use anyhow::{Context, Result};
use std::path::{Path, PathBuf};

struct PreinstalledSkill {
    slug: &'static str,
    content: &'static str,
    source_url: Option<&'static str>,
    install_dir: bool,
}

const PPT_MASTER_SOURCE_URL: &str =
    "https://github.com/hugohe3/ppt-master/tree/main/skills/ppt-master";

const PREINSTALLED_SKILLS: &[PreinstalledSkill] = &[
    PreinstalledSkill {
        slug: "meeting-notes-assistant",
        content: include_str!("../builtin_skillhub/meeting-notes-assistant/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "word-docx",
        content: include_str!("../builtin_skillhub/word-docx/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "data-analysis-skill",
        content: include_str!("../builtin_skillhub/data-analysis-skill/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "ppt-master",
        content: include_str!("../builtin_skillhub/ppt-master/SKILL.md"),
        source_url: Some(PPT_MASTER_SOURCE_URL),
        install_dir: true,
    },
    PreinstalledSkill {
        slug: "pdf-convert-compdf",
        content: include_str!("../builtin_skillhub/pdf-convert-compdf/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "file-classifier",
        content: include_str!("../builtin_skillhub/file-classifier/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "invoice-organizer",
        content: include_str!("../builtin_skillhub/invoice-organizer/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "bigmodel-image-video",
        content: include_str!("../builtin_skillhub/bigmodel-image-video/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "xdesign",
        content: include_str!("../builtin_skillhub/xdesign/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "video-script-gen",
        content: include_str!("../builtin_skillhub/video-script-gen/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "ai-film-production",
        content: include_str!("../builtin_skillhub/ai-film-production/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "ppt-to-video",
        content: include_str!("../builtin_skillhub/ppt-to-video/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "gongzhonghao-xieshou",
        content: include_str!("../builtin_skillhub/gongzhonghao-xieshou/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "xiaohongshu-copywriter",
        content: include_str!("../builtin_skillhub/xiaohongshu-copywriter/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "unclecheng-reduce-ai-perception-v2",
        content: include_str!("../builtin_skillhub/unclecheng-reduce-ai-perception-v2/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "seo-competitor-analysis",
        content: include_str!("../builtin_skillhub/seo-competitor-analysis/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "viral-content-miner",
        content: include_str!("../builtin_skillhub/viral-content-miner/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "tencentads-delivery-smart-create",
        content: include_str!("../builtin_skillhub/tencentads-delivery-smart-create/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "pitchskill",
        content: include_str!("../builtin_skillhub/pitchskill/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "prd-generator",
        content: include_str!("../builtin_skillhub/prd-generator/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "fullstack-companion",
        content: include_str!("../builtin_skillhub/fullstack-companion/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "taro-miniprogram-dev",
        content: include_str!("../builtin_skillhub/taro-miniprogram-dev/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "sql-master",
        content: include_str!("../builtin_skillhub/sql-master/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
    PreinstalledSkill {
        slug: "testcase-generator-skill",
        content: include_str!("../builtin_skillhub/testcase-generator-skill/SKILL.md"),
        source_url: None,
        install_dir: false,
    },
];

fn remove_obsolete_skill(db: &Database, skills_root: &Path, skill_id: &str) {
    let _ = db.delete_skill(skill_id);
    let candidates = [
        crate::skills::provenance::installed_dir(skills_root).join(skill_id),
        skills_root.join(skill_id),
    ];

    let canonical_root = skills_root
        .canonicalize()
        .unwrap_or_else(|_| skills_root.to_path_buf());
    for dir in candidates {
        if !dir.exists() {
            continue;
        }
        match dir.canonicalize() {
            Ok(canonical_dir) if canonical_dir.starts_with(&canonical_root) => {
                if let Err(error) = std::fs::remove_dir_all(&canonical_dir) {
                    tracing::warn!(
                        "SkillHub preinstall: failed to remove obsolete skill '{}': {}",
                        skill_id,
                        error
                    );
                }
            }
            Ok(canonical_dir) => {
                tracing::warn!(
                    "SkillHub preinstall: refusing to remove obsolete skill outside root: {:?}",
                    canonical_dir
                );
            }
            Err(error) => tracing::warn!(
                "SkillHub preinstall: failed to resolve obsolete skill '{}': {}",
                skill_id,
                error
            ),
        }
    }
}

fn bundled_skill_dir(slug: &str, resource_skillhub_dir: Option<&Path>) -> Result<PathBuf> {
    let source_skillhub_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("builtin_skillhub");
    let candidates = [
        resource_skillhub_dir.map(|dir| dir.join(slug)),
        Some(source_skillhub_dir.join(slug)),
    ];

    candidates
        .into_iter()
        .flatten()
        .find(|dir| dir.join("SKILL.md").is_file())
        .with_context(|| format!("bundled skill '{}' not found", slug))
}

pub fn seed_preinstalled_skills(
    db: &Database,
    app_data_dir: &Path,
    resource_skillhub_dir: Option<&Path>,
) -> Result<usize> {
    let skills_root = crate::skills::service::skills_root_from_app_data(app_data_dir);
    let mut installed = 0usize;

    remove_obsolete_skill(db, &skills_root, "powerpoint___pptx");
    remove_obsolete_skill(db, &skills_root, "powerpoint-pptx");
    remove_obsolete_skill(db, &skills_root, "ppt-generator");
    remove_obsolete_skill(db, &skills_root, "ppt-generator-skill");

    for skill in PREINSTALLED_SKILLS {
        if let Err(error) =
            install_preinstalled_skill(skill, db, &skills_root, resource_skillhub_dir)
        {
            tracing::warn!(
                "SkillHub preinstall: failed to install bundled skill '{}': {}",
                skill.slug,
                error
            );
            continue;
        }
        installed += 1;
    }

    Ok(installed)
}

fn install_preinstalled_skill(
    skill: &PreinstalledSkill,
    db: &Database,
    skills_root: &Path,
    resource_skillhub_dir: Option<&Path>,
) -> Result<()> {
    let source_url = skill
        .source_url
        .map(str::to_string)
        .or_else(|| Some(format!("https://skillhub.cn/skills/{}", skill.slug)));
    if skill.install_dir {
        let src_dir = bundled_skill_dir(skill.slug, resource_skillhub_dir)?;
        crate::skills::service::install_from_skill_dir(
            db,
            skills_root,
            &src_dir,
            "skillhub",
            source_url,
            None,
        )?;
    } else {
        crate::skills::service::install_to_installed(
            db,
            skills_root,
            skill.content,
            "skillhub",
            source_url,
            None,
        )?;
    }
    Ok(())
}
