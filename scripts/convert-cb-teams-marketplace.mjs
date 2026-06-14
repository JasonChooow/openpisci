#!/usr/bin/env node
/**
 * Convert CB Teams vendor tree → OpenPisci marketplace catalog (experts, teams, skills).
 * Source: marketplace/vendor/cb-teams (see marketplace/SOURCE-CB-TEAMS.md)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VENDOR = path.join(ROOT, "marketplace/vendor/cb-teams");
const OUT_EXPERTS = path.join(ROOT, "marketplace/experts");
const OUT_TEAMS = path.join(ROOT, "marketplace/teams");
const OUT_SKILLS = path.join(ROOT, "marketplace/skills");
const OUT_INSPIRATION = path.join(ROOT, "marketplace/inspiration");
const PUBLISHER = "openpisci";
const PISCIS_VERSION = "1.0.0";
const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/njbinbin/openpisci/main/marketplace";

const PLUGIN_ZH = {
  "internal-comms": "内部沟通",
  "executing-marketing-campaigns": "营销活动",
  "document-skills": "文档处理",
  "general-skills": "通用技能",
  "data-analysis": "数据分析",
  "modern-webapp": "现代 Web 应用",
  "ppt-implement": "演示文稿",
  "deep-research": "深度研究",
  "data": "数据可视化",
  finance: "财务通用",
  "product-management": "产品管理",
  "design-to-code": "设计转代码",
  "codebuddy-chat-web": "Web 对话应用",
  "webapp-testing": "Web 应用测试",
  "dockerfile-gen": "Dockerfile 生成",
  "remotion-video-generator": "Remotion 视频",
  "agent-sdk-dev": "Agent SDK 开发",
  "skill-creator": "技能创作",
  "financial-analysis": "金融分析",
  "investment-banking": "投资银行",
  "equity-research": "股票研究",
  "private-equity": "私募股权",
  "wealth-management": "财富管理",
  lseg: "LSEG 金融数据",
  spglobal: "标普全球数据",
  "finance-data": "金融数据检索",
  "trading-assistant": "交易分析",
};

const CATEGORY_META = {
  productivity: { icon: "📋", color: "#6366f1" },
  utility: { icon: "🛠️", color: "#64748b" },
  development: { icon: "💻", color: "#0ea5e9" },
  research: { icon: "🔍", color: "#8b5cf6" },
  finance: { icon: "💹", color: "#059669" },
};

const PISCIS_TOOL_MAP = {
  WebSearch: "web_search",
  web_search: "web_search",
  WebFetch: "web_fetch",
  web_fetch: "web_fetch",
  Glob: "file_search",
  Grep: "shell",
  Bash: "shell",
  Read: "file_read",
  Write: "file_write",
  Edit: "file_edit",
  NotebookEdit: "file_edit",
  browser: "browser",
  Browser: "browser",
};

const DEFAULT_TOOLS = ["file_read", "file_write", "shell", "web_search", "web_fetch"];

const SKIP_COPY_DIRS = new Set([
  "node_modules",
  ".git",
  "__pycache__",
  ".pytest_cache",
]);

function rewriteText(text) {
  if (!text) return "";
  return text
    .replace(/\bClaude Code\b/gi, "小诺")
    .replace(/\bClaude\b/gi, "小诺")
    .replace(/\bCodeBuddy\b/gi, "小诺")
    .replace(/\bAnthropic\b/gi, "")
    .replace(/\bOpenClaw\b/gi, "小诺")
    .replace(/\bGlob\b/g, "file_search")
    .replace(/\bGrep\b/g, "shell")
    .replace(/\bWebFetch\b/g, "web_fetch")
    .replace(/\bWebSearch\b/g, "web_search")
    .replace(/\bgoogle_drive_search\b/g, "file_search")
    .replace(/\bgmail tools\b/gi, "email 工具")
    .replace(/\brepl\b/g, "code_run")
    .replace(/agentMode:.*\n/gi, "")
    .replace(/enabledAutoRun:.*\n/gi, "")
    .replace(/model:.*\n/gi, "")
    .replace(/\bsubagent\b/gi, "子 Agent")
    .replace(/code-explorer subagent/gi, "代码探索")
    .replace(/\blist_dir\b/g, "file_list")
    .replace(/\bsearch_file\b/g, "file_search")
    .replace(/\bsearch_content\b/g, "shell")
}

function parseFrontmatter(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return { fm: {}, body: content };
  const fm = {};
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (val.startsWith("[") && val.endsWith("]")) {
      fm[key] = val
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    } else {
      fm[key] = val.replace(/^['"]|['"]$/g, "");
    }
  }
  return { fm, body: m[2] };
}

function serializeFrontmatter(fm) {
  const lines = ["---"];
  for (const [k, v] of Object.entries(fm)) {
    if (Array.isArray(v)) {
      lines.push(`${k}: [${v.map((x) => `"${x}"`).join(", ")}]`);
    } else if (v !== undefined && v !== "") {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}

function mapTools(tools) {
  const out = new Set(DEFAULT_TOOLS);
  for (const t of tools || []) {
    const mapped = PISCIS_TOOL_MAP[t] || t;
    if (
      [
        "file_read",
        "file_write",
        "file_edit",
        "shell",
        "web_search",
        "web_fetch",
        "browser",
        "office",
        "email",
        "code_run",
        "file_search",
        "memory_store",
        "skill_list",
        "skill_search",
      ].includes(mapped)
    ) {
      out.add(mapped);
    }
  }
  return [...out];
}

function walkSkillFiles(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_COPY_DIRS.has(ent.name)) continue;
      walkSkillFiles(p, acc);
    } else if (ent.name === "SKILL.md") {
      acc.push(p);
    }
  }
  return acc;
}

function copySkillAssets(srcDir, destDir, skillMdRel) {
  function copyRecursive(from, to) {
    if (!fs.existsSync(from)) return;
    fs.mkdirSync(to, { recursive: true });
    for (const ent of fs.readdirSync(from, { withFileTypes: true })) {
      if (SKIP_COPY_DIRS.has(ent.name)) continue;
      const sf = path.join(from, ent.name);
      const df = path.join(to, ent.name);
      if (ent.isDirectory()) copyRecursive(sf, df);
      else if (ent.name !== "SKILL.md" || path.relative(srcDir, sf) !== skillMdRel) {
        if (ent.name === "SKILL.md" && path.resolve(sf) === path.resolve(path.join(srcDir, "SKILL.md")))
          continue;
        fs.mkdirSync(path.dirname(df), { recursive: true });
        fs.copyFileSync(sf, df);
      }
    }
  }
  copyRecursive(srcDir, destDir);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(obj, null, 2)}\n`, "utf8");
}

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildExpertId(slug) {
  return `${PUBLISHER}/expert/${slug}@${PISCIS_VERSION}`;
}

function buildTeamId(slug) {
  return `${PUBLISHER}/team/${slug}@${PISCIS_VERSION}`;
}

function buildSkillId(slug) {
  return `${PUBLISHER}/skill/${slug}@${PISCIS_VERSION}`;
}

function main() {
  if (!fs.existsSync(VENDOR)) {
    console.error("Missing vendor tree:", VENDOR);
    process.exit(1);
  }

  const marketplace = readJson(path.join(VENDOR, ".codebuddy-plugin/marketplace.json"));
  const scenes = readJson(path.join(VENDOR, "scenes.json"));
  const pluginByName = Object.fromEntries(marketplace.plugins.map((p) => [p.name, p]));

  fs.mkdirSync(OUT_EXPERTS, { recursive: true });
  fs.mkdirSync(OUT_TEAMS, { recursive: true });
  fs.mkdirSync(OUT_SKILLS, { recursive: true });
  fs.mkdirSync(OUT_INSPIRATION, { recursive: true });

  const skillSlugRegistry = new Map();
  const expertPackages = [];
  const skillManifests = [];

  for (const plugin of marketplace.plugins) {
    const slug = slugify(plugin.name);
    const pluginDir = path.join(VENDOR, "plugins", plugin.name);
    const meta = CATEGORY_META[plugin.category] || { icon: "🎯", color: "#7c6af7" };
    const displayZh = PLUGIN_ZH[plugin.name] || plugin.name;

    const skillPaths = walkSkillFiles(pluginDir);
    const skillSummaries = [];
    const linkedSkillIds = [];

    for (const skillPath of skillPaths) {
      const skillDir = path.dirname(skillPath);
      const skillDirName = path.basename(skillDir);
      let skillSlug = slugify(skillDirName);
      if (skillSlugRegistry.has(skillSlug)) {
        skillSlug = slugify(`${plugin.name}-${skillDirName}`);
      }
      skillSlugRegistry.set(skillSlug, true);

      const raw = fs.readFileSync(skillPath, "utf8");
      const { fm, body } = parseFrontmatter(raw);
      const tools = mapTools(Array.isArray(fm.tools) ? fm.tools : fm.tools ? [fm.tools] : []);
      const description = rewriteText(
        fm.description || `${displayZh} — ${plugin.description}`.slice(0, 240),
      );
      const instructions = rewriteText(body);
      const newFm = {
        name: skillSlug,
        description,
        version: plugin.version || "1.0.0",
        author: PUBLISHER,
        tools,
        source: "marketplace",
        lifecycle: "catalog",
        triggers: [],
      };

      if (instructions.match(/关键词|Keywords/i)) {
        const kwBlock = instructions.match(/(?:## Keywords|## 关键词)[^\n]*\n([\s\S]*?)(?:\n## |\n$)/i);
        if (kwBlock) {
          newFm.triggers = kwBlock[1]
            .split(/[,，、\n]/)
            .map((s) => s.trim())
            .filter((s) => s.length > 1 && s.length < 40)
            .slice(0, 12);
        }
      }

      const destDir = path.join(OUT_SKILLS, skillSlug);
      fs.mkdirSync(destDir, { recursive: true });
      fs.writeFileSync(
        path.join(destDir, "SKILL.md"),
        `${serializeFrontmatter(newFm)}\n\n${instructions}\n`,
        "utf8",
      );
      copySkillAssets(skillDir, destDir, "SKILL.md");

      const skillId = buildSkillId(skillSlug);
      linkedSkillIds.push(skillId);
      skillSummaries.push(instructions.slice(0, 1200));
      skillManifests.push({
        spec_version: 1,
        id: skillId,
        name: fm.name ? rewriteText(String(fm.name)) : skillSlug,
        description,
        plugin: plugin.name,
        tools,
        path: `skills/${skillSlug}`,
      });
      writeJson(path.join(destDir, "manifest.json"), skillManifests[skillManifests.length - 1]);
    }

    let agentText = "";
    const agentsDir = path.join(pluginDir, "agents");
    if (fs.existsSync(agentsDir)) {
      for (const f of fs.readdirSync(agentsDir).filter((x) => x.endsWith(".md"))) {
        agentText += rewriteText(fs.readFileSync(path.join(agentsDir, f), "utf8")) + "\n";
      }
    }

    const system_prompt = `你是「${displayZh}」专家，运行在 DimWork 桌面 Agent 环境中（小诺协调层）。

## 职责
${rewriteText(plugin.description)}

## 工作方式
- 使用工作区内的 file_read / file_write / shell / browser / office 等工具完成任务。
- 通过 skill_list、skill_search 加载已安装技能；推荐技能：${linkedSkillIds.map((id) => id.split("/")[2].split("@")[0]).join("、") || "（见 marketplace/skills）"}。
- 不假设 CodeBuddy 专有运行时；MCP 与 SSH 需用户在设置中预先配置。
- 输出使用简体中文，结构清晰，可交付文件时写入工作区。

${agentText ? `## 协作细则\n${agentText.slice(0, 3500)}\n` : ""}
${skillSummaries.length ? `## 技能要点\n${skillSummaries.slice(0, 3).join("\n\n---\n\n").slice(0, 4000)}` : ""}`;

    const expert = {
      spec_version: 1,
      id: buildExpertId(slug),
      name: displayZh,
      description: rewriteText(plugin.description).slice(0, 280),
      system_prompt,
      icon: meta.icon,
      color: meta.color,
      origin: "cb-teams",
      origin_plugin: plugin.name,
      origin_version: plugin.version || "1.0.0",
      skill_ids: linkedSkillIds,
    };
    writeJson(path.join(OUT_EXPERTS, `${slug}.json`), expert);
    expertPackages.push(expert);
  }

  const teamPackages = [];
  for (const scene of scenes) {
    const teamSlug = slugify(`scene-${scene.id}-${scene.name}`);
    const pluginNames = (scene.plugins || []).map((p) => p.name);
    const members = pluginNames.map((pName, idx) => {
      const slug = slugify(pName);
      const expert = expertPackages.find((e) => e.id === buildExpertId(slug));
      const role = PLUGIN_ZH[pName] || pName;
      return {
        member_id: slug,
        role,
        name: expert?.name || role,
        description: expert?.description || "",
        system_prompt: expert?.system_prompt || `你是${role}专家，在小诺环境中协作完成：${scene.name}`,
        icon: expert?.icon || "👤",
        color: expert?.color || "#7c6af7",
        source_id: expert?.id,
        source_version: PISCIS_VERSION,
      };
    });

    const prompts = (scene.prompts || []).map((p) => rewriteText(p));
    const org_spec = `# ${scene.name}\n\n${pluginNames.map((n) => `- **${PLUGIN_ZH[n] || n}**`).join("\n")}\n\n## 示例任务\n${prompts.map((p, i) => `${i + 1}. ${p.slice(0, 200)}${p.length > 200 ? "…" : ""}`).join("\n")}\n`;

    const team = {
      spec_version: 2,
      id: buildTeamId(teamSlug),
      name: scene.name,
      description: `来自 CB Teams 场景「${scene.name}」：${pluginNames.map((n) => PLUGIN_ZH[n] || n).join(" + ")}`,
      org_spec,
      members,
      origin: "cb-teams",
      origin_scene_id: scene.id,
      example_prompts: prompts,
    };
    writeJson(path.join(OUT_TEAMS, `${teamSlug}.json`), team);
    teamPackages.push(team);
  }

  const inspiration = {
    spec_version: 1,
    publisher: PUBLISHER,
    source: "cb-teams",
    scenes: scenes.map((s) => ({
      id: s.id,
      name: s.name,
      plugins: (s.plugins || []).map((p) => p.name),
      prompts: (s.prompts || []).map((p) => rewriteText(p)),
      team_id: buildTeamId(slugify(`scene-${s.id}-${s.name}`)),
    })),
  };
  writeJson(path.join(OUT_INSPIRATION, "cb-teams-scenes.json"), inspiration);

  writeJson(
    path.join(OUT_SKILLS, "index.json"),
    {
      spec_version: 1,
      publisher: PUBLISHER,
      skills: skillManifests.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        download_url: `${GITHUB_RAW_BASE}/skills/${path.basename(s.path)}/manifest.json`,
      })),
    },
  );

  const indexExperts = expertPackages.map((e) => ({
    id: e.id,
    name: e.name,
    description: e.description,
    download_url: `${GITHUB_RAW_BASE}/experts/${e.id.split("/")[2].split("@")[0]}.json`,
    source: "github",
    trusted: true,
    tags: ["cb-teams"],
  }));

  const indexTeams = teamPackages.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    download_url: `${GITHUB_RAW_BASE}/teams/${t.id.split("/")[2].split("@")[0]}.json`,
    source: "github",
    trusted: true,
    tags: ["cb-teams"],
  }));

  const existingIndex = fs.existsSync(path.join(ROOT, "marketplace/index.json"))
    ? readJson(path.join(ROOT, "marketplace/index.json"))
    : { experts: [], teams: [] };

  const keepExperts = (existingIndex.experts || []).filter(
    (e) => !e.id?.startsWith(`${PUBLISHER}/expert/`) || !e.tags?.includes?.("cb-teams"),
  );
  const keepTeams = (existingIndex.teams || []).filter(
    (t) => !t.id?.startsWith(`${PUBLISHER}/team/`) || !t.tags?.includes?.("cb-teams"),
  );

  writeJson(path.join(ROOT, "marketplace/index.json"), {
    experts: [...keepExperts, ...indexExperts],
    teams: [...keepTeams, ...indexTeams],
    skills: skillManifests.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      download_url: `${GITHUB_RAW_BASE}/skills/${path.basename(s.path)}/manifest.json`,
      source: "github",
      trusted: true,
      tags: ["cb-teams"],
    })),
  });

  console.log(
    JSON.stringify(
      {
        experts: expertPackages.length,
        teams: teamPackages.length,
        skills: skillManifests.length,
        inspiration_scenes: scenes.length,
      },
      null,
      2,
    ),
  );
}

main();
