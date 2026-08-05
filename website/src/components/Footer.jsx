import React from 'react';
import { Link } from 'react-router-dom';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <div className="footer-brand">
              <img src="/assets/baozi-logo.png" alt="" />
              <strong>包子 · 9X bot</strong>
            </div>
            <p className="footer-desc">
              Agent 时代的个人 OPC 工作室。专家、技能、模型服务与桌面客户端，一个账户全部打通。
            </p>
          </div>
          <div className="footer-col">
            <h4>产品</h4>
            <Link to="/marketplace">市场</Link>
            <Link to="/models">模型服务</Link>
            <a href="/#download">下载桌面端</a>
          </div>
          <div className="footer-col">
            <h4>生态</h4>
            <a href="https://github.com/JasonChooow/openpisci" target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href="https://www.dimnuo.com" target="_blank" rel="noreferrer">
              官网
            </a>
          </div>
          <div className="footer-col">
            <h4>账户</h4>
            <Link to="/login">登录</Link>
            <Link to="/login?mode=register">注册账户</Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} 9X bot · 包子 AI 办公助手</span>
          <span className="num">Built for agents</span>
        </div>
      </div>
    </footer>
  );
}
