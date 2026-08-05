import { describe, expect, it } from "vitest";
import { INTERNAL_PROMPT_LEAK_FALLBACK, stripInternalPromptLeak } from "./internalPromptSanitizer";

describe("stripInternalPromptLeak", () => {
  it("removes a standalone leaked skill instruction body", () => {
    const leaked = [
      "## When to Use",
      "",
      "Use when the main artifact is a Microsoft Word document or .docx file.",
      "",
      "## Core Rules",
      "",
      "1. Treat DOCX as OOXML, not plain text",
    ].join("\n");

    expect(stripInternalPromptLeak(leaked)).toBe(INTERNAL_PROMPT_LEAK_FALLBACK);
  });

  it("keeps the real user text after an embedded skill routing prefix", () => {
    const content = [
      "## Mandatory selected skill instructions",
      "The selected skill instructions are embedded in this message.",
      "## Skill: word-docx",
      "## When to Use",
      "Use when the main artifact is a Microsoft Word document.",
      "Auto-selected skill routing: this request clearly matches these installed skills.",
      "",
      "根据销售数据生成分析报告",
    ].join("\n");

    expect(stripInternalPromptLeak(content)).toBe("根据销售数据生成分析报告");
  });

  it("replaces standalone internal tool schema errors with a plain user-facing message", () => {
    const leaked =
      "工具”file_write“本次调用未生效，请不要重复相同调用，先按提示调整后再试。建议：补齐工具要求的必要参数后重试，原始结果：Missing required parameter : path";

    expect(stripInternalPromptLeak(leaked)).toBe(
      "包子刚才写入文件时缺少保存位置，已调整为使用当前工作区的完整路径继续处理。",
    );
  });
});
