import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import Nav from '../components/Nav';
import Footer from '../components/Footer';

async function postAuth(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      data?.error?.message ||
      data?.detail ||
      (Array.isArray(data?.detail) ? data.detail.map((d) => d.msg).join('；') : null) ||
      `HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialMode = params.get('mode') === 'register' ? 'register' : 'login';
  const [mode, setMode] = useState(initialMode);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'register') {
        await postAuth('/api/auth/register', { username, email, password });
      }
      const data = await postAuth('/api/auth/login', { username, password });
      const token = data?.access_token || data?.token || data?.session_id;
      if (token) {
        localStorage.setItem('9xbot_session', token);
        if (data?.username) localStorage.setItem('9xbot_user', data.username);
      }
      navigate('/models');
    } catch (err) {
      setError(err.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Nav />
      <main className="wrap auth-page">
        <div className="auth-card">
          <h1>{mode === 'login' ? '登录' : '注册账户'}</h1>
          <p className="auth-sub">
            同一套云端账户，打通官网、市场、模型服务与桌面端 —— 不再跳转第三方控制台。
          </p>
          <div className="auth-tabs" role="tablist">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => setMode('login')}
            >
              登录
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => setMode('register')}
            >
              注册
            </button>
          </div>
          <form className="auth-form" onSubmit={onSubmit}>
            <label>
              用户名
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </label>
            {mode === 'register' && (
              <label>
                邮箱
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
            )}
            <label>
              密码
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={6}
              />
            </label>
            {error && <p className="status-line status-line--error">{error}</p>}
            <button className="btn btn-primary btn-lg" type="submit" disabled={busy}>
              {busy ? '请稍候…' : mode === 'login' ? '登录' : '创建账户'}
            </button>
          </form>
          <p className="auth-foot">
            桌面端请使用同一账号登录。需要帮助？查看 <Link to="/docs">文档</Link>。
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
