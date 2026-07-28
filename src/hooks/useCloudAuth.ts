import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-shell";
import { getCloudBaseUrl } from "../config/cloud";
import {
  CLOUD_AUTH_CHANGED_EVENT,
  cloudAccountApi,
  type AccountInfo,
  type WechatLoginResult,
} from "../services/tauri";

const SESSION_CHECK_INTERVAL_MS = 30_000;

export type CaptchaChallenge = {
  captchaId: string;
  imageSvg: string;
};

export type CloudAuth = {
  account: AccountInfo | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  loginWithSms: (phone: string, code: string) => Promise<void>;
  createCaptcha: () => Promise<CaptchaChallenge>;
  sendSmsCode: (
    phone: string,
    purpose: "login" | "reset" | "bind" | "register",
    captchaId: string,
    captchaCode: string,
  ) => Promise<{ expiresIn: number; resendAfter: number; devCode?: string | null }>;
  resetPassword: (phone: string, code: string, newPassword: string) => Promise<void>;
  loginWithWechatDesktop: () => Promise<WechatLoginResult>;
  completeWechatProfile: (params: {
    pendingToken: string;
    username: string;
    phone: string;
    smsCode: string;
    password?: string;
  }) => Promise<void>;
  openRegistration: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
};

function errorMessage(error: unknown, fallback: string): string {
  if (typeof error === "string" && error.trim()) return error;
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/**
 * Owns the UI view of cloud authentication. Tokens never enter browser state;
 * all credential persistence and validation stays behind the Rust commands.
 */
export function useCloudAuth(): CloudAuth {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(true);
  const requestRef = useRef(0);
  const providerSyncedRef = useRef(false);

  const clearError = useCallback(() => setError(null), []);

  const applySignedIn = useCallback(async (nextAccount: AccountInfo) => {
    if (!nextAccount.signed_in) throw new Error("云端未返回有效登录会话");
    if (!activeRef.current) return;
    ++requestRef.current;
    setAccount(nextAccount);
    setError(null);
    await cloudAccountApi.syncLlm();
    providerSyncedRef.current = true;
  }, []);

  const refresh = useCallback(async (showLoading = false) => {
    const requestId = ++requestRef.current;
    if (showLoading && activeRef.current) setIsLoading(true);

    try {
      const nextAccount = await cloudAccountApi.status();
      if (nextAccount.signed_in && !providerSyncedRef.current) {
        await cloudAccountApi.syncLlm();
        providerSyncedRef.current = true;
      } else if (!nextAccount.signed_in) {
        providerSyncedRef.current = false;
      }
      if (!activeRef.current || requestId !== requestRef.current) return;
      setAccount(nextAccount.signed_in ? nextAccount : null);
      setError(null);
    } catch (refreshError) {
      if (!activeRef.current || requestId !== requestRef.current) return;
      setAccount(null);
      setError(errorMessage(refreshError, "无法验证云端登录状态，请检查网络后重试。"));
    } finally {
      if (activeRef.current && requestId === requestRef.current) setIsLoading(false);
    }
  }, []);

  const login = useCallback(
    async (username: string, password: string) => {
      ++requestRef.current;
      setIsLoading(false);
      setError(null);
      try {
        const nextAccount = await cloudAccountApi.signIn(username.trim(), password);
        await applySignedIn(nextAccount);
      } catch (loginError) {
        if (!activeRef.current) return;
        ++requestRef.current;
        setAccount(null);
        setError(errorMessage(loginError, "登录失败，请检查用户名和密码。"));
        throw loginError;
      }
    },
    [applySignedIn],
  );

  const loginWithSms = useCallback(
    async (phone: string, code: string) => {
      ++requestRef.current;
      setIsLoading(false);
      setError(null);
      try {
        const nextAccount = await cloudAccountApi.signInSms(phone.trim(), code.trim());
        await applySignedIn(nextAccount);
      } catch (loginError) {
        if (!activeRef.current) return;
        ++requestRef.current;
        setAccount(null);
        setError(errorMessage(loginError, "短信登录失败。"));
        throw loginError;
      }
    },
    [applySignedIn],
  );

  const createCaptcha = useCallback(async () => {
    const result = await cloudAccountApi.createCaptcha();
    return { captchaId: result.captcha_id, imageSvg: result.image_svg };
  }, []);

  const sendSmsCode = useCallback(
    async (
      phone: string,
      purpose: "login" | "reset" | "bind" | "register",
      captchaId: string,
      captchaCode: string,
    ) => {
      setError(null);
      try {
        const result = await cloudAccountApi.sendSmsCode(
          phone.trim(),
          purpose,
          captchaId,
          captchaCode,
        );
        return {
          expiresIn: result.expires_in,
          resendAfter: result.resend_after ?? 60,
          devCode: result.dev_code,
        };
      } catch (sendError) {
        const message = errorMessage(sendError, "发送验证码失败。");
        setError(message);
        throw sendError;
      }
    },
    [],
  );

  const resetPassword = useCallback(
    async (phone: string, code: string, newPassword: string) => {
      setError(null);
      try {
        await cloudAccountApi.resetPassword(phone.trim(), code.trim(), newPassword);
      } catch (resetError) {
        setError(errorMessage(resetError, "重置密码失败。"));
        throw resetError;
      }
    },
    [],
  );

  const loginWithWechatDesktop = useCallback(async () => {
    ++requestRef.current;
    setIsLoading(false);
    setError(null);
    try {
      const started = await cloudAccountApi.wechatStartSession();
      await open(started.authorize_url);
      const deadline = Date.now() + (started.expires_in || 300) * 1000;
      const interval = started.poll_interval_ms || 1500;

      while (Date.now() < deadline) {
        if (!activeRef.current) throw new Error("已取消");
        const result = await cloudAccountApi.wechatPollSession(started.session_id);
        if (result.status === "pending") {
          await sleep(interval);
          continue;
        }
        if (result.signed_in && result.account) {
          await applySignedIn(result.account);
        }
        return result;
      }
      throw new Error("微信授权超时，请重试");
    } catch (wechatError) {
      if (!activeRef.current) throw wechatError;
      setError(errorMessage(wechatError, "微信登录失败。"));
      throw wechatError;
    }
  }, [applySignedIn]);

  const completeWechatProfile = useCallback(
    async (params: {
      pendingToken: string;
      username: string;
      phone: string;
      smsCode: string;
      password?: string;
    }) => {
      ++requestRef.current;
      setError(null);
      try {
        const nextAccount = await cloudAccountApi.wechatCompleteProfile(params);
        await applySignedIn(nextAccount);
      } catch (profileError) {
        if (!activeRef.current) return;
        setError(errorMessage(profileError, "完善资料失败。"));
        throw profileError;
      }
    },
    [applySignedIn],
  );

  const logout = useCallback(async () => {
    const requestId = ++requestRef.current;
    try {
      await cloudAccountApi.signOut();
      await cloudAccountApi.syncLlm();
    } finally {
      providerSyncedRef.current = false;
      if (!activeRef.current || requestId !== requestRef.current) return;
      setAccount(null);
      setError(null);
      setIsLoading(false);
    }
  }, []);

  const openRegistration = useCallback(async () => {
    setError(null);
    try {
      const baseUrl = await getCloudBaseUrl();
      await open(`${baseUrl}/api/auth/register`);
    } catch (registrationError) {
      setError(errorMessage(registrationError, "无法打开云端注册页面。"));
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    void refresh(true);

    const checkSession = () => void refresh(false);
    const interval = window.setInterval(checkSession, SESSION_CHECK_INTERVAL_MS);
    window.addEventListener("focus", checkSession);
    window.addEventListener("online", checkSession);
    window.addEventListener(CLOUD_AUTH_CHANGED_EVENT, checkSession);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") checkSession();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      activeRef.current = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", checkSession);
      window.removeEventListener("online", checkSession);
      window.removeEventListener(CLOUD_AUTH_CHANGED_EVENT, checkSession);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  return {
    account,
    isAuthenticated: account?.signed_in === true,
    isLoading,
    error,
    login,
    loginWithSms,
    createCaptcha,
    sendSmsCode,
    resetPassword,
    loginWithWechatDesktop,
    completeWechatProfile,
    openRegistration,
    logout,
    refresh: () => refresh(false),
    clearError,
  };
}
