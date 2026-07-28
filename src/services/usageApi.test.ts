import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsageApiError, usageApi } from "./usageApi";

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("usageApi", () => {
  it("maps balance, summaries, model groups and transactions to camelCase", async () => {
    mockInvoke
      .mockResolvedValueOnce({ status: 200, body: { balance: 9.5, currency: "CNY" } })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          period: "daily",
          prompt_tokens: 10,
          completion_tokens: 5,
          total_tokens: 15,
          total_cost: 0.25,
          request_count: 2,
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          period: "monthly",
          models: [{
            model: "qwen-plus",
            prompt_tokens: 100,
            completion_tokens: 40,
            total_cost: 1.2,
            request_count: 4,
          }],
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        body: {
          total: 1,
          page: 2,
          page_size: 10,
          items: [{
            id: 7,
            model: "qwen-plus",
            prompt_tokens: 30,
            completion_tokens: 20,
            cost: 0.3,
            created_at: "2025-02-10T00:00:00Z",
          }],
        },
      });

    await expect(usageApi.getBalance()).resolves.toEqual({ balance: 9.5, currency: "CNY" });
    await expect(usageApi.getSummary("daily")).resolves.toEqual({
      period: "daily",
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      totalCost: 0.25,
      requestCount: 2,
    });
    await expect(usageApi.getByModel("monthly")).resolves.toEqual({
      period: "monthly",
      models: [{
        model: "qwen-plus",
        promptTokens: 100,
        completionTokens: 40,
        totalCost: 1.2,
        requestCount: 4,
      }],
    });
    await expect(usageApi.getTransactions({
      page: 2,
      pageSize: 10,
      startDate: "2025-02-01",
      endDate: "2025-02-10",
    })).resolves.toEqual({
      total: 1,
      page: 2,
      pageSize: 10,
      items: [{
        id: 7,
        model: "qwen-plus",
        promptTokens: 30,
        completionTokens: 20,
        cost: 0.3,
        createdAt: "2025-02-10T00:00:00Z",
      }],
    });

    expect(mockInvoke).toHaveBeenNthCalledWith(1, "cloud_usage_request", {
      request: { method: "GET", path: "/api/auth/user/balance", query: [] },
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(2, "cloud_usage_request", {
      request: {
        method: "GET",
        path: "/api/usage/summary",
        query: [{ key: "period", value: "daily" }],
      },
    });
    expect(mockInvoke).toHaveBeenNthCalledWith(4, "cloud_usage_request", {
      request: {
        method: "GET",
        path: "/api/usage/transactions",
        query: [
          { key: "page", value: "2" },
          { key: "page_size", value: "10" },
          { key: "start_date", value: "2025-02-01" },
          { key: "end_date", value: "2025-02-10" },
        ],
      },
    });
  });

  it("maps claim success and preserves an already_claimed conflict for the UI", async () => {
    mockInvoke.mockResolvedValueOnce({
      status: 200,
      body: {
        success: true,
        credited: 1,
        new_balance: 5.5,
        next_claim_at: "2025-02-11T00:00:00Z",
      },
    });

    await expect(usageApi.claimDaily()).resolves.toEqual({
      success: true,
      credited: 1,
      newBalance: 5.5,
      nextClaimAt: "2025-02-11T00:00:00Z",
    });
    expect(mockInvoke).toHaveBeenCalledWith("cloud_usage_request", {
      request: { method: "POST", path: "/api/billing/claim-daily", query: [] },
    });

    mockInvoke.mockResolvedValueOnce({
      status: 409,
      body: {
        error: {
          code: "already_claimed",
          message: "今日已领取",
          next_claim_at: "2025-02-11T00:00:00Z",
        },
      },
    });

    const conflict = await usageApi.claimDaily().catch((error: unknown) => error);
    expect(conflict).toBeInstanceOf(UsageApiError);
    expect(conflict).toMatchObject({
      status: 409,
      code: "already_claimed",
      message: "今日已领取",
      nextClaimAt: "2025-02-11T00:00:00Z",
    });
  });

  it("rejects malformed successful responses instead of leaking snake_case data", async () => {
    mockInvoke.mockResolvedValueOnce({ status: 200, body: { balance: "9.5", currency: "CNY" } });
    await expect(usageApi.getBalance()).rejects.toThrow("balance");
  });
});
