import React from 'react';
import { motion } from 'motion/react';
import { Download } from 'lucide-react';
import SpotlightCard from './SpotlightCard';

const KIND_LABEL = { expert: '专家', skill: '技能', team: '团队', connector: '连接器' };

const MotionSpotlight = motion.create(SpotlightCard);

export default function AssetCard({ item, onOpen }) {
  return (
    <MotionSpotlight
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="mp-card"
      onClick={() => onOpen(item)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(item);
        }
      }}
      aria-label={`查看 ${item.name} 详情`}
    >
      <div className="mp-card-head">
        <span className="mp-card-icon" aria-hidden>
          {item.icon || '▫️'}
        </span>
        <span className="mp-card-kind">{KIND_LABEL[item.kind] || item.kind}</span>
      </div>
      <h3 className="mp-card-title">{item.name}</h3>
      <p className="mp-card-desc">{item.description || '暂无描述'}</p>
      <div className="mp-card-meta">
        <span className="chip num">v{item.version}</span>
        <span className="chip">{item.publisher}</span>
        {item.paid ? <span className="chip chip-accent">付费</span> : null}
        {Number(item.downloads) > 0 && (
          <span className="chip num">
            <Download size={11} />
            {item.downloads}
          </span>
        )}
      </div>
    </MotionSpotlight>
  );
}
