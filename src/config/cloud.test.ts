import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCloudBaseUrl,
  getPlatformDiscovery,
  isServiceUsable,
  normalizeUrl,
} from "./cloud";

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("cloud configuration", () => {
  it("retrieves and normalizes the cloud base URL only through Tauri", async () => {
    localStorage.setItem("pisci-cloud-base-url", "https://attacker.example");
    mockInvoke.mockResolvedValue("  https://www.dimnuo.com///  ");

    await expect(getCloudBaseUrl()).resolves.toBe("https://www.dimnuo.com");
    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(mockInvoke).toHaveBeenCalledWith("get_cloud_base_url");
  });

  it("normalizes browser navigation URLs without persisting cloud configuration", () => {
    expect(normalizeUrl(" example.com/path ")).toBe("https://example.com/path");
    expect(normalizeUrl("http://localhost:3900")).toBe("http://localhost:3900");
    expect(normalizeUrl("   ")).toBe("");
  });
});

describe("platform discovery", () => {
  it("reads the signed document through the Rust layer", async () => {
    mockInvoke.mockResolvedValueOnce({
      version: 1,
      services: [{ name: "dimstore", url: "https://store.dimnuo.com", status: "down" }],
      features: { wechat_login: true },
    });

    const discovery = await getPlatformDiscovery();
    expect(mockInvoke).toHaveBeenCalledWith("get_platform_discovery");
    expect(discovery.features?.wechat_login).toBe(true);
  });

  it("marks a down service unusable so the UI can say so", () => {
    const discovery = {
      services: [{ name: "dimstore", url: "https://store.dimnuo.com", status: "down" }],
    };
    expect(isServiceUsable(discovery, "dimstore")).toBe(false);
  });

  it("treats an unmentioned service as usable", () => {
    // Not being named is not the same as being down. Disabling a feature over a
    // missing name is worse than attempting the call.
    expect(isServiceUsable({ services: [] }, "dimtrade")).toBe(true);
    expect(isServiceUsable({}, "dimtrade")).toBe(true);
  });
});
