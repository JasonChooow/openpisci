import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  Bot,
  Download,
  Plug,
  Puzzle,
  ShoppingBag,
  Users,
  X,
} from 'lucide-react';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import AssetCard from '../components/AssetCard';

const TABS = [
  { key: 'all', label: '全部', icon: ShoppingBag, kind: null },
  { key: 'expert', label: '专家', icon: Bot, kind: 'expert' },
  { key: 'skill', label: '技能', icon: Puzzle, kind: 'skill' },
  { key: 'team', label: '团队', icon: Users, kind: 'team' },
  { key: 'connector', label: '连接器', icon: Plug, kind: 'connector' },
];

const SORTS = [
  { key: 'trending', label: '最热' },
  { key: 'new', label: '最新' },
  { key: 'name', label: '名称' },
];

const PAGE_SIZE = 24;

export default function MarketplacePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [sort, setSort] = useState('trending');
  const [page, setPage] = useState(1);

  const query = searchParams.get('q') || '';
  const activeTab = searchParams.get('kind') || 'all';

  const setQuery = (q) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (q) next.set('q', q);
      else next.delete('q');
      return next;
    }, { replace: true });
  };

  const setTab = (kind) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (kind && kind !== 'all') next.set('kind', kind);
      else next.delete('kind');
      return next;
    }, { replace: true });
  };

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

  const filtered = useMemo(() => {
    let list = assets;
    const tab = TABS.find((t) => t.key === activeTab);
    if (tab && tab.kind) list = list.filter((a) => a.kind === tab.kind);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(
        (a) =>
          (a.name || '').toLowerCase().includes(q) ||
          (a.description || '').toLowerCase().includes(q) ||
          (a.id || '').toLowerCase().includes(q) ||
          (a.publisher || '').toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sort === 'trending') {
      sorted.sort((a, b) => (Number(b.downloads) || 0) - (Number(a.downloads) || 0));
    } else if (sort === 'new') {
      sorted.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
    } else {
      sorted.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'zh'));
    }
    return sorted;
  }, [assets, activeTab, query, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [activeTab, query, sort]);

  const counts = useMemo(() => {
    const c = { all: assets.length, expert: 0, skill: 0, team: 0, connector: 0 };
    for (const a of assets) {
      if (c[a.kind] !== undefined) c[a.kind] += 1;
    }
    return c;
  }, [assets]);

  return (
    <>
      <Nav />
      <main className="wrap">
        <div className="page-head">
          <h1>公共市场</h1>
          <p>
            浏览并安装专家、技能、团队与连接器
            {assets.length > 0 ? ` — 共 ${assets.length} 项` : ''}，
            与桌面端共用同一后端。
          </p>
        </div>

        <div className="mp-toolbar">
          <div className="mp-tabs" role="tablist" aria-label="分类筛选">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  className={`mp-tab${activeTab === tab.key ? ' active' : ''}`}
                  onClick={() => setTab(tab.key)}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.key}
                >
                  <Icon size={15} />
                  <span>{tab.label}</span>
                  <small>{counts[tab.key] ?? 0}</small>
                </button>
              );
            })}
          </div>
          <div className="mp-sort" role="tablist" aria-label="排序方式">
            {SORTS.map((s) => (
              <button
                key={s.key}
                className={`mp-sort-btn${sort === s.key ? ' active' : ''}`}
                onClick={() => setSort(s.key)}
                type="button"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {loading && <p className="status-line">加载中…</p>}
        {error && (
          <p className="status-line status-line--error">无法连接市场后端（{error}）</p>
        )}
        {!loading && !error && filtered.length === 0 && (
          <p className="status-line">
            {query ? `“${query}” 没有匹配的结果` : '当前分类暂无内容'}
          </p>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="mp-results-meta">
            找到 {filtered.length} 项{query ? ` — “${query}”` : ''}
          </div>
        )}

        <motion.div layout className="mp-grid">
          <AnimatePresence mode="popLayout">
            {pageItems.map((item) => (
              <AssetCard key={item.id} item={item} onOpen={setSelectedAsset} />
            ))}
          </AnimatePresence>
        </motion.div>

        {totalPages > 1 && (
          <div className="mp-pagination">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              上一页
            </button>
            <span>
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              下一页
            </button>
          </div>
        )}
      </main>
      <Footer />

      <AnimatePresence>
        {selectedAsset && (
          <AssetDetailModal asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
        )}
      </AnimatePresence>
    </>
  );
}

function AssetDetailModal({ asset, onClose }) {
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/marketplace/asset/${encodeURIComponent(asset.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setDetail(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [asset]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const payload = detail?.payload || asset?.payload || asset;

  return (
    <motion.div
      className="mp-modal-backdrop"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <motion.div
        className="mp-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <button className="mp-modal-close" type="button" onClick={onClose} aria-label="关闭">
          <X size={18} />
        </button>

        <div className="mp-modal-header">
          <span className="mp-modal-icon" aria-hidden>
            {payload.icon || '▫️'}
          </span>
          <div>
            <h2>{payload.name || asset.name}</h2>
            <p className="mp-modal-id">{asset.id}</p>
          </div>
        </div>

        <div className="mp-modal-tags">
          <span className="chip chip-accent">{kindLabel(asset.kind)}</span>
          <span className="chip num">v{asset.version}</span>
          <span className="chip">{asset.publisher}</span>
          {Number(asset.downloads) > 0 && (
            <span className="chip num">
              <Download size={11} /> {asset.downloads}
            </span>
          )}
        </div>

        <div className="mp-modal-section">
          <h4>描述</h4>
          <p>{payload.description || '暂无描述'}</p>
        </div>

        {payload.system_prompt && (
          <div className="mp-modal-section">
            <h4>系统提示词</h4>
            <pre className="mp-modal-pre">
              {payload.system_prompt.slice(0, 2000)}
              {payload.system_prompt.length > 2000 ? '…' : ''}
            </pre>
          </div>
        )}

        {payload.content && (
          <div className="mp-modal-section">
            <h4>技能内容</h4>
            <pre className="mp-modal-pre">
              {payload.content.slice(0, 2000)}
              {payload.content.length > 2000 ? '…' : ''}
            </pre>
          </div>
        )}

        {Array.isArray(payload.tags) && payload.tags.filter(Boolean).length > 0 && (
          <div className="mp-modal-section">
            <h4>标签</h4>
            <div className="mp-modal-tags">
              {payload.tags.filter(Boolean).map((tag) => (
                <span key={tag} className="chip">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}

function kindLabel(kind) {
  const map = { expert: '专家', skill: '技能', team: '团队', connector: '连接器' };
  return map[kind] || kind;
}
