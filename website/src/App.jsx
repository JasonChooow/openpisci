import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bot,
  MonitorDown,
  Plug,
  Puzzle,
  Route,
  Users,
} from 'lucide-react';
import Nav from './components/Nav';
import Footer from './components/Footer';
import Reveal from './components/Reveal';
import SpotlightCard from './components/SpotlightCard';
import CountUp from './components/CountUp';
import SearchBox from './components/SearchBox';
import TrendingList from './components/TrendingList';

/* ---------------- data ---------------- */

function useAssets() {
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/marketplace/assets?client_app=web&surface=web')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : Array.isArray(data?.assets) ? data.assets : [];
        setAssets(list);
        setError(null);
      })
      .catch((e) => !cancelled && setError(e.message || String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  return { assets, loading, error };
}

function usePublicModels() {
  const [models, setModels] = useState([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/marketplace/models')
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((data) => {
        if (!cancelled) setModels(Array.isArray(data?.models) ? data.models : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return models;
}

/* ---------------- sections ---------------- */

function Hero({ totalCount }) {
  return (
    <section className="hero">
      <div className="wrap hero-grid">
        <Reveal>
          <h1>
            Agent 时代的
            <br />
            个人 <span className="hero-keyword">OPC 工作室</span>
          </h1>
          <p className="hero-sub">
            包子把专家、技能与模型路由装进你的桌面。像 Hugging Face 之于模型，
            这里是 Agent 能力的中转站与社区。
          </p>
          <div className="hero-search">
            <SearchBox size="lg" placeholder="搜索专家、技能、团队…" />
          </div>
          <Link to="/marketplace" className="hero-browse">
            浏览 {totalCount > 0 ? `${totalCount}+` : ''} 个专家与技能
            <ArrowRight size={15} />
          </Link>
        </Reveal>
        <Reveal className="hero-media" delay={150}>
          <div className="hero-orbit" aria-hidden />
          <img className="hero-mascot" src="/assets/baozi-logo.png" alt="包子 — 白色带耳机的 Agent 形象" />
        </Reveal>
      </div>
    </section>
  );
}

function TrendingSection({ assets, loading }) {
  const top = useMemo(() => {
    const byDownloads = (kind) =>
      assets
        .filter((a) => a.kind === kind)
        .sort((a, b) => (Number(b.downloads) || 0) - (Number(a.downloads) || 0))
        .slice(0, 5);
    return {
      expert: byDownloads('expert'),
      skill: byDownloads('skill'),
      team: byDownloads('team'),
    };
  }, [assets]);

  return (
    <section className="section" style={{ paddingTop: 24 }} id="trending">
      <div className="wrap">
        <Reveal className="section-head">
          <p className="section-eyebrow">Trending</p>
          <h2>社区正在用什么</h2>
          <p>按安装量实时排序的市场榜单，与桌面端共用同一后端。</p>
        </Reveal>
        {loading ? (
          <p className="status-line">加载榜单中…</p>
        ) : (
          <div className="trending-grid">
            <Reveal delay={0}>
              <TrendingList title="热门专家" icon={Bot} items={top.expert} moreLink="/marketplace?kind=expert" />
            </Reveal>
            <Reveal delay={100}>
              <TrendingList title="热门技能" icon={Puzzle} items={top.skill} moreLink="/marketplace?kind=skill" />
            </Reveal>
            <Reveal delay={200}>
              <TrendingList title="热门团队" icon={Users} items={top.team} moreLink="/marketplace?kind=team" />
            </Reveal>
          </div>
        )}
      </div>
    </section>
  );
}

const BENTO = [
  {
    icon: Route,
    title: '云端模型路由',
    desc: '一个账户接入多家模型，网关按成本与可用性自动选路，用量与余额实时可见。',
    link: '/models',
    linkText: '查看可用模型',
  },
  {
    icon: Puzzle,
    title: '可复用技能',
    desc: '把周报、PPT、发票整理这类重复工作封装成技能，一次安装，到处调用。',
    link: '/marketplace?kind=skill',
    linkText: '浏览技能',
  },
  {
    icon: Users,
    title: '专家团队',
    desc: '复杂任务拆给一组专家角色协同推进，像搭团队一样搭 Agent。',
    link: '/marketplace?kind=team',
    linkText: '看看团队',
  },
  {
    icon: Plug,
    title: '连接器',
    desc: '把 IM、文档与外部系统接进工作台，让 Agent 触达真实业务。',
    link: '/marketplace?kind=connector',
    linkText: '接入系统',
  },
];

function BentoSection() {
  return (
    <section className="section" id="platform">
      <div className="wrap">
        <Reveal className="section-head">
          <p className="section-eyebrow">Platform</p>
          <h2>一个账户，打通 Agent 全链路</h2>
          <p>市场、模型路由、桌面客户端 —— 同一套后端，同一份数据。</p>
        </Reveal>
        <div className="bento">
          <Reveal className="bento-feature" delay={0}>
            <SpotlightCard className="bento-card bento-feature">
              <div className="bento-feature-copy">
                <span className="bento-icon"><MonitorDown size={18} /></span>
                <h3>包子桌面客户端</h3>
                <p>
                  所有市场内容与模型能力都落在本地桌面端执行：读项目、改文件、生成产物，
                  结果留在你的工作空间里。
                </p>
              </div>
              <img src="/assets/baozi-app-screenshot.png?v=user-provided" alt="包子桌面端运行界面" loading="lazy" />
            </SpotlightCard>
          </Reveal>
          {BENTO.map((item, i) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.title} delay={(i + 1) * 80}>
                <SpotlightCard className="bento-card">
                  <span className="bento-icon">
                    <Icon size={18} />
                  </span>
                  <h3>{item.title}</h3>
                  <p>{item.desc}</p>
                  <Link to={item.link} className="bento-link">
                    {item.linkText}
                    <ArrowRight size={14} />
                  </Link>
                </SpotlightCard>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const CATEGORY_LABEL = { chat: '对话', embedding: '向量', image: '图像', audio: '语音' };

function ModelsPreview({ models }) {
  if (models.length === 0) return null;
  return (
    <section className="section" id="models" style={{ paddingTop: 0 }}>
      <div className="wrap">
        <Reveal className="section-head" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', maxWidth: 'none' }}>
          <div>
            <p className="section-eyebrow">Models</p>
            <h2>上架模型</h2>
            <p>网关统一路由的模型目录，桌面端登录即可使用。</p>
          </div>
          <Link to="/models" className="bento-link" style={{ whiteSpace: 'nowrap' }}>
            查看全部模型
            <ArrowRight size={14} />
          </Link>
        </Reveal>
        <div className="models-grid">
          {models.slice(0, 4).map((m, i) => (
            <Reveal key={m.id} delay={i * 80}>
              <SpotlightCard className="model-card">
                <div className="model-card-top">
                  <span className="model-name">{m.display_name}</span>
                  <span className="chip chip-accent">{CATEGORY_LABEL[m.category] || m.category}</span>
                </div>
                <span className="model-id">{m.id}</span>
                <p className="model-desc">{m.description || '暂无介绍'}</p>
                <div className="model-meta">
                  {(m.providers || []).slice(0, 2).map((p) => (
                    <span key={p} className="chip">{p}</span>
                  ))}
                </div>
              </SpotlightCard>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function StatsBand({ assets, models }) {
  const counts = useMemo(() => {
    const c = { total: assets.length, expert: 0, skill: 0, team: 0 };
    for (const a of assets) {
      if (c[a.kind] !== undefined) c[a.kind] += 1;
    }
    return c;
  }, [assets]);

  const stats = [
    { value: counts.total, label: '市场资产' },
    { value: counts.expert, label: '专家' },
    { value: counts.skill, label: '技能' },
    { value: models.length, label: '上架模型' },
  ];

  return (
    <div className="stats-band">
      <div className="wrap stats-grid">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <div className="stat-value">
              <CountUp value={s.value} suffix="+" />
            </div>
            <div className="stat-label">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DownloadSection() {
  return (
    <section className="section" id="download">
      <div className="wrap">
        <Reveal>
          <div className="download-cta">
            <div>
              <h2>下载包子桌面端</h2>
              <p>
                安装后登录云端账户，市场里的专家、技能与模型即刻可用。
                模型、技能和项目文件都由你自己掌控。
              </p>
            </div>
            <div className="download-cta-actions">
              <a
                className="btn btn-primary btn-lg"
                href="https://github.com/JasonChooow/openpisci"
                target="_blank"
                rel="noreferrer"
              >
                <MonitorDown size={17} />
                Windows 下载
              </a>
              <span className="download-note">macOS / Linux 版本即将推出</span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------- page ---------------- */

export default function App() {
  const { assets, loading, error } = useAssets();
  const models = usePublicModels();

  return (
    <>
      <Nav />
      <main>
        <Hero totalCount={assets.length} />
        <TrendingSection assets={assets} loading={loading} />
        {error && (
          <div className="wrap">
            <p className="status-line status-line--error">
              无法连接市场后端（{error}）——请确认后端正在 :8137 运行。
            </p>
          </div>
        )}
        <BentoSection />
        <ModelsPreview models={models} />
        <StatsBand assets={assets} models={models} />
        <DownloadSection />
      </main>
      <Footer />
    </>
  );
}
