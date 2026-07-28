import { act, renderHook, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-shell";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { cloudAccountApi } from "../services/tauri";
import { useCloudAuth } from "./useCloudAuth";

vi.mock("@tauri-apps/plugin-shell", () => ({ open: vi.fn() }));
vi.mock("../services/tauri", () => ({
  CLOUD_AUTH_CHANGED_EVENT: "cloud-auth-changed",
  cloudAccountApi: {
    status: vi.fn(),
    signIn: vi.fn(),
    signInSms: vi.fn(),
    createCaptcha: vi.fn(),
    sendSmsCode: vi.fn(),
    resetPassword: vi.fn(),
    wechatLogin: vi.fn(),
    wechatStartSession: vi.fn(),
    wechatPollSession: vi.fn(),
    wechatCompleteProfile: vi.fn(),
    signOut: vi.fn(),
    syncLlm: vi.fn(),
  },
}));

const mockInvoke = vi.mocked(invoke);
const mockOpen = vi.mocked(open);
const mockCloudAccountApi = vi.mocked(cloudAccountApi);

beforeEach(() => {
  vi.clearAllMocks();
  mockCloudAccountApi.status.mockResolvedValue({
    kind: "local",
    signed_in: false,
    name: "本地账户",
  });
  mockCloudAccountApi.syncLlm.mockResolvedValue([]);
});

describe("useCloudAuth", () => {
  it("starts fail-closed and authenticates through Rust without exposing a token", async () => {
    mockInvoke.mockResolvedValue("https://www.dimnuo.com/");
    mockCloudAccountApi.signIn.mockResolvedValue({
      kind: "cloud",
      signed_in: true,
      name: "alice",
      email: "alice@example.com",
    });
    const { result } = renderHook(() => useCloudAuth());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);

    await act(() => result.current.login(" alice ", "secret"));

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(mockCloudAccountApi.signIn).toHaveBeenCalledWith("alice", "secret");
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.account).not.toHaveProperty("access_token");
  });

  it("returns to unauthenticated state when a session recheck reports revocation", async () => {
    mockCloudAccountApi.status.mockResolvedValueOnce({
      kind: "cloud",
      signed_in: true,
      name: "alice",
    });
    const { result } = renderHook(() => useCloudAuth());
    await waitFor(() => expect(result.current.isAuthenticated).toBe(true));

    mockCloudAccountApi.status.mockResolvedValue({
      kind: "local",
      signed_in: false,
      name: "本地账户",
    });
    act(() => window.dispatchEvent(new Event("cloud-auth-changed")));

    await waitFor(() => expect(result.current.isAuthenticated).toBe(false));
  });

  it("opens registration at the command-provided cloud URL", async () => {
    mockInvoke.mockResolvedValue("https://www.dimnuo.com/");
    mockOpen.mockResolvedValue(undefined);
    const { result } = renderHook(() => useCloudAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.openRegistration());

    expect(mockOpen).toHaveBeenCalledWith("https://www.dimnuo.com/api/auth/register");
  });
});
