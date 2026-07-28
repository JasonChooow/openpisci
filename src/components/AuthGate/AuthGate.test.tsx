import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "./AuthGate";
import type { CloudAuth } from "../../hooks/useCloudAuth";

const mocks = vi.hoisted(() => ({
  auth: {} as CloudAuth,
}));

vi.mock("../../hooks/useCloudAuth", () => ({
  useCloudAuth: () => mocks.auth,
}));

function authState(overrides: Partial<CloudAuth> = {}): CloudAuth {
  return {
    account: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    login: vi.fn().mockResolvedValue(undefined),
    loginWithSms: vi.fn().mockResolvedValue(undefined),
    createCaptcha: vi.fn().mockResolvedValue({
      captchaId: "c1",
      imageSvg: "<svg></svg>",
    }),
    sendSmsCode: vi.fn().mockResolvedValue({ expiresIn: 300, resendAfter: 60 }),
    resetPassword: vi.fn().mockResolvedValue(undefined),
    loginWithWechatDesktop: vi
      .fn()
      .mockResolvedValue({ status: "authorized", needs_profile: false, signed_in: true }),
    completeWechatProfile: vi.fn().mockResolvedValue(undefined),
    openRegistration: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    refresh: vi.fn().mockResolvedValue(undefined),
    clearError: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mocks.auth = authState();
});

describe("AuthGate", () => {
  it("does not mount application features while the session is loading", () => {
    mocks.auth = authState({ isLoading: true });
    render(<AuthGate><div>受保护功能</div></AuthGate>);

    expect(screen.getByRole("status")).toHaveTextContent("正在验证云端登录状态");
    expect(screen.queryByText("受保护功能")).not.toBeInTheDocument();
  });

  it("blocks every child for an unauthenticated session", () => {
    render(<AuthGate><div>受保护功能</div></AuthGate>);

    expect(screen.getByRole("heading", { name: "登录云端账户" })).toBeInTheDocument();
    expect(screen.queryByText("受保护功能")).not.toBeInTheDocument();
  });

  it("mounts application features only after authentication", () => {
    mocks.auth = authState({
      account: { kind: "cloud", signed_in: true, name: "alice" },
      isAuthenticated: true,
    });
    render(<AuthGate><div>受保护功能</div></AuthGate>);

    expect(screen.getByText("受保护功能")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "登录云端账户" })).not.toBeInTheDocument();
  });

  it("submits login credentials and opens the official registration flow", async () => {
    const login = vi.fn().mockResolvedValue(undefined);
    const openRegistration = vi.fn().mockResolvedValue(undefined);
    mocks.auth = authState({ login, openRegistration });
    render(<AuthGate><div>受保护功能</div></AuthGate>);

    fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("密码"), { target: { value: "secret" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));
    await waitFor(() => expect(login).toHaveBeenCalledWith("alice", "secret"));

    fireEvent.click(screen.getByRole("button", { name: "注册账户" }));
    fireEvent.click(screen.getByRole("button", { name: "前往云端注册" }));
    await waitFor(() => expect(openRegistration).toHaveBeenCalledOnce());
  });
});
