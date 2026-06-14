import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Lightbulb, Wand2, Search, Users } from "lucide-react";
import RoundedSearch from "../ui/RoundedSearch";
import "./Inspiration.css";

export type InspirationAction = {
  target: "chat" | "pool";
  prompt: string;
  title: string;
  teamTemplateId?: string;
};

type CaseItem = {
  id: string;
  category: string;
  title: string;
  desc: string;
  prompt: string;
  accent: string;
  target: "chat" | "pool";
  teamTemplateId?: string;
};

const CASES: CaseItem[] = [
  {
    id: "weekly-report",
    category: "office",
    title: "周报自动汇总",
    desc: "把零散的工作记录整理成结构化周报",
    prompt: "帮我把这周的工作记录整理成一份结构化周报,包含完成事项、进行中、风险与下周计划。我先把记录贴给你。",
    accent: "#7c5cff",
    target: "chat",
  },
  {
    id: "competitor-scan",
    category: "research",
    title: "竞品调研速览",
    desc: "调研某个赛道的主要竞品并输出对比表",
    prompt: "请帮我调研【某赛道】的主要竞品,输出一张对比表:产品定位、核心功能、定价、优劣势,并给出差异化建议。",
    accent: "#0ea5e9",
    target: "chat",
  },
  {
    id: "landing-page",
    category: "build",
    title: "落地页一键生成",
    desc: "根据产品卖点生成响应式落地页",
    prompt: "根据我提供的产品卖点,帮我生成一个现代、响应式的产品落地页(HTML+CSS),包含 Hero、特性、定价和 CTA。",
    accent: "#22c55e",
    target: "chat",
  },
  {
    id: "data-clean",
    category: "data",
    title: "数据清洗与图表",
    desc: "清洗 CSV 并生成可视化图表",
    prompt: "我有一份 CSV 数据,帮我清洗(去重、补缺、统一格式)后做探索性分析,并生成关键指标的图表。",
    accent: "#f59e0b",
    target: "chat",
  },
  {
    id: "code-review",
    category: "build",
    title: "代码评审助手",
    desc: "审查改动并指出潜在缺陷",
    prompt: "请评审我当前分支的改动,重点关注潜在 bug、边界条件、性能与可读性,并给出可执行的修改建议。",
    accent: "#ef4444",
    target: "chat",
  },
  {
    id: "meeting-notes",
    category: "office",
    title: "会议纪要提炼",
    desc: "把会议记录提炼成决议与待办",
    prompt: "把这段会议记录提炼成:关键决议、负责人与待办清单(含截止时间)。记录如下:",
    accent: "#ec4899",
    target: "chat",
  },
  {
    id: "team-task",
    category: "research",
    title: "组建鱼群协作",
    desc: "为一个复杂目标编排多智能体团队",
    prompt: "我有一个复杂目标需要多智能体协作完成,请帮我拆解任务、设计角色分工,并给出协作流程。目标是:",
    accent: "#14b8a6",
    target: "pool",
    teamTemplateId: "research",
  },
  {
    id: "translate-polish",
    category: "office",
    title: "翻译润色",
    desc: "中英互译并润色为地道表达",
    prompt: "帮我把下面这段文字翻译并润色为地道、专业的表达(保留原意,优化语气):",
    accent: "#8b5cf6",
    target: "chat",
  },
];

export default function Inspiration({ onAction }: { onAction: (action: InspirationAction) => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");

  const categories = useMemo(() => ["all", ...Array.from(new Set(CASES.map((c) => c.category)))], []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CASES.filter((c) => {
      if (category !== "all" && c.category !== category) return false;
      if (!q) return true;
      return c.title.toLowerCase().includes(q) || c.desc.toLowerCase().includes(q);
    });
  }, [query, category]);

  return (
    <div className="inspiration">
      <div className="feature-topbar">
        <h1 className="feature-topbar-title">
          <Lightbulb size={20} strokeWidth={1.5} />
          {t("nav.inspiration")}
        </h1>
      </div>

      <div className="inspiration-body">
        <p className="inspiration-intro">{t("inspiration.intro")}</p>

        <div className="inspiration-controls">
          <RoundedSearch value={query} onChange={setQuery} placeholder={t("inspiration.search")} size="sm" />
          <div className="inspiration-cats">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                className={`inspiration-cat ${category === c ? "active" : ""}`}
                onClick={() => setCategory(c)}
              >
                {c === "all" ? t("inspiration.allCats") : t(`inspiration.cat.${c}`)}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="inspiration-empty">
            <Search size={20} strokeWidth={1.5} /> {t("inspiration.empty")}
          </div>
        ) : (
          <div className="inspiration-grid">
            {filtered.map((c) => (
              <div key={c.id} className="inspiration-card">
                <span className="inspiration-card-bar" style={{ background: c.accent }} />
                <div className="inspiration-card-body">
                  <h3 className="inspiration-card-title">{c.title}</h3>
                  <p className="inspiration-card-desc">{c.desc}</p>
                </div>
                <button
                  type="button"
                  className="inspiration-make"
                  onClick={() => onAction({
                    target: c.target,
                    prompt: c.prompt,
                    title: c.title,
                    teamTemplateId: c.teamTemplateId,
                  })}
                >
                  {c.target === "pool" ? (
                    <><Users size={14} strokeWidth={1.5} /> {t("inspiration.makeSimilarPool")}</>
                  ) : (
                    <><Wand2 size={14} strokeWidth={1.5} /> {t("inspiration.makeSimilar")}</>
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
