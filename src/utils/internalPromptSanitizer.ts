export const INTERNAL_PROMPT_LEAK_FALLBACK = "包子已读取技能说明，正在按你的需求处理。";
export const INTERNAL_TOOL_SCHEMA_ERROR_FALLBACK =
  "包子刚才写入文件时缺少保存位置，已调整为使用当前工作区的完整路径继续处理。";

const INTERNAL_MARKERS = [
  "Mandatory selected skill instructions",
  "The selected skill instructions are embedded in this message",
  "Auto-selected skill routing:",
  "User-selected skill routing:",
];

const INTERNAL_SECTION_HEADINGS = [
  "## Skill:",
  "Skill: ",
  "## When to Use",
  "When to Use",
  "## Core Rules",
  "Core Rules",
];

function looksLikeStandaloneSkillDoc(content: string): boolean {
  const normalized = content.replace(/\r\n/g, "\n").trimStart();
  const firstLines = normalized.split("\n").slice(0, 12).join("\n");
  const startsWithSkillHeading =
    /^#{1,3}\s+When to Use\b/i.test(normalized) ||
    /^When to Use\b/i.test(normalized) ||
    /^#{1,3}\s+Skill:/i.test(normalized) ||
    /^Skill:\s+/i.test(normalized);
  return startsWithSkillHeading && /(^|\n)#{0,3}\s*Core Rules\b/i.test(firstLines);
}

function looksLikeStandaloneToolSchemaError(content: string): boolean {
  const normalized = content.replace(/\s+/g, " ").trim();
  if (!normalized) return false;

  const mentionsToolFailure =
    normalized.includes("本次调用未生效") ||
    normalized.includes("Missing required parameter") ||
    normalized.includes("schema 不匹配");
  const mentionsFileWrite = normalized.includes("file_write");
  const mentionsMissingPath =
    normalized.includes("Missing required parameter : path") ||
    normalized.includes("Missing required parameter: path") ||
    normalized.includes("missing path") ||
    normalized.includes("缺少保存位置") ||
    normalized.includes("缺少") && normalized.includes("path");

  return mentionsToolFailure && mentionsFileWrite && mentionsMissingPath;
}

function isInternalBlockStart(trimmed: string): boolean {
  return (
    INTERNAL_MARKERS.some((marker) => trimmed.includes(marker)) ||
    INTERNAL_SECTION_HEADINGS.some((heading) => trimmed.startsWith(heading))
  );
}

export function stripInternalPromptLeak(content: string): string {
  if (!content) return content;
  if (looksLikeStandaloneToolSchemaError(content)) return INTERNAL_TOOL_SCHEMA_ERROR_FALLBACK;
  if (looksLikeStandaloneSkillDoc(content)) return INTERNAL_PROMPT_LEAK_FALLBACK;
  if (!INTERNAL_MARKERS.some((marker) => content.includes(marker))) return content;

  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  let dropping = false;
  let droppedAny = false;
  let sawRoutingBoundary = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (isInternalBlockStart(trimmed)) {
      dropping = true;
      droppedAny = true;
      if (trimmed.includes("routing:")) sawRoutingBoundary = true;
      continue;
    }

    if (dropping) {
      if (trimmed.includes("routing:")) {
        sawRoutingBoundary = true;
        continue;
      }
      if (sawRoutingBoundary && trimmed === "") {
        dropping = false;
        continue;
      }
      const looksLikeFinalAnswerStart =
        /^(好的|可以|已|下面|这是|我已经|包子)/.test(trimmed);
      if (looksLikeFinalAnswerStart) {
        dropping = false;
      } else {
        continue;
      }
    }

    kept.push(line);
  }

  if (!droppedAny) return content;
  const cleaned = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned || INTERNAL_PROMPT_LEAK_FALLBACK;
}
