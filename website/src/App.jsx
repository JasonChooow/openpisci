import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bot,
  CheckCircle2,
  Code2,
  Download,
  FileText,
  Images,
  Layers3,
  MailCheck,
  MessageSquareText,
  MonitorDown,
  Plug,
  Puzzle,
  Users,
  Sparkles,
  Workflow,
  ArrowRight,
} from 'lucide-react';

const modelHubBaseUrl =
  import.meta.env.VITE_MODEL_HUB_URL || 'http://127.0.0.1:3000';
const normalizedModelHubUrl = modelHubBaseUrl.replace(/\/$/, '');
const modelHubLoginUrl = `${normalizedModelHubUrl}/sign-in`;

const scenes = [
  {
    id: 'office',
    label: '日常办公',
    icon: FileText,
    title: '把反复出现的文档、会议、表格和周报交给包子',
    text: '包子已经接入本地桌面端，可调用技能处理 Word、PPT、PDF、表格、会议纪要、邮件摘要和文件整理，让办公任务从对话直接进入执行。',
    chips: ['周报生成', '会议纪要', 'PPT 初稿', 'PDF 处理'],
  },
  {
    id: 'code',
    label: '代码开发',
    icon: Code2,
    title: '能读项目、改文件、跑检查，也能解释为什么这么改',
    text: '包子以项目上下文为中心工作，支持代码审查、报错定位、脚本生成、构建检查和多步修复，适合把本地开发任务拆给它持续推进。',
    chips: ['代码审查', '修复报错', '生成脚本', '项目检查'],
  },
  {
    id: 'design',
    label: '设计创意',
    icon: Images,
    title: '从一句话到素材、文案、提示词和设计方向',
    text: '设计场景已经区分普通对话模型与图片生成模型，包子可以把海报、角色、分镜、商品图和提示词流程拆开执行。',
    chips: ['海报方向', '提示词', '分镜图', '图片模型'],
  },
];

const abilities = [
  ['文件与文档', '读取、整理、改写、生成可交付文件', FileText],
  ['多模型调度', '自动识别聊天、图片、视觉等不同能力', Layers3],
  ['技能调用', '把重复工作封装成可复用技能流程', Workflow],
  ['团队协同', '可把复杂任务拆成专家分工推进', Bot],
  ['消息入口', '预留 IM 渠道接入，支持外部消息触发', MessageSquareText],
  ['结果沉淀', '保留任务状态、产物和后续可追踪记录', MailCheck],
];

const buildItems = [
  '围绕你的本地工作空间理解任务、文件和上下文',
  '支持办公、开发、设计等常见工作场景持续推进',
  '按任务需要调用合适模型、技能和工具完成处理',
  '把复杂需求拆成清晰步骤，过程和结果都可追踪',
  '交付文档、代码、素材、摘要等可继续打磨的成果',
];

function SceneTabs({ activeScene, setActiveScene }) {
  return (
    <div className="scene-tabs" role="tablist" aria-label="包子工作场景">
      {scenes.map((scene) => {
        const Icon = scene.icon;
        return (
          <button
            key={scene.id}
            className={activeScene === scene.id ? 'active' : ''}
            onClick={() => setActiveScene(scene.id)}
            type="button"
            role="tab"
            aria-selected={activeScene === scene.id}
          >
            <Icon size={18} />
            <span>{scene.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ProductShot() {
  return (
    <div className="product-shot" aria-label="包子桌面端运行截图">
      <img src="/assets/baozi-app-screenshot.png?v=user-provided" alt="包子桌面智能体完整运行界面" />
    </div>
  );
}

function Hero() {
  const [activeScene, setActiveScene] = useState('office');
  const scene = useMemo(() => scenes.find((item) => item.id === activeScene), [activeScene]);
  const Icon = scene.icon;

  return (
    <section className="hero" id="home">
      <div className="hero-copy">
        <h1>包子</h1>
        <p className="hero-name">9X bot AI 办公助手</p>
        <div className="hero-actions">
          <a className="primary-action" href="#download">
            <Download size={18} />
            下载桌面端
          </a>
        </div>
        <SceneTabs activeScene={activeScene} setActiveScene={setActiveScene} />
        <div className="scene-copy">
          <Icon size={24} />
          <div>
            <h2>{scene.title}</h2>
            <p>{scene.text}</p>
            <div className="chip-row">
              {scene.chips.map((chip) => (
                <span key={chip}>{chip}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="hero-media" id="live-shot">
        <ProductShot />
      </div>
    </section>
  );
}

function AbilityGrid() {
  return (
    <section className="section abilities" id="abilities">
      <div className="section-heading">
        <h2>包子能做什么</h2>
      </div>
      <div className="ability-grid">
        {abilities.map(([title, desc, Icon]) => (
          <article key={title} className="ability-card">
            <Icon size={24} />
            <h3>{title}</h3>
            <p>{desc}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function CharacterSection() {
  return (
    <section className="character-section" id="character">
      <div className="character-copy">
        <h2>智能、贴心、可靠的办公搭档</h2>
        <p>
          包子的 IP 已经从“章鱼一样多线程工作”的设定落到桌面端体验里：它负责理解任务、选择工具、持续推进，并把结果留在你的工作空间里。
        </p>
        <ul>
          {buildItems.map((item) => (
            <li key={item}>
              <CheckCircle2 size={18} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="character-image">
        <img src="/assets/baozi-character-live.jpg" alt="包子 AI 办公助手形象图" />
      </div>
    </section>
  );
}

function WorkflowSection() {
  const workflowItems = [
    {
      number: '01',
      title: '理解上下文',
      text: '读取当前会话、项目文件、已安装技能和你的配置。',
      href: '/docs#context-workspace',
    },
    {
      number: '02',
      title: '拆解任务',
      text: '把需求拆成办公、开发、设计或自动化步骤。',
      href: '/docs#task-planning',
    },
    {
      number: '03',
      title: '执行并验证',
      text: '调用本地工具、生成产物、跑检查，再把结果交给你调整。',
      href: '/docs#execution-results',
    },
  ];

  return (
    <section className="section workflow-section" id="workflow">
      <div className="workflow-visual">
        <img src="/assets/baozi-illustrations.png" alt="包子协助团队处理办公任务的插画" />
      </div>
      <div className="workflow-copy">
        <h2>从一句话到可检查的结果</h2>
        <div className="workflow-list">
          {workflowItems.map((item) => (
            <Link key={item.number} to={item.href} className="workflow-item-link">
              <strong>{item.number}</strong>
              <div>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

const MARKETPLACE_TABS = [
  { key: 'experts', label: '专家', icon: Bot, kind: 'expert' },
  { key: 'skills', label: '技能', icon: Puzzle, kind: 'skill' },
  { key: 'teams', label: '团队', icon: Users, kind: 'team' },
  { key: 'connectors', label: '连接器', icon: Plug, kind: 'connector' },
];

function MarketplaceSection() {
  const [index, setIndex] = useState(null);
  const [activeTab, setActiveTab] = useState('experts');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/marketplace/index?client_app=web&surface=web')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) {
          setIndex(data || {});
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const items = index && Array.isArray(index[activeTab]) ? index[activeTab] : [];
  const counts = useMemo(() => {
    if (!index) return {};
    return MARKETPLACE_TABS.reduce((acc, tab) => {
      acc[tab.key] = Array.isArray(index[tab.key]) ? index[tab.key].length : 0;
      return acc;
    }, {});
  }, [index]);

  return (
    <section className="section marketplace-section" id="market">
      <div className="section-heading">
        <h2>市场</h2>
        <p>专家 / 技能 / 团队 / 连接器——与桌面端、AgentZ、theAgentOS 共用同一后端。</p>
      </div>

      <div className="scene-tabs marketplace-tabs" role="tablist" aria-label="市场分类">
        {MARKETPLACE_TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              className={activeTab === tab.key ? 'active' : ''}
              onClick={() => setActiveTab(tab.key)}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
            >
              <Icon size={18} />
              <span>
                {tab.label}
                {counts[tab.key] != null ? ` (${counts[tab.key]})` : ''}
              </span>
            </button>
          );
        })}
      </div>

      {loading && <p className="marketplace-status">加载中…</p>}
      {error && (
        <p className="marketplace-status marketplace-status--error">
          无法连接市场后端 ({error})——请确认 <code>python -m app.main</code> 正在 :8137 运行。
        </p>
      )}
      {!loading && !error && items.length === 0 && (
        <p className="marketplace-status">当前分类暂无内容。</p>
      )}

      <div className="ability-grid marketplace-grid">
        {items.slice(0, 12).map((item) => (
          <article key={item.id} className="ability-card marketplace-card">
            <h3>
              {item.icon ? <span aria-hidden>{item.icon}</span> : null}
              {item.name}
            </h3>
            <p>{item.description || '暂无描述'}</p>
            <div className="chip-row">
              <span>v{item.version}</span>
              <span>{item.publisher}</span>
              {item.paid ? <span>付费</span> : null}
              {item.cloud_only ? <span>云端</span> : null}
            </div>
          </article>
        ))}
      </div>

      {!loading && !error && items.length > 0 && (
        <div className="marketplace-more">
          <Link to="/marketplace" className="primary-action">
            浏览全部市场
            <ArrowRight size={18} />
          </Link>
        </div>
      )}
    </section>
  );
}

function DownloadSection() {
  return (
    <section className="download-section" id="download">
      <div className="download-copy">
        <h2>下载包子桌面端</h2>
        <p>安装后即可在本地使用包子处理办公、代码、设计和自动化任务。模型、技能和项目文件都由你自己掌控。</p>
      </div>
      <div className="download-actions">
        <a className="primary-action light" href="https://github.com/JasonChooow/openpisci" target="_blank" rel="noreferrer">
          <MonitorDown size={18} />
          Windows 下载
        </a>
      </div>
    </section>
  );
}

export default function App() {
  return (
    <main>
      <header className="site-header">
        <a className="brand" href="#home" aria-label="包子首页">
          <img src="/assets/baozi-logo.png" alt="" />
          <span>
            <strong>包子</strong>
            <small>9X bot AI 办公助手</small>
          </span>
        </a>
        <nav aria-label="主导航">
          <Link to="/">9X bot</Link>
          <Link to="/marketplace">市场</Link>
          <a href={`${normalizedModelHubUrl}/pricing`}>模型</a>
          <Link to="/docs">文档</Link>
        </nav>
        <div className="header-actions">
          <a className="login-action" href={modelHubLoginUrl}>登录</a>
          <a className="header-action" href="#download">下载</a>
        </div>
      </header>

      <Hero />
      <AbilityGrid />
      <MarketplaceSection />
      <CharacterSection />
      <WorkflowSection />
      <DownloadSection />
    </main>
  );
}
