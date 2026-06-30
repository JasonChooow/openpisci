import fs from "node:fs";
import path from "node:path";

const sourceRoot = "C:/Users/ZHOU/Documents/Glamoon/agency-agents-qinchuang";
const outputPath = "E:/9xbot/DimWork/src-tauri/src/builtin_qinchuang_experts.json";
const agentListPath = path.join(sourceRoot, "AGENT-LIST.md");

const DEFAULT_SUBCATEGORY = "\u901a\u7528";
const SOURCE_LABEL = "\u6765\u6e90\uff1aagency-agents-qinchuang";
const DEPARTMENT_DEVELOPMENT = "\u5f00\u53d1\u90e8";
const DEPARTMENT_MARKETING = "\u8425\u9500\u90e8";
const SUBCATEGORY_PAID_MEDIA = "\u5e7f\u544a\u6295\u653e";

const EXCLUDED_DEPARTMENTS = new Set([
  "GIS \u90e8",
  "\u4e13\u9879\u90e8",
  "\u7a7a\u95f4\u8ba1\u7b97\u90e8",
]);

const EXCLUDED_SLUGS = new Set([
  "engineering-software-architect",
  "engineering-senior-developer",
  "engineering-code-reviewer",
  "engineering-threat-detection-engineer",
  "security-threat-detection-engineer",
  "hr-recruiter",
  "marketing-xiaohongshu-specialist",
  "testing-reality-checker",
  "testing-evidence-collector",
  "xr-cockpit-interaction-specialist",
]);

const DEPARTMENT_ORDER = new Map([
  ["\u8bbe\u8ba1\u90e8", 10],
  [DEPARTMENT_MARKETING, 20],
  [DEPARTMENT_DEVELOPMENT, 30],
  ["\u4ea7\u54c1\u90e8", 40],
  ["\u9879\u76ee\u7ba1\u7406\u90e8", 50],
  ["\u9500\u552e\u90e8", 60],
  ["\u91d1\u878d\u90e8", 70],
  ["\u6cd5\u52a1\u90e8", 80],
  ["\u4eba\u529b\u8d44\u6e90\u90e8", 90],
  ["\u4f9b\u5e94\u94fe\u90e8", 100],
  ["\u652f\u6301\u90e8", 110],
  ["\u5b89\u5168\u90e8", 120],
  ["\u6d4b\u8bd5\u90e8", 130],
  ["\u5b66\u672f\u90e8", 900],
]);

const SUBCATEGORY_ORDER = new Map([
  ["\u56fd\u5185\u5e73\u53f0", 10],
  ["\u51fa\u6d77\u8425\u9500", 20],
  [SUBCATEGORY_PAID_MEDIA, 30],
  [DEFAULT_SUBCATEGORY, 40],
  ["Unity", 50],
  ["Unreal Engine", 60],
  ["Blender", 70],
  ["Godot", 80],
  ["Roblox Studio", 90],
]);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(fullPath);
    }
    return entry.isFile() && entry.name.endsWith(".md") ? [fullPath] : [];
  });
}

function normalizeRel(filePath) {
  return path.relative(sourceRoot, filePath).split(path.sep).join("/");
}

function stripEmojiAndSuffix(value) {
  return value
    .replace(/[\u200d\ufe0f]/g, "")
    .replace(/[\u{1f1e6}-\u{1f1ff}\u{1f300}-\u{1faff}\u2600-\u27bf\u2300-\u23ff]/gu, "")
    .replace(/\s*[\uff08(][^\uff09)]*[\uff09)]\s*$/u, "")
    .trim();
}

function parseFrontmatter(content, relPath) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) {
    throw new Error(`Missing frontmatter: ${relPath}`);
  }

  const meta = {};
  let currentKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    const next = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (next) {
      currentKey = next[1];
      meta[currentKey] = cleanYamlScalar(next[2]);
    } else if (currentKey && line.trim()) {
      meta[currentKey] = `${meta[currentKey]} ${line.trim()}`;
    }
  }

  const body = content.slice(match[0].length).trim();
  return { meta, body };
}

function cleanYamlScalar(value) {
  const trimmed = value.trim();
  const quoted = trimmed.match(/^["']([\s\S]*)["']$/);
  return quoted ? quoted[1] : trimmed;
}

function parseAgentList() {
  const content = fs.readFileSync(agentListPath, "utf8");
  const lines = content.split(/\r?\n/);
  const out = new Map();
  let department = "";
  let subcategory = DEFAULT_SUBCATEGORY;

  for (const line of lines) {
    const departmentMatch = line.match(/^##\s+(.+?)\s+\([^)]+\)\s*$/);
    if (departmentMatch) {
      department = departmentMatch[1].trim();
      subcategory = DEFAULT_SUBCATEGORY;
      continue;
    }

    const subcategoryMatch = line.match(/^###\s+(.+?)\s*$/);
    if (subcategoryMatch) {
      subcategory = subcategoryMatch[1].trim();
      continue;
    }

    const rowMatch = line.match(/^\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
    if (!rowMatch || !department) {
      continue;
    }

    out.set(rowMatch[1].trim(), {
      department,
      subcategory,
      catalogName: rowMatch[2].trim(),
      catalogDescription: rowMatch[3].trim(),
    });
  }

  return out;
}

function buildFileMap() {
  const fileMap = new Map();
  for (const filePath of walk(sourceRoot)) {
    const relPath = normalizeRel(filePath);
    if (
      relPath.startsWith("assets/") ||
      relPath.startsWith("examples/") ||
      relPath.startsWith("scripts/") ||
      relPath.startsWith("strategy/") ||
      !relPath.includes("/")
    ) {
      continue;
    }
    fileMap.set(path.basename(filePath, ".md"), { filePath, relPath });
  }
  return fileMap;
}

const agentInfo = parseAgentList();
const fileMap = buildFileMap();
const expertInputs = [];
const missingFiles = [];

for (const [slug, info] of agentInfo.entries()) {
  const file = fileMap.get(slug);
  if (!file) {
    missingFiles.push(slug);
    continue;
  }
  expertInputs.push({ slug, info, file });
}

function normalizeDepartment(department) {
  if (department === "\u5de5\u7a0b\u90e8" || department === "\u6e38\u620f\u5f00\u53d1\u90e8") {
    return DEPARTMENT_DEVELOPMENT;
  }
  if (department === "\u4ed8\u8d39\u5a92\u4f53\u90e8") {
    return DEPARTMENT_MARKETING;
  }
  return department;
}

function normalizeSubcategory(department, subcategory) {
  if (department === "\u4ed8\u8d39\u5a92\u4f53\u90e8") {
    return SUBCATEGORY_PAID_MEDIA;
  }
  return subcategory || DEFAULT_SUBCATEGORY;
}

function expertSortKey(item) {
  const department = normalizeDepartment(item.info.department);
  const subcategory = normalizeSubcategory(item.info.department, item.info.subcategory);
  return [
    DEPARTMENT_ORDER.get(department) ?? 800,
    SUBCATEGORY_ORDER.get(subcategory) ?? 500,
    item.file.relPath,
  ];
}

expertInputs.sort((a, b) => {
  const ka = expertSortKey(a);
  const kb = expertSortKey(b);
  return ka[0] - kb[0] || ka[1] - kb[1] || ka[2].localeCompare(kb[2], "en");
});

const experts = [];

for (const { slug, info, file } of expertInputs) {
  if (EXCLUDED_SLUGS.has(slug) || EXCLUDED_DEPARTMENTS.has(info.department)) {
    continue;
  }

  const content = fs.readFileSync(file.filePath, "utf8");
  const { meta, body } = parseFrontmatter(content, file.relPath);
  const originalName = meta.name || info.catalogName;
  const name = stripEmojiAndSuffix(originalName);
  const description = meta.description || info.catalogDescription;
  const department = normalizeDepartment(info.department);
  const subcategory = normalizeSubcategory(info.department, info.subcategory);
  const role = `${department} / ${subcategory}`;

  experts.push({
    slug,
    name,
    original_name: originalName,
    department,
    subcategory,
    role,
    description,
    system_prompt: `${body}\n\n---\n${SOURCE_LABEL} / ${file.relPath}`,
    icon: meta.emoji || "\u2728",
    color: meta.color || "#6366F1",
    source_path: file.relPath,
  });
}

if (missingFiles.length > 0) {
  throw new Error(`Missing expert files: ${missingFiles.join(", ")}`);
}

if (experts.length < 150) {
  throw new Error(`Expected at least 150 experts, got ${experts.length}`);
}

fs.writeFileSync(outputPath, `${JSON.stringify(experts, null, 2)}\n`, "utf8");
console.log(`Wrote ${experts.length} built-in Qinchuang experts to ${outputPath}`);
