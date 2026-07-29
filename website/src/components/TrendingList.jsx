import React from 'react';
import { Link } from 'react-router-dom';
import { Download } from 'lucide-react';

function fmtDownloads(n) {
  const num = Number(n) || 0;
  if (num >= 10000) return `${(num / 10000).toFixed(1)}w`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return String(num);
}

export default function TrendingList({ title, icon: Icon, items, moreLink, delayBase = 0 }) {
  return (
    <div className="trending-col">
      <div className="trending-head">
        <h3>
          <Icon size={15} />
          {title}
        </h3>
        <Link to={moreLink}>查看全部 →</Link>
      </div>
      <ol className="trending-list">
        {items.map((it, i) => (
          <li key={it.id}>
            <Link
              to={`/marketplace?q=${encodeURIComponent(it.name || '')}`}
              className="trending-item"
            >
              <span className="trending-rank">{i + 1}</span>
              <span className="trending-icon" aria-hidden>
                {it.icon || '▫️'}
              </span>
              <span className="trending-name">{it.name}</span>
              <span className="trending-dl">
                <Download size={11} />
                {fmtDownloads(it.downloads)}
              </span>
            </Link>
          </li>
        ))}
        {items.length === 0 && (
          <li className="trending-item">
            <span className="trending-name" style={{ color: 'var(--ink-4)' }}>
              暂无数据
            </span>
          </li>
        )}
      </ol>
    </div>
  );
}
