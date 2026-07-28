import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Bot,
  Download,
  Filter,
  Plug,
  Puzzle,
  Search,
  ShoppingBag,
  Users,
  X,
} from 'lucide-react';

const TABS = [
  { key: 'all', label: '全部', icon: ShoppingBag, kind: null },
  { key: 'expert', label: '专家', icon: Bot, kind: 'expert' },
  { key: 'skill', label: '技能', icon: Puzzle, kind: 'skill' },
  { key: 'team', label: '团队', icon: Users, kind: 'team' },
  { key: 'connector', label: '连接器', icon: Plug, kind: 'connector' },
];

const PAGE_SIZE = 24;

export default function MarketplacePage() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedAsset, setSelectedAsset] = useState(null);

  // Fetch all assets once
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch('/api/marketplace/assets?client_app=web&surface=web')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) {
          // API returns {assets: [...]}
          const list = Array.isArray(data) ? data : Array.isArray(data?.assets) ? data.assets : [];
          setAssets(list);
          setError(null);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // Client-side search + filter
  const filtered = useMemo(() => {
    let list = assets;
    const tab = TABS.find((t) => t.key === activeTab);
    if (tab && tab.kind) {
      list = list.filter((a) => a.kind === tab.kind);
    }
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
    return list;
  }, [assets, activeTab, query]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageItems = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page]
  );

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [activeTab, query]);

  // Category counts
  const counts = useMemo(() => {
    const c = { all: assets.length, expert: 0, skill: 0, team: 0, connector: 0 };
    for (const a of assets) {
      if (c[a.kind] !== undefined) c[a.kind]++;
    }
    return c;
  }, [assets]);

  const handleSearch = useCallback((e) => {
    setQuery(e.target.value);
  }, []);

  return (
    <div className="mp-page">
      {/* Header */}
      <header className="mp-header">
        <Link to="/" className="mp-back" aria-label="返回首页">
          <ArrowLeft size={20} />
          <span>首页</span>
        </Link>
        <h1>
          <ShoppingBag size={28} />
          公共市场
        </h1>
        <p className="mp-subtitle">
          浏览并安装专家、技能、团队与连接器 — 共 {assets.length} 项
        </p>
      </header>

      {/* Search bar */}
      <div className="mp-search-bar">
        <Search size={18} className="mp-search-icon" />
        <input
          type="text"
          placeholder="搜索名称、描述、发布者…"
          value={query}
          onChange={handleSearch}
          className="mp-search-input"
        />
        {query && (
          <button className="mp-search-clear" type="button" onClick={() => setQuery('')} aria-label="清除搜索">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Category tabs */}
      <nav className="mp-tabs" role="tablist" aria-label="分类筛选">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              className={`mp-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.key}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
              <small>{counts[tab.key] ?? 0}</small>
            </button>
          );
        })}
      </nav>

      {/* Status messages */}
      {loading && <p className="mp-status">加载中…</p>}
      {error && (
        <p className="mp-status mp-status--error">
          无法连接市场后端 ({error})
        </p>
      )}
      {!loading && !error && filtered.length === 0 && (
        <p className="mp-status">
          {query ? `"${query}" 没有匹配的结果` : '当前分类暂无内容'}
        </p>
      )}

      {/* Results meta */}
      {!loading && !error && filtered.length > 0 && (
        <div className="mp-results-meta">
          <span>找到 {filtered.length} 项{query ? ` — "${query}"` : ''}</span>
        </div>
      )}

      {/* Grid */}
      <div className="mp-grid">
        {pageItems.map((item) => (
          <article
            key={item.id}
            className="mp-card"
            onClick={() => setSelectedAsset(item)}
            tabIndex={0}
            role="button"
            aria-label={`查看 ${item.name} 详情`}
          >
            <div className="mp-card-head">
              {item.icon && <span className="mp-card-icon">{item.icon}</span>}
              <div className="mp-card-kind">{kindLabel(item.kind)}</div>
            </div>
            <h3 className="mp-card-title">{item.name}</h3>
            <p className="mp-card-desc">{item.description || '暂无描述'}</p>
            <div className="mp-card-meta">
              <span className="mp-chip">v{item.version}</span>
              <span className="mp-chip">{item.publisher}</span>
              {item.paid && <span className="mp-chip mp-chip--paid">付费</span>}
              {item.cloud_only && <span className="mp-chip mp-chip--cloud">云端</span>}
            </div>
          </article>
        ))}
      </div>

      {/* Pagination */}
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
            第 {page} / {totalPages} 页
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

      {/* Detail modal */}
      {selectedAsset && (
        <AssetDetailModal asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
      )}
    </div>
  );
}

function AssetDetailModal({ asset, onClose }) {
  // Fetch full payload if needed
  const [detail, setDetail] = useState(null);
  useEffect(() => {
    if (!asset) return;
    let cancelled = false;
    // The asset list already has payload embedded; also try full fetch
    fetch(`/api/marketplace/asset/${encodeURIComponent(asset.id)}`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!cancelled && data) setDetail(data);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [asset]);

  const payload = detail?.payload || asset?.payload || asset;

  return (
    <div className="mp-modal-backdrop" onClick={onClose}>
      <div className="mp-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="mp-modal-close" type="button" onClick={onClose} aria-label="关闭">
          <X size={20} />
        </button>

        <div className="mp-modal-header">
          {payload.icon && <span className="mp-modal-icon">{payload.icon}</span>}
          <div>
            <h2>{payload.name || asset.name}</h2>
            <p className="mp-modal-id">{asset.id}</p>
          </div>
        </div>

        <div className="mp-modal-body">
          <div className="mp-modal-section">
            <h4>描述</h4>
            <p>{payload.description || '暂无描述'}</p>
          </div>

          <div className="mp-modal-tags">
            <span className="mp-chip">{kindLabel(asset.kind)}</span>
            <span className="mp-chip">v{asset.version}</span>
            <span className="mp-chip">{asset.publisher}</span>
            {asset.downloads > 0 && (
              <span className="mp-chip">
                <Download size={12} /> {asset.downloads}
              </span>
            )}
          </div>

          {payload.system_prompt && (
            <div className="mp-modal-section">
              <h4>系统提示词</h4>
              <pre className="mp-modal-pre">{payload.system_prompt.slice(0, 2000)}{payload.system_prompt.length > 2000 ? '…' : ''}</pre>
            </div>
          )}

          {payload.content && (
            <div className="mp-modal-section">
              <h4>技能内容</h4>
              <pre className="mp-modal-pre">{payload.content.slice(0, 2000)}{payload.content.length > 2000 ? '…' : ''}</pre>
            </div>
          )}

          {payload.tags && payload.tags.length > 0 && (
            <div className="mp-modal-section">
              <h4>标签</h4>
              <div className="mp-modal-tags">
                {payload.tags.filter(Boolean).map((tag) => (
                  <span key={tag} className="mp-chip">{tag}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function kindLabel(kind) {
  const map = { expert: '专家', skill: '技能', team: '团队', connector: '连接器' };
  return map[kind] || kind;
}
