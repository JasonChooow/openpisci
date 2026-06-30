#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const pptxgen = await loadPptxGen();

const args = parseArgs(process.argv.slice(2));
const topic = args.topic || args.title || "演示文稿";
const pages = clamp(Number(args.pages || args.page || 10), 3, 30);
const style = args.style || args.template || "简约商务";
const lang = args.lang || "zh";
const out = args.out || defaultOutput(topic);
const slides = args.slidesJson ? readSlidesJson(args.slidesJson) : buildDefaultSlides(topic, pages, lang);
const theme = chooseTheme(style, topic);

await generateDeck({ topic, slides, theme, out });
console.log(JSON.stringify({ ok: true, file: out, slides: slides.length, theme: theme.name }, null, 2));

function parseArgs(items) {
  const result = {};
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const next = items[i + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      i += 1;
    }
  }
  return result;
}

async function loadPptxGen() {
  try {
    const mod = await import("pptxgenjs");
    return mod.default;
  } catch {
    console.error("[ppt-generator] Installing local dependency pptxgenjs...");
    const cacheDir = path.join(scriptDir, ".npm-cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    const result = runNpmInstall(cacheDir);
    if (result.status !== 0) {
      const detail = result.error ? ` ${result.error.message}` : "";
      throw new Error(`Failed to install local dependencies.${detail} Please check Node.js/npm and network access.`);
    }
    const mod = await import("pptxgenjs");
    return mod.default;
  }
}

function runNpmInstall(cacheDir) {
  if (process.platform === "win32") {
    return spawnSync("cmd.exe", ["/d", "/c", "npm install --prefer-offline=false"], {
      cwd: scriptDir,
      stdio: "inherit",
      env: { ...process.env, npm_config_cache: cacheDir },
    });
  }
  return spawnSync("npm", ["install", "--cache", cacheDir, "--prefer-offline=false"], {
    cwd: scriptDir,
    stdio: "inherit",
  });
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function defaultOutput(topic) {
  const desktop = path.join(os.homedir(), "Desktop");
  const safe = topic.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").slice(0, 48) || "presentation";
  return path.join(desktop, `${safe}.pptx`);
}

function readSlidesJson(file) {
  const raw = fs.readFileSync(file, "utf8");
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return normalizeSlides(parsed);
  if (Array.isArray(parsed.slides)) return normalizeSlides(parsed.slides);
  throw new Error("slides-json must be an array or an object with a slides array");
}

function normalizeSlides(items) {
  return items.map((item, index) => ({
    title: String(item.title || `第 ${index + 1} 页`),
    subtitle: item.subtitle ? String(item.subtitle) : "",
    bullets: Array.isArray(item.bullets) ? item.bullets.map(String).slice(0, 5) : [],
    note: item.note ? String(item.note) : "",
    layout: item.layout ? String(item.layout) : "",
  }));
}

function buildDefaultSlides(topic, pages, lang) {
  const zh = lang.toLowerCase().startsWith("zh");
  const base = zh
    ? [
        { title: topic, subtitle: "结构化汇报与视觉化呈现", layout: "cover" },
        { title: "目录", bullets: ["背景与目标", "核心洞察", "关键方案", "执行路径", "总结与下一步"], layout: "agenda" },
        { title: "背景与机会", bullets: ["梳理当前环境与关键变化", "明确受众最关心的问题", "提炼值得投入的机会点"], layout: "cards" },
        { title: "核心洞察", bullets: ["趋势正在从单点效率转向系统协同", "用户更重视可验证的结果与体验", "组织需要更清晰的执行闭环"], layout: "stat" },
        { title: "方案框架", bullets: ["目标层：统一方向", "能力层：补齐关键资源", "执行层：形成节奏", "复盘层：持续优化"], layout: "matrix" },
        { title: "实施路径", bullets: ["第一阶段：确认需求和资源", "第二阶段：小范围试点", "第三阶段：标准化推广", "第四阶段：数据复盘"], layout: "timeline" },
        { title: "风险与应对", bullets: ["信息不足：补充调研", "资源不足：拆分优先级", "协同不足：建立固定节奏"], layout: "compare" },
        { title: "关键指标", bullets: ["效率提升", "质量改善", "成本下降", "满意度提升"], layout: "stat" },
        { title: "下一步行动", bullets: ["确认负责人", "制定时间表", "准备素材和数据", "启动第一轮交付"], layout: "cards" },
        { title: "谢谢", subtitle: "期待进一步交流", layout: "closing" },
      ]
    : [
        { title: topic, subtitle: "Structured insights and visual storytelling", layout: "cover" },
        { title: "Agenda", bullets: ["Context", "Insights", "Strategy", "Roadmap", "Next steps"], layout: "agenda" },
        { title: "Context", bullets: ["Clarify the current situation", "Identify audience priorities", "Frame the opportunity"], layout: "cards" },
        { title: "Key Insights", bullets: ["Systems matter more than isolated actions", "Users expect measurable outcomes", "Execution needs a clear feedback loop"], layout: "stat" },
        { title: "Strategy", bullets: ["Direction", "Capabilities", "Execution", "Review"], layout: "matrix" },
        { title: "Roadmap", bullets: ["Align", "Pilot", "Scale", "Optimize"], layout: "timeline" },
        { title: "Risks", bullets: ["Limited information", "Resource constraints", "Coordination gaps"], layout: "compare" },
        { title: "Metrics", bullets: ["Efficiency", "Quality", "Cost", "Satisfaction"], layout: "stat" },
        { title: "Next Steps", bullets: ["Owner", "Timeline", "Materials", "First delivery"], layout: "cards" },
        { title: "Thank You", subtitle: "Open for discussion", layout: "closing" },
      ];
  return base.slice(0, pages);
}

function chooseTheme(style, topic) {
  const styleKey = String(style || "").toLowerCase();
  const combinedKey = `${style} ${topic}`.toLowerCase();
  const themes = [
    { name: "商务蓝", aliases: ["商务", "business", "finance", "午夜"], bg: "F6F8FF", primary: "1E2761", secondary: "CADCFC", accent: "2F6FED", text: "111827" },
    { name: "科技感", aliases: ["科技", "tech", "互联网", "ai", "深空"], bg: "0D1117", primary: "161B22", secondary: "243B55", accent: "58A6FF", text: "F8FAFC", dark: true },
    { name: "清新绿", aliases: ["教育", "健康", "fresh", "green", "鼠尾草"], bg: "F3FAF6", primary: "84B59F", secondary: "DDEFE6", accent: "028090", text: "183A37" },
    { name: "高端黑", aliases: ["高端", "奢华", "黑金", "premium"], bg: "111111", primary: "222222", secondary: "3A3324", accent: "D4AF37", text: "FFF7E6", dark: true },
    { name: "珊瑚活力", aliases: ["营销", "创意", "coral"], bg: "FFF7EF", primary: "F96167", secondary: "F9E795", accent: "2F3C7E", text: "20223A" },
    { name: "暖陶简约", aliases: ["文化", "暖陶", "terracotta"], bg: "FBF8EF", primary: "B85042", secondary: "E7E8D1", accent: "A7BEAE", text: "2D2A26" },
    { name: "MBE插画", aliases: ["mbe", "校园", "新生", "卡通", "插画"], bg: "FFFFFF", primary: "000000", secondary: "F8FAFC", accent: "FFD600", text: "111111", outline: true },
    { name: "复古卡通", aliases: ["复古", "手绘", "猫咪", "molle", "手账"], bg: "FFFDF5", primary: "F9E79F", secondary: "FFE8B6", accent: "B85042", text: "2C2C2C", outline: true },
  ];
  return themes.find((theme) => theme.name.toLowerCase() === styleKey)
    || themes.find((theme) => theme.aliases.some((alias) => styleKey.includes(alias)))
    || themes.find((theme) => theme.aliases.some((alias) => combinedKey.includes(alias)))
    || themes[0];
}

async function generateDeck({ topic, slides, theme, out }) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "9X bot";
  pptx.subject = topic;
  pptx.title = topic;
  pptx.company = "9X bot";
  pptx.lang = "zh-CN";
  pptx.theme = {
    headFontFace: "Microsoft YaHei",
    bodyFontFace: "Microsoft YaHei",
    lang: "zh-CN",
  };

  slides.forEach((slide, index) => {
    const layout = slide.layout || pickLayout(index);
    const s = pptx.addSlide();
    paintBackground(s, theme, index);
    addFooter(s, theme, index + 1, slides.length);
    if (layout === "cover") return drawCover(s, slide, theme);
    if (layout === "agenda") return drawAgenda(s, slide, theme);
    if (layout === "stat") return drawStat(s, slide, theme, index);
    if (layout === "matrix") return drawMatrix(s, slide, theme);
    if (layout === "timeline") return drawTimeline(s, slide, theme);
    if (layout === "compare") return drawCompare(s, slide, theme);
    if (layout === "closing") return drawClosing(s, slide, theme);
    return drawCards(s, slide, theme);
  });

  await pptx.writeFile({ fileName: out });
}

function pickLayout(index) {
  return ["cards", "stat", "matrix", "timeline", "compare"][index % 5];
}

function paintBackground(slide, theme, index) {
  slide.background = { color: theme.bg };
  slide.addShape("rect", { x: 0, y: 0, w: 13.333, h: 0.18, fill: { color: theme.accent }, line: { color: theme.accent } });
  slide.addShape("arc", { x: 10.8, y: -0.4, w: 3.4, h: 3.4, fill: { color: theme.secondary, transparency: theme.dark ? 65 : 15 }, line: { color: theme.secondary, transparency: 100 }, adjustPoint: 0.25 });
  slide.addShape("arc", { x: -0.9, y: 5.6, w: 2.4, h: 2.4, fill: { color: theme.accent, transparency: 72 }, line: { color: theme.accent, transparency: 100 }, adjustPoint: 0.25 });
  if (index % 2 === 0) {
    slide.addShape("line", { x: 0.65, y: 6.75, w: 3.5, h: 0, line: { color: theme.accent, transparency: 35, width: 2 } });
  }
}

function addFooter(slide, theme, page, total) {
  slide.addText(`9X bot · ${page}/${total}`, { x: 10.9, y: 7.05, w: 1.75, h: 0.22, fontSize: 8, color: theme.dark ? "C9D1D9" : "667085", align: "right", margin: 0 });
}

function titleStyle(theme, size = 34) {
  return { fontFace: "Microsoft YaHei", fontSize: size, bold: true, color: theme.text, breakLine: false, fit: "shrink" };
}

function bodyStyle(theme, size = 15) {
  return { fontFace: "Microsoft YaHei", fontSize: size, color: theme.dark ? "E5E7EB" : "344054", breakLine: false, fit: "shrink" };
}

function drawCover(slide, item, theme) {
  slide.addShape("roundRect", { x: 0.75, y: 0.85, w: 11.8, h: 5.75, rectRadius: 0.16, fill: { color: theme.dark ? theme.primary : "FFFFFF", transparency: theme.dark ? 0 : 8 }, line: { color: theme.accent, transparency: theme.outline ? 0 : 55, width: theme.outline ? 2 : 1 } });
  slide.addText(item.title, { x: 1.25, y: 1.65, w: 7.8, h: 1.3, ...titleStyle(theme, 42), margin: 0.05 });
  slide.addText(item.subtitle || "Designed presentation", { x: 1.28, y: 3.05, w: 6.2, h: 0.42, ...bodyStyle(theme, 18), color: theme.dark ? "D1D5DB" : "475467", margin: 0 });
  slide.addShape("rect", { x: 1.28, y: 3.75, w: 1.35, h: 0.12, fill: { color: theme.accent }, line: { color: theme.accent } });
  drawVisualCluster(slide, theme, 8.15, 1.35);
}

function drawVisualCluster(slide, theme, x, y) {
  slide.addShape("roundRect", { x, y, w: 2.6, h: 1.3, rectRadius: 0.12, fill: { color: theme.accent, transparency: 8 }, line: { color: theme.outline ? theme.primary : theme.accent, width: theme.outline ? 2 : 0.5 } });
  slide.addShape("roundRect", { x: x + 0.35, y: y + 1.6, w: 3.2, h: 1.15, rectRadius: 0.12, fill: { color: theme.secondary, transparency: theme.dark ? 10 : 0 }, line: { color: theme.outline ? theme.primary : theme.secondary, width: theme.outline ? 2 : 0.5 } });
  slide.addShape("ellipse", { x: x + 2.55, y: y + 0.1, w: 0.85, h: 0.85, fill: { color: theme.primary }, line: { color: theme.outline ? theme.primary : theme.primary } });
}

function drawAgenda(slide, item, theme) {
  addTitle(slide, item.title, theme);
  const bullets = ensureBullets(item);
  bullets.forEach((text, i) => {
    const y = 1.45 + i * 0.9;
    slide.addShape("ellipse", { x: 1.05, y, w: 0.48, h: 0.48, fill: { color: theme.accent }, line: { color: theme.accent } });
    slide.addText(String(i + 1).padStart(2, "0"), { x: 1.05, y: y + 0.11, w: 0.48, h: 0.18, fontSize: 9, bold: true, color: theme.dark ? "111111" : "FFFFFF", align: "center", margin: 0 });
    slide.addShape("roundRect", { x: 1.75, y: y - 0.05, w: 9.6, h: 0.58, rectRadius: 0.08, fill: { color: theme.dark ? theme.primary : "FFFFFF", transparency: theme.dark ? 0 : 4 }, line: { color: theme.secondary, transparency: 15 } });
    slide.addText(text, { x: 2.05, y: y + 0.08, w: 8.8, h: 0.28, ...bodyStyle(theme, 16), margin: 0 });
  });
}

function drawCards(slide, item, theme) {
  addTitle(slide, item.title, theme);
  const bullets = ensureBullets(item).slice(0, 4);
  bullets.forEach((text, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 0.9 + col * 5.95;
    const y = 1.55 + row * 2.15;
    slide.addShape("roundRect", { x, y, w: 5.25, h: 1.55, rectRadius: 0.12, fill: { color: theme.dark ? theme.primary : "FFFFFF", transparency: theme.dark ? 0 : 0 }, line: { color: theme.outline ? theme.primary : theme.secondary, width: theme.outline ? 2 : 1 } });
    slide.addShape("rect", { x, y, w: 0.12, h: 1.55, fill: { color: theme.accent }, line: { color: theme.accent } });
    slide.addText(`0${i + 1}`, { x: x + 0.32, y: y + 0.25, w: 0.55, h: 0.25, fontSize: 12, bold: true, color: theme.accent, margin: 0 });
    slide.addText(text, { x: x + 0.95, y: y + 0.25, w: 3.85, h: 0.82, ...bodyStyle(theme, 15), margin: 0.02, fit: "shrink" });
  });
}

function drawStat(slide, item, theme, index) {
  addTitle(slide, item.title, theme);
  const bullets = ensureBullets(item).slice(0, 3);
  slide.addShape("roundRect", { x: 0.95, y: 1.55, w: 4.15, h: 4.45, rectRadius: 0.12, fill: { color: theme.accent, transparency: 4 }, line: { color: theme.accent } });
  slide.addText(`${index + 2}x`, { x: 1.25, y: 2.18, w: 3.45, h: 0.85, fontSize: 46, bold: true, color: theme.dark ? "111111" : "FFFFFF", align: "center", margin: 0 });
  slide.addText("Key signal", { x: 1.45, y: 3.15, w: 3.05, h: 0.25, fontSize: 14, bold: true, color: theme.dark ? "111111" : "FFFFFF", align: "center", margin: 0 });
  bullets.forEach((text, i) => {
    slide.addShape("roundRect", { x: 5.65, y: 1.7 + i * 1.25, w: 5.8, h: 0.82, rectRadius: 0.1, fill: { color: theme.dark ? theme.primary : "FFFFFF", transparency: theme.dark ? 0 : 0 }, line: { color: theme.secondary, transparency: 20 } });
    slide.addText(text, { x: 6.0, y: 1.92 + i * 1.25, w: 5.05, h: 0.28, ...bodyStyle(theme, 15), margin: 0 });
  });
}

function drawMatrix(slide, item, theme) {
  addTitle(slide, item.title, theme);
  const bullets = ensureBullets(item).slice(0, 4);
  bullets.forEach((text, i) => {
    const x = 1.1 + (i % 2) * 5.55;
    const y = 1.55 + Math.floor(i / 2) * 2.0;
    slide.addShape("roundRect", { x, y, w: 4.95, h: 1.45, rectRadius: 0.1, fill: { color: i % 2 === 0 ? theme.secondary : theme.dark ? theme.primary : "FFFFFF", transparency: theme.dark ? 0 : 0 }, line: { color: theme.accent, transparency: 35 } });
    slide.addText(text, { x: x + 0.32, y: y + 0.38, w: 4.25, h: 0.48, ...bodyStyle(theme, 16), bold: true, margin: 0 });
  });
}

function drawTimeline(slide, item, theme) {
  addTitle(slide, item.title, theme);
  const bullets = ensureBullets(item).slice(0, 4);
  slide.addShape("line", { x: 1.35, y: 3.45, w: 10.2, h: 0, line: { color: theme.accent, width: 3 } });
  bullets.forEach((text, i) => {
    const x = 1.2 + i * 2.65;
    slide.addShape("ellipse", { x, y: 3.17, w: 0.58, h: 0.58, fill: { color: theme.accent }, line: { color: theme.accent } });
    slide.addText(text, { x: x - 0.35, y: i % 2 === 0 ? 2.0 : 4.0, w: 1.9, h: 0.72, ...bodyStyle(theme, 13), align: "center", margin: 0.02, fit: "shrink" });
  });
}

function drawCompare(slide, item, theme) {
  addTitle(slide, item.title, theme);
  const bullets = ensureBullets(item);
  ["挑战", "应对"].forEach((label, i) => {
    const x = 1.1 + i * 5.65;
    slide.addShape("roundRect", { x, y: 1.45, w: 5.05, h: 4.65, rectRadius: 0.12, fill: { color: i === 0 ? theme.dark ? theme.primary : "FFFFFF" : theme.secondary, transparency: theme.dark ? 0 : 0 }, line: { color: i === 0 ? theme.secondary : theme.accent, transparency: 20 } });
    slide.addText(label, { x: x + 0.35, y: 1.78, w: 4.2, h: 0.32, ...titleStyle(theme, 20), color: i === 1 && !theme.dark ? theme.text : theme.text, margin: 0 });
    bullets.slice(0, 3).forEach((text, j) => {
      slide.addText(`• ${text}`, { x: x + 0.48, y: 2.45 + j * 0.68, w: 4.0, h: 0.32, ...bodyStyle(theme, 14), margin: 0 });
    });
  });
}

function drawClosing(slide, item, theme) {
  slide.addShape("roundRect", { x: 1.2, y: 1.2, w: 10.9, h: 4.8, rectRadius: 0.15, fill: { color: theme.dark ? theme.primary : "FFFFFF", transparency: theme.dark ? 0 : 4 }, line: { color: theme.accent, width: 1.5 } });
  slide.addText(item.title, { x: 1.7, y: 2.45, w: 9.9, h: 0.85, ...titleStyle(theme, 42), align: "center", margin: 0 });
  slide.addText(item.subtitle || "Thank you", { x: 2.3, y: 3.45, w: 8.7, h: 0.35, ...bodyStyle(theme, 17), align: "center", margin: 0 });
}

function addTitle(slide, title, theme) {
  slide.addText(title, { x: 0.82, y: 0.58, w: 10.2, h: 0.55, ...titleStyle(theme, 30), margin: 0 });
  slide.addShape("rect", { x: 0.84, y: 1.17, w: 0.95, h: 0.08, fill: { color: theme.accent }, line: { color: theme.accent } });
}

function ensureBullets(item) {
  const bullets = item.bullets && item.bullets.length ? item.bullets : [item.subtitle || item.note || "核心观点", "关键路径", "下一步行动"];
  return bullets.slice(0, 5);
}
