import React, { useMemo, useState } from 'react';
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
  Sparkles,
  Workflow,
} from 'lucide-react';

const modelHubBaseUrl =
  import.meta.env.VITE_MODEL_HUB_URL || 'http://127.0.0.1:3000';
const normalizedModelHubUrl = modelHubBaseUrl.replace(/\/$/, '');
const modelHubUrl = `${normalizedModelHubUrl}/pricing`;
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
  '已完成包子品牌切换与桌面端运行',
  '已接入办公、开发、设计三类主要工作场景',
  '已修正图片模型误走聊天接口的问题',
  '已支持中转站模型列表读取与模型选择',
  '已清空历史对话，截图使用干净运行状态',
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
        <h2>包子现在能做什么</h2>
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
  return (
    <section className="section workflow-section" id="workflow">
      <div className="workflow-visual">
        <img src="/assets/baozi-illustrations.png" alt="包子协助团队处理办公任务的插画" />
      </div>
      <div className="workflow-copy">
        <h2>从一句话到可检查的结果</h2>
        <div className="workflow-list">
          <article>
            <strong>01</strong>
            <div>
              <h3>理解上下文</h3>
              <p>读取当前会话、项目文件、已安装技能和你的配置。</p>
            </div>
          </article>
          <article>
            <strong>02</strong>
            <div>
              <h3>拆解任务</h3>
              <p>把需求拆成办公、开发、设计或自动化步骤。</p>
            </div>
          </article>
          <article>
            <strong>03</strong>
            <div>
              <h3>执行并验证</h3>
              <p>调用本地工具、生成产物、跑检查，再把结果交给你调整。</p>
            </div>
          </article>
        </div>
      </div>
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
          <a href="#home">9X bot</a>
          <a href="#market">市场</a>
          <a href={modelHubUrl}>模型</a>
          <a href="#docs">文档</a>
        </nav>
        <div className="header-actions">
          <a className="login-action" href={modelHubLoginUrl}>登录</a>
          <a className="header-action" href="#download">下载</a>
        </div>
      </header>

      <Hero />
      <AbilityGrid />
      <span className="anchor-target" id="market" aria-hidden="true" />
      <CharacterSection />
      <span className="anchor-target" id="docs" aria-hidden="true" />
      <WorkflowSection />
      <DownloadSection />
    </main>
  );
}
