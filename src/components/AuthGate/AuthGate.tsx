import type { ReactNode } from "react";
import { useCloudAuth } from "../../hooks/useCloudAuth";
import LoginScreen from "./LoginScreen";
import "./AuthGate.css";

export type AuthGateProps = {
  children: ReactNode;
};

/** Blocks mounting every application feature until Rust validates a cloud session. */
export function AuthGate({ children }: AuthGateProps) {
  const auth = useCloudAuth();

  if (auth.isLoading) {
    return (
      <div className="auth-gate-loading" role="status" aria-live="polite">
        <div className="loading-spinner" aria-hidden="true" />
        <p>正在验证云端登录状态…</p>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <LoginScreen
        error={auth.error}
        onLogin={auth.login}
        onLoginSms={auth.loginWithSms}
        onCreateCaptcha={auth.createCaptcha}
        onSendSmsCode={auth.sendSmsCode}
        onResetPassword={auth.resetPassword}
        onWechatDesktopLogin={auth.loginWithWechatDesktop}
        onCompleteWechatProfile={auth.completeWechatProfile}
        onOpenRegistration={auth.openRegistration}
        onRetry={auth.refresh}
        onClearError={auth.clearError}
      />
    );
  }

  return <>{children}</>;
}

export default AuthGate;
