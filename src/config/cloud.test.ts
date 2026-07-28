import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCloudBaseUrl, normalizeUrl } from "./cloud";

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
