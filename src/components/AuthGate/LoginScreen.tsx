import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowLeft,
  ExternalLink,
  KeyRound,
  LockKeyhole,
  MessageSquare,
  Phone,
  RefreshCw,
  Smartphone,
  UserRound,
} from "lucide-react";
import i18n from "../../i18n";
import { brand, getBrandDisplayName } from "../../brand";
import type { CaptchaChallenge } from "../../hooks/useCloudAuth";

type AuthMode =
  | "password"
  | "sms"
  | "wechat"
  | "wechat-profile"
  | "forgot"
  | "register";

type LoginScreenProps = {
  error: string | null;
  onLogin: (username: string, password: string) => Promise<void>;
  onLoginSms: (phone: string, code: string) => Promise<void>;
  onCreateCaptcha: () => Promise<CaptchaChallenge>;
  onSendSmsCode: (
    phone: string,
    purpose: "login" | "reset" | "bind" | "register",
    captchaId: string,
    captchaCode: string,
  ) => Promise<{ expiresIn: number; resendAfter: number; devCode?: string | null }>;
  onResetPassword: (phone: string, code: string, newPassword: string) => Promise<void>;
  onWechatDesktopLogin: () => Promise<{
    status: string;
    needs_profile: boolean;
    pending_token?: string | null;
    message?: string | null;
  }>;
  onCompleteWechatProfile: (params: {
    pendingToken: string;
    username: string;
    phone: string;
    smsCode: string;
    password?: string;
  }) => Promise<void>;
  onOpenRegistration: () => Promise<void>;
  onRetry: () => Promise<void>;
  onClearError: () => void;
};

export function LoginScreen({
  error,
  onLogin,
  onLoginSms,
  onCreateCaptcha,
  onSendSmsCode,
  onResetPassword,
  onWechatDesktopLogin,
  onCompleteWechatProfile,
  onOpenRegistration,
  onRetry,
  onClearError,
}: LoginScreenProps) {
  const [mode, setMode] = useState<AuthMode>("password");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pendingToken, setPendingToken] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [captcha, setCaptcha] = useState<CaptchaChallenge | null>(null);
  const [captchaCode, setCaptchaCode] = useState("");
  const [resendLeft, setResendLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeHint, setCodeHint] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const brandName = getBrandDisplayName(i18n.language);

  const refreshCaptcha = async () => {
    try {
      const next = await onCreateCaptcha();
      setCaptcha(next);
      setCaptchaCode("");
    } catch {
      /* surfaced via hook when sending */
    }
  };

  useEffect(() => {
    if (mode === "sms" || mode === "forgot" || mode === "wechat-profile") {
      void refreshCaptcha();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refresh when mode changes
  }, [mode]);

  useEffect(() => {
    if (resendLeft <= 0) return;
    const timer = window.setInterval(() => {
      setResendLeft((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendLeft]);

  const switchMode = (next: AuthMode) => {
    setMode(next);
    onClearError();
    setInfo(null);
    setCodeHint(null);
  };

  const sendCode = async (purpose: "login" | "reset" | "bind") => {
    if (!phone.trim() || sendingCode || resendLeft > 0) return;
    if (!captcha?.captchaId || !captchaCode.trim()) {
      setCodeHint("请先填写图形验证码");
      return;
    }
    setSendingCode(true);
    setCodeHint(null);
    try {
      const result = await onSendSmsCode(phone, purpose, captcha.captchaId, captchaCode);
      setResendLeft(result.resendAfter || 60);
      setCodeHint(
        result.devCode
          ? `验证码已发送（开发环境：${result.devCode}），${result.resendAfter} 秒后可重发`
          : `验证码已发送，${result.resendAfter} 秒后可重发`,
      );
      await refreshCaptcha();
    } catch {
      await refreshCaptcha();
    } finally {
      setSendingCode(false);
    }
  };

  const submitPassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!username.trim() || !password || submitting) return;
    setSubmitting(true);
    try {
      await onLogin(username, password);
    } catch {
      /* surfaced */
    } finally {
      setSubmitting(false);
    }
  };

  const submitSms = async (event: FormEvent) => {
    event.preventDefault();
    if (!phone.trim() || !smsCode.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onLoginSms(phone, smsCode);
    } catch {
      /* surfaced */
    } finally {
      setSubmitting(false);
    }
  };

  const submitForgot = async (event: FormEvent) => {
    event.preventDefault();
    if (!phone.trim() || !smsCode.trim() || !newPassword || submitting) return;
    setSubmitting(true);
    try {
      await onResetPassword(phone, smsCode, newPassword);
      setInfo("密码已重置，请使用新密码登录。");
      switchMode("password");
      setPassword("");
      setSmsCode("");
      setNewPassword("");
    } catch {
      /* surfaced */
    } finally {
      setSubmitting(false);
    }
  };

  const startWechat = async () => {
    if (submitting) return;
    setSubmitting(true);
    onClearError();
    setInfo("已打开授权页，请在浏览器中确认授权…");
    try {
      const result = await onWechatDesktopLogin();
      if (result.needs_profile && result.pending_token) {
        setPendingToken(result.pending_token);
        setInfo(result.message || "请补全手机号与用户名以完成注册。");
        switchMode("wechat-profile");
      }
    } catch {
      setInfo(null);
    } finally {
      setSubmitting(false);
    }
  };

  const submitWechatProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!pendingToken || !username.trim() || !phone.trim() || !smsCode.trim() || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      await onCompleteWechatProfile({
        pendingToken,
        username,
        phone,
        smsCode,
        password: profilePassword || undefined,
      });
    } catch {
      /* surfaced */
    } finally {
      setSubmitting(false);
    }
  };

  const captchaBlock = (
    <label className="auth-field">
      <span>图形验证码</span>
      <span className="auth-captcha-row">
        <span className="auth-input-wrap">
          <KeyRound size={17} aria-hidden="true" />
          <input
            value={captchaCode}
            onChange={(e) => setCaptchaCode(e.target.value)}
            placeholder="输入图中字符"
            autoComplete="off"
          />
        </span>
        <button
          type="button"
          className="auth-captcha-image"
          onClick={() => void refreshCaptcha()}
          title="点击刷新"
          aria-label="刷新图形验证码"
        >
          {captcha?.imageSvg ? (
            <span
              className="auth-captcha-svg"
              dangerouslySetInnerHTML={{ __html: captcha.imageSvg }}
            />
          ) : (
            <RefreshCw size={16} />
          )}
        </button>
      </span>
    </label>
  );

  const codeButtonLabel =
    resendLeft > 0 ? `${resendLeft}s 后重发` : sendingCode ? "发送中…" : "获取验证码";

  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="auth-title">
        <header className="auth-brand">
          <span className="auth-brand-icon" aria-hidden="true">
            <img src={brand.logoPath} alt="" width={25} height={25} />
          </span>
          <div>
            <strong>{brandName}</strong>
            <span>桌面智能助手</span>
          </div>
        </header>

        {(mode === "password" || mode === "sms") && (
          <>
            <div className="auth-heading">
              <h1 id="auth-title">登录云端账户</h1>
              <p>登录后可使用模型服务、技能市场等平台能力。</p>
            </div>

            <div className="auth-tabs" role="tablist" aria-label="登录方式">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "password"}
                className={mode === "password" ? "is-active" : undefined}
                onClick={() => switchMode("password")}
              >
                密码登录
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "sms"}
                className={mode === "sms" ? "is-active" : undefined}
                onClick={() => switchMode("sms")}
              >
                短信登录
              </button>
            </div>

            {mode === "password" ? (
              <form className="auth-form" onSubmit={submitPassword}>
                <label className="auth-field">
                  <span>用户名</span>
                  <span className="auth-input-wrap">
                    <UserRound size={17} aria-hidden="true" />
                    <input
                      autoFocus
                      autoComplete="username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="请输入用户名"
                    />
                  </span>
                </label>
                <label className="auth-field">
                  <span>密码</span>
                  <span className="auth-input-wrap">
                    <LockKeyhole size={17} aria-hidden="true" />
                    <input
                      type="password"
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="请输入密码"
                    />
                  </span>
                </label>
                <div className="auth-inline-links">
                  <button type="button" onClick={() => switchMode("forgot")}>
                    忘记密码
                  </button>
                </div>
                {error && (
                  <div className="auth-error" role="alert">
                    <span>{error}</span>
                    <button type="button" onClick={() => void onRetry()}>
                      重试验证
                    </button>
                  </div>
                )}
                {info && <div className="auth-info" role="status">{info}</div>}
                <button
                  className="auth-submit"
                  type="submit"
                  disabled={submitting || !username.trim() || !password}
                >
                  {submitting ? "正在登录…" : "登录"}
                </button>
              </form>
            ) : (
              <form className="auth-form" onSubmit={submitSms}>
                <label className="auth-field">
                  <span>手机号</span>
                  <span className="auth-input-wrap">
                    <Phone size={17} aria-hidden="true" />
                    <input
                      autoFocus
                      inputMode="tel"
                      autoComplete="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="请输入手机号"
                    />
                  </span>
                </label>
                {captchaBlock}
                <label className="auth-field">
                  <span>短信验证码</span>
                  <span className="auth-code-row">
                    <span className="auth-input-wrap">
                      <MessageSquare size={17} aria-hidden="true" />
                      <input
                        inputMode="numeric"
                        value={smsCode}
                        onChange={(e) => setSmsCode(e.target.value)}
                        placeholder="短信验证码"
                      />
                    </span>
                    <button
                      type="button"
                      className="auth-code-btn"
                      disabled={sendingCode || resendLeft > 0 || !phone.trim()}
                      onClick={() => void sendCode("login")}
                    >
                      {codeButtonLabel}
                    </button>
                  </span>
                </label>
                {codeHint && <p className="auth-hint">{codeHint}</p>}
                {error && (
                  <div className="auth-error" role="alert">
                    <span>{error}</span>
                  </div>
                )}
                <button
                  className="auth-submit"
                  type="submit"
                  disabled={submitting || !phone.trim() || !smsCode.trim()}
                >
                  {submitting ? "正在登录…" : "短信登录"}
                </button>
              </form>
            )}

            <div className="auth-alt-actions">
              <button
                type="button"
                className="auth-wechat-btn"
                disabled={submitting}
                onClick={() => {
                  switchMode("wechat");
                  void startWechat();
                }}
              >
                <Smartphone size={17} aria-hidden="true" />
                {submitting && mode === "wechat" ? "等待微信授权…" : "微信登录"}
              </button>
            </div>

            <p className="auth-switch">
              还没有账户？
              <button type="button" onClick={() => switchMode("register")}>
                注册账户
              </button>
            </p>
          </>
        )}

        {mode === "forgot" && (
          <div className="auth-register">
            <button className="auth-back" type="button" onClick={() => switchMode("password")}>
              <ArrowLeft size={16} aria-hidden="true" />
              返回登录
            </button>
            <div className="auth-heading">
              <h1 id="auth-title">找回密码</h1>
              <p>通过手机号与图形验证码获取短信验证码后重置密码。</p>
            </div>
            <form className="auth-form" onSubmit={submitForgot}>
              <label className="auth-field">
                <span>手机号</span>
                <span className="auth-input-wrap">
                  <Phone size={17} aria-hidden="true" />
                  <input
                    autoFocus
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="注册时绑定的手机号"
                  />
                </span>
              </label>
              {captchaBlock}
              <label className="auth-field">
                <span>短信验证码</span>
                <span className="auth-code-row">
                  <span className="auth-input-wrap">
                    <MessageSquare size={17} aria-hidden="true" />
                    <input
                      value={smsCode}
                      onChange={(e) => setSmsCode(e.target.value)}
                      placeholder="短信验证码"
                    />
                  </span>
                  <button
                    type="button"
                    className="auth-code-btn"
                    disabled={sendingCode || resendLeft > 0 || !phone.trim()}
                    onClick={() => void sendCode("reset")}
                  >
                    {codeButtonLabel}
                  </button>
                </span>
              </label>
              <label className="auth-field">
                <span>新密码</span>
                <span className="auth-input-wrap">
                  <KeyRound size={17} aria-hidden="true" />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="至少 6 位"
                  />
                </span>
              </label>
              {codeHint && <p className="auth-hint">{codeHint}</p>}
              {error && (
                <div className="auth-error" role="alert">
                  <span>{error}</span>
                </div>
              )}
              <button
                className="auth-submit"
                type="submit"
                disabled={
                  submitting || !phone.trim() || !smsCode.trim() || newPassword.length < 6
                }
              >
                {submitting ? "提交中…" : "重置密码"}
              </button>
            </form>
          </div>
        )}

        {mode === "wechat" && (
          <div className="auth-register">
            <button className="auth-back" type="button" onClick={() => switchMode("password")}>
              <ArrowLeft size={16} aria-hidden="true" />
              返回登录
            </button>
            <div className="auth-heading">
              <h1 id="auth-title">微信登录</h1>
              <p>浏览器完成授权后会自动回到应用，无需复制粘贴授权码。</p>
            </div>
            {info && <div className="auth-info" role="status">{info}</div>}
            {error && (
              <div className="auth-error" role="alert">
                <span>{error}</span>
              </div>
            )}
            <button
              type="button"
              className="auth-submit auth-register-button"
              disabled={submitting}
              onClick={() => void startWechat()}
            >
              <Smartphone size={17} aria-hidden="true" />
              {submitting ? "等待浏览器授权…" : "重新打开微信授权"}
            </button>
          </div>
        )}

        {mode === "wechat-profile" && (
          <div className="auth-register">
            <div className="auth-heading">
              <h1 id="auth-title">完善账户信息</h1>
              <p>微信首次登录需绑定用户名与手机号，用于短信登录与找回密码。</p>
            </div>
            {info && <div className="auth-info" role="status">{info}</div>}
            <form className="auth-form" onSubmit={submitWechatProfile}>
              <label className="auth-field">
                <span>用户名</span>
                <span className="auth-input-wrap">
                  <UserRound size={17} aria-hidden="true" />
                  <input
                    autoFocus
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="设置用户名"
                  />
                </span>
              </label>
              <label className="auth-field">
                <span>手机号</span>
                <span className="auth-input-wrap">
                  <Phone size={17} aria-hidden="true" />
                  <input
                    inputMode="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="绑定手机号"
                  />
                </span>
              </label>
              {captchaBlock}
              <label className="auth-field">
                <span>短信验证码</span>
                <span className="auth-code-row">
                  <span className="auth-input-wrap">
                    <MessageSquare size={17} aria-hidden="true" />
                    <input
                      value={smsCode}
                      onChange={(e) => setSmsCode(e.target.value)}
                      placeholder="验证码"
                    />
                  </span>
                  <button
                    type="button"
                    className="auth-code-btn"
                    disabled={sendingCode || resendLeft > 0 || !phone.trim()}
                    onClick={() => void sendCode("bind")}
                  >
                    {codeButtonLabel}
                  </button>
                </span>
              </label>
              <label className="auth-field">
                <span>登录密码（可选）</span>
                <span className="auth-input-wrap">
                  <LockKeyhole size={17} aria-hidden="true" />
                  <input
                    type="password"
                    value={profilePassword}
                    onChange={(e) => setProfilePassword(e.target.value)}
                    placeholder="不填则仅可用微信/短信登录"
                  />
                </span>
              </label>
              {codeHint && <p className="auth-hint">{codeHint}</p>}
              {error && (
                <div className="auth-error" role="alert">
                  <span>{error}</span>
                </div>
              )}
              <button
                className="auth-submit"
                type="submit"
                disabled={
                  submitting || !username.trim() || !phone.trim() || !smsCode.trim()
                }
              >
                {submitting ? "提交中…" : "完成并登录"}
              </button>
            </form>
          </div>
        )}

        {mode === "register" && (
          <div className="auth-register">
            <button className="auth-back" type="button" onClick={() => switchMode("password")}>
              <ArrowLeft size={16} aria-hidden="true" />
              返回登录
            </button>
            <div className="auth-heading">
              <h1 id="auth-title">注册云端账户</h1>
              <p>可在云端页面注册，或使用微信登录后补全资料。</p>
            </div>
            {error && <div className="auth-error" role="alert">{error}</div>}
            <button
              className="auth-submit auth-register-button"
              type="button"
              onClick={() => void onOpenRegistration()}
            >
              <ExternalLink size={17} aria-hidden="true" />
              前往云端注册
            </button>
            <button
              type="button"
              className="auth-wechat-btn"
              disabled={submitting}
              onClick={() => {
                switchMode("wechat");
                void startWechat();
              }}
            >
              <Smartphone size={17} aria-hidden="true" />
              微信登录注册
            </button>
          </div>
        )}

        <footer className="auth-footer">
          © {new Date().getFullYear()} {brand.productName}
        </footer>
      </section>
    </main>
  );
}

export default LoginScreen;
