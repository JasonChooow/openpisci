import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UsageApiError, usageApi, type TransactionsPage } from "../services/usageApi";
import { useBalance } from "./useBalance";
import { useTransactions } from "./useTransactions";
import { useUsageByModel } from "./useUsageByModel";
import { useUsageSummary } from "./useUsageSummary";

vi.mock("../services/usageApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/usageApi")>();
  return {
    ...original,
    usageApi: {
      getBalance: vi.fn(),
      getSummary: vi.fn(),
      getByModel: vi.fn(),
      getTransactions: vi.fn(),
      claimDaily: vi.fn(),
    },
  };
});

const mockUsageApi = vi.mocked(usageApi);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => { resolve = next; });
  return { promise, resolve };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUsageApi.getBalance.mockResolvedValue({ balance: 2, currency: "CNY" });
});

describe("usage hooks", () => {
  it("loads and refetches balance after a successful daily claim", async () => {
    mockUsageApi.claimDaily.mockResolvedValue({
      success: true,
      credited: 1,
      newBalance: 3,
      nextClaimAt: "2025-02-11T00:00:00Z",
    });
    mockUsageApi.getBalance
      .mockResolvedValueOnce({ balance: 2, currency: "CNY" })
      .mockResolvedValueOnce({ balance: 3, currency: "CNY" });
    const { result } = renderHook(() => useBalance());

    await waitFor(() => expect(result.current.balance).toBe(2));
    await act(() => result.current.claimDaily());

    expect(mockUsageApi.claimDaily).toHaveBeenCalledOnce();
    expect(mockUsageApi.getBalance).toHaveBeenCalledTimes(2);
    expect(result.current.balance).toBe(3);
    expect(result.current.hasClaimedToday).toBe(true);
    expect(result.current.claimError).toBeNull();
  });

  it("exposes already_claimed as a recognizable claim state", async () => {
    mockUsageApi.claimDaily.mockRejectedValue(new UsageApiError(
      "今日已领取",
      409,
      "already_claimed",
      "2025-02-11T00:00:00Z",
      {},
    ));
    const { result } = renderHook(() => useBalance());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(() => result.current.claimDaily());

    expect(result.current.claimErrorCode).toBe("already_claimed");
    expect(result.current.hasClaimedToday).toBe(true);
    expect(result.current.claimError).toBe("今日已领取");
  });

  it("loads daily/monthly summaries and the selected model period", async () => {
    mockUsageApi.getSummary.mockImplementation(async (period) => ({
      period,
      promptTokens: period === "daily" ? 10 : 100,
      completionTokens: 5,
      totalTokens: period === "daily" ? 15 : 105,
      totalCost: 0.5,
      requestCount: 1,
    }));
    mockUsageApi.getByModel.mockResolvedValue({
      period: "monthly",
      models: [{
        model: "qwen-plus",
        promptTokens: 100,
        completionTokens: 50,
        totalCost: 1,
        requestCount: 2,
      }],
    });

    const summary = renderHook(() => useUsageSummary());
    const models = renderHook(() => useUsageByModel("monthly"));

    await waitFor(() => expect(summary.result.current.isLoading).toBe(false));
    await waitFor(() => expect(models.result.current.isLoading).toBe(false));
    expect(summary.result.current.daily?.totalTokens).toBe(15);
    expect(summary.result.current.monthly?.totalTokens).toBe(105);
    expect(models.result.current.models[0]?.model).toBe("qwen-plus");
    expect(mockUsageApi.getByModel).toHaveBeenCalledWith("monthly");
  });

  it("paginates with query options and ignores stale concurrent responses", async () => {
    const first = deferred<TransactionsPage>();
    const second = deferred<TransactionsPage>();
    mockUsageApi.getTransactions
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useTransactions({
      pageSize: 10,
      startDate: "2025-02-01",
      endDate: "2025-02-10",
    }));

    await waitFor(() => expect(mockUsageApi.getTransactions).toHaveBeenCalledTimes(1));
    act(() => result.current.setPage(2));
    await waitFor(() => expect(mockUsageApi.getTransactions).toHaveBeenCalledTimes(2));

    await act(async () => second.resolve({
      total: 11,
      page: 2,
      pageSize: 10,
      items: [{ id: 2, model: "new", promptTokens: 2, completionTokens: 1, cost: 0.2, createdAt: "now" }],
    }));
    expect(result.current.items[0]?.model).toBe("new");
    expect(mockUsageApi.getTransactions).toHaveBeenLastCalledWith({
      page: 2,
      pageSize: 10,
      startDate: "2025-02-01",
      endDate: "2025-02-10",
    });

    await act(async () => first.resolve({
      total: 1,
      page: 1,
      pageSize: 10,
      items: [{ id: 1, model: "stale", promptTokens: 1, completionTokens: 1, cost: 0.1, createdAt: "old" }],
    }));
    expect(result.current.page).toBe(2);
    expect(result.current.items[0]?.model).toBe("new");
  });
});
