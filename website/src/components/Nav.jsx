import React from 'react';
import { Link, NavLink } from 'react-router-dom';
import { MonitorDown } from 'lucide-react';
import SearchBox from './SearchBox';

const modelHubBaseUrl =
  import.meta.env.VITE_MODEL_HUB_URL || 'http://127.0.0.1:3000';
const modelHubLoginUrl = `${modelHubBaseUrl.replace(/\/$/, '')}/sign-in`;

export default function Nav() {
  return (
    <header className="nav">
      <div className="wrap nav-inner">
        <Link to="/" className="nav-brand" aria-label="包子首页">
          <img src="/assets/baozi-logo.png" alt="" />
          <span>
            <strong>包子</strong>
            <small>9X bot Agent 社区</small>
          </span>
        </Link>
        <div className="nav-search">
          <SearchBox />
        </div>
        <nav className="nav-links" aria-label="主导航">
          <NavLink to="/marketplace" className={({ isActive }) => (isActive ? 'active' : '')}>
            市场
          </NavLink>
          <NavLink to="/models" className={({ isActive }) => (isActive ? 'active' : '')}>
            模型
          </NavLink>
          <NavLink to="/docs" className={({ isActive }) => (isActive ? 'active' : '')}>
            文档
          </NavLink>
        </nav>
        <div className="nav-actions">
          <a className="nav-login" href={modelHubLoginUrl}>
            登录
          </a>
          <a className="btn btn-primary" href="/#download">
            <MonitorDown size={15} />
            下载
          </a>
        </div>
      </div>
    </header>
  );
}
