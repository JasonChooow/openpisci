use crate::store::Database;
use anyhow::Result;
use std::path::Path;

struct PreinstalledSkill {
    slug: &'static str,
    content: &'static str,
    extra_files: &'static [PreinstalledSkillFile],
}

struct PreinstalledSkillFile {
    path: &'static str,
    content: &'static [u8],
}

const NO_EXTRA_FILES: &[PreinstalledSkillFile] = &[];
const PPT_GENERATOR_EXTRA_FILES: &[PreinstalledSkillFile] = &[
    PreinstalledSkillFile {
        path: "scripts/package.json",
        content: include_bytes!("../builtin_skillhub/ppt-generator-skill/scripts/package.json"),
    },
    PreinstalledSkillFile {
        path: "scripts/generate.js",
        content: include_bytes!("../builtin_skillhub/ppt-generator-skill/scripts/generate.js"),
    },
    PreinstalledSkillFile {
        path: "templates/README.md",
        content: include_bytes!("../builtin_skillhub/ppt-generator-skill/templates/README.md"),
    },
    PreinstalledSkillFile {
        path: "references/配色方案.md",
        content: include_bytes!("../builtin_skillhub/ppt-generator-skill/references/配色方案.md"),
    },
    PreinstalledSkillFile {
        path: "references/MBE插画风格规范.md",
        content: include_bytes!("../builtin_skillhub/ppt-generator-skill/references/MBE插画风格规范.md"),
    },
    PreinstalledSkillFile {
        path: "references/复古卡通风格规范.md",
        content: include_bytes!("../builtin_skillhub/ppt-generator-skill/references/复古卡通风格规范.md"),
    },
    PreinstalledSkillFile {
        path: "references/9套新增风格规范.md",
        content: include_bytes!("../builtin_skillhub/ppt-generator-skill/references/9套新增风格规范.md"),
    },
    PreinstalledSkillFile {
        path: "references/7套新增风格规范.md",
        content: include_bytes!("../builtin_skillhub/ppt-generator-skill/references/7套新增风格规范.md"),
    },
];

const PREINSTALLED_SKILLS: &[PreinstalledSkill] = &[
    PreinstalledSkill { slug: "meeting-notes-assistant", content: include_str!("../builtin_skillhub/meeting-notes-assistant/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "word-docx", content: include_str!("../builtin_skillhub/word-docx/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "data-analysis-skill", content: include_str!("../builtin_skillhub/data-analysis-skill/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "ppt-generator-skill", content: include_str!("../builtin_skillhub/ppt-generator-skill/SKILL.md"), extra_files: PPT_GENERATOR_EXTRA_FILES },
    PreinstalledSkill { slug: "pdf-convert-compdf", content: include_str!("../builtin_skillhub/pdf-convert-compdf/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "file-classifier", content: include_str!("../builtin_skillhub/file-classifier/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "invoice-organizer", content: include_str!("../builtin_skillhub/invoice-organizer/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "bigmodel-image-video", content: include_str!("../builtin_skillhub/bigmodel-image-video/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "xdesign", content: include_str!("../builtin_skillhub/xdesign/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "video-script-gen", content: include_str!("../builtin_skillhub/video-script-gen/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "ai-film-production", content: include_str!("../builtin_skillhub/ai-film-production/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "ppt-to-video", content: include_str!("../builtin_skillhub/ppt-to-video/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "gongzhonghao-xieshou", content: include_str!("../builtin_skillhub/gongzhonghao-xieshou/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "xiaohongshu-copywriter", content: include_str!("../builtin_skillhub/xiaohongshu-copywriter/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "unclecheng-reduce-ai-perception-v2", content: include_str!("../builtin_skillhub/unclecheng-reduce-ai-perception-v2/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "seo-competitor-analysis", content: include_str!("../builtin_skillhub/seo-competitor-analysis/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "viral-content-miner", content: include_str!("../builtin_skillhub/viral-content-miner/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "tencentads-delivery-smart-create", content: include_str!("../builtin_skillhub/tencentads-delivery-smart-create/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "pitchskill", content: include_str!("../builtin_skillhub/pitchskill/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "prd-generator", content: include_str!("../builtin_skillhub/prd-generator/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "fullstack-companion", content: include_str!("../builtin_skillhub/fullstack-companion/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "taro-miniprogram-dev", content: include_str!("../builtin_skillhub/taro-miniprogram-dev/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "sql-master", content: include_str!("../builtin_skillhub/sql-master/SKILL.md"), extra_files: NO_EXTRA_FILES },
    PreinstalledSkill { slug: "testcase-generator-skill", content: include_str!("../builtin_skillhub/testcase-generator-skill/SKILL.md"), extra_files: NO_EXTRA_FILES },
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

pub fn seed_preinstalled_skills(db: &Database, app_data_dir: &Path) -> Result<usize> {
    let skills_root = crate::skills::service::skills_root_from_app_data(app_data_dir);
    let mut installed = 0usize;

    remove_obsolete_skill(db, &skills_root, "powerpoint___pptx");
    remove_obsolete_skill(db, &skills_root, "powerpoint-pptx");
    remove_obsolete_skill(db, &skills_root, "ppt-generator");

    for skill in PREINSTALLED_SKILLS {
        let source_url = Some(format!("https://skillhub.cn/skills/{}", skill.slug));
        let (skill_id, _) = crate::skills::service::install_to_installed(
            db,
            &skills_root,
            skill.content,
            "skillhub",
            source_url,
            None,
        )?;
        if !skill.extra_files.is_empty() {
            let skill_dir = crate::skills::provenance::installed_dir(&skills_root).join(&skill_id);
            for extra in skill.extra_files {
                let file_path = skill_dir.join(extra.path);
                if let Some(parent) = file_path.parent() {
                    std::fs::create_dir_all(parent)?;
                }
                std::fs::write(file_path, extra.content)?;
            }
        }
        installed += 1;
    }

    Ok(installed)
}
