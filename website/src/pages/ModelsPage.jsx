import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Info, Route } from 'lucide-react';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import Reveal from '../components/Reveal';
import SpotlightCard from '../components/SpotlightCard';

const CATEGORY_LABEL = { chat: '对话', embedding: '向量', image: '图像', audio: '语音' };

function fmtPrice(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n === 0) return '—';
  return `¥${n.toFixed(3)}`;
}

export default function ModelsPage() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState('all');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/marketplace/models')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) {
          setModels(Array.isArray(data?.models) ? data.models : []);
          setError(null);
        }
      })
      .catch((e) => !cancelled && setError(e.message || String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    const set = new Set(models.map((m) => m.category).filter(Boolean));
    return ['all', ...set];
  }, [models]);

  const filtered = useMemo(
    () => (category === 'all' ? models : models.filter((m) => m.category === category)),
    [models, category]
  );

  return (
    <>
      <Nav />
      <main className="wrap">
        <div className="page-head">
          <h1>模型路由</h1>
          <p>
            网关统一接入多家上游模型，按成本与可用性自动选路。
            桌面端登录云端账户即可使用，按用量计费。
          </p>
        </div>

        <Reveal className="models-note">
          <Route size={16} />
          <span>
            所有模型通过 <code>/api/llm/v1</code> 以 OpenAI 兼容协议调用，
            余额不足时自动降级到备用线路。
          </span>
        </Reveal>

        <div className="models-filter" role="tablist" aria-label="模型分类">
          {categories.map((c) => (
            <button
              key={c}
              className={`models-filter-chip${category === c ? ' active' : ''}`}
              onClick={() => setCategory(c)}
              type="button"
            >
              {c === 'all' ? '全部' : CATEGORY_LABEL[c] || c}
            </button>
          ))}
        </div>

        {loading && <p className="status-line">加载模型目录…</p>}
        {error && <p className="status-line status-line--error">无法连接后端（{error}）</p>}
        {!loading && !error && filtered.length === 0 && (
          <p className="status-line">
            <Info size={14} style={{ verticalAlign: '-2px' }} /> 暂无上架模型。
          </p>
        )}

        <motion.div layout className="models-page-grid">
          <AnimatePresence mode="popLayout">
            {filtered.map((m, i) => (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.25, delay: i * 0.03, ease: [0.25, 0.1, 0.25, 1] }}
              >
                <SpotlightCard className="models-page-card">
                  <div className="models-page-card-head">
                    <div>
                      <h3>{m.display_name}</h3>
                      <span className="model-id">{m.id}</span>
                    </div>
                    <span className="chip chip-accent">
                      {CATEGORY_LABEL[m.category] || m.category}
                    </span>
                  </div>
                  <p className="models-page-desc">{m.description || '暂无介绍'}</p>
                  <div className="models-page-pricing">
                    <div>
                      <strong>{fmtPrice(m.pricing?.input_per_1k)}</strong>
                      输入 / 1K tokens
                    </div>
                    <div>
                      <strong>{fmtPrice(m.pricing?.output_per_1k)}</strong>
                      输出 / 1K tokens
                    </div>
                  </div>
                  <div className="models-page-foot">
                    <div className="model-meta">
                      {(m.providers || []).slice(0, 2).map((p) => (
                        <span key={p} className="chip">
                          {p}
                        </span>
                      ))}
                    </div>
                    <Link to="/#download" className="models-use-link">
                      在桌面端使用
                      <ArrowRight size={13} />
                    </Link>
                  </div>
                </SpotlightCard>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      </main>
      <Footer />
    </>
  );
}
