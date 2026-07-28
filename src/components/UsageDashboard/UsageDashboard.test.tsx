import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "../../i18n";
import UsageDashboard, { type UsageDashboardProps } from "./UsageDashboard";

function dashboardProps(overrides: Partial<UsageDashboardProps> = {}): UsageDashboardProps {
  return {
    balance: {
      balance: 18.5,
      currency: "CNY",
      onClaimDaily: vi.fn(),
    },
    summary: {
      daily: { promptTokens: 1000, completionTokens: 500, totalTokens: 1500, totalCost: 0.8, requestCount: 3 },
      monthly: { promptTokens: 12000, completionTokens: 6000, totalTokens: 18000, totalCost: 8.6, requestCount: 37 },
      currency: "CNY",
    },
    models: {
      models: [{ model: "qwen-plus", promptTokens: 800, completionTokens: 300, totalCost: 0.6, requestCount: 2 }],
      currency: "CNY",
    },
    transactions: {
      items: [{ id: 7, model: "qwen-plus", promptTokens: 500, completionTokens: 200, cost: 0.03, createdAt: "2024-01-15T10:30:00Z" }],
      total: 25,
      page: 1,
      pageSize: 20,
      currency: "CNY",
      onPageChange: vi.fn(),
    },
    ...overrides,
  };
}

describe("UsageDashboard", () => {
  it("displays balance, daily/monthly summaries, model usage, and transactions", () => {
    render(<UsageDashboard {...dashboardProps()} />);

    expect(screen.getByRole("heading", { name: "用量与余额" })).toBeInTheDocument();
    expect(screen.getByTestId("current-balance")).toHaveTextContent("18.50");
    expect(screen.getByRole("heading", { name: "今天" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "本月" })).toBeInTheDocument();
    expect(screen.getAllByText("qwen-plus")).toHaveLength(2);
    expect(screen.getByRole("table", { name: "按模型用量" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "交易记录" })).toBeInTheDocument();
  });

  it("invokes the daily credit claim callback and exposes disabled claim state", () => {
    const onClaimDaily = vi.fn();
    const props = dashboardProps({ balance: { balance: 18.5, onClaimDaily } });
    const { rerender } = render(<UsageDashboard {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "领取今日免费额度" }));
    expect(onClaimDaily).toHaveBeenCalledOnce();

    rerender(<UsageDashboard {...dashboardProps({ balance: { balance: 18.5, onClaimDaily, hasClaimedToday: true } })} />);
    expect(screen.getByRole("button", { name: "今日已领取" })).toBeDisabled();
  });

  it("invokes pagination callbacks and disables unavailable directions", () => {
    const onPageChange = vi.fn();
    render(<UsageDashboard {...dashboardProps({ transactions: { ...dashboardProps().transactions, page: 1, onPageChange } })} />);

    expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "下一页" }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("renders loading, error, and empty states without stale tabular data", () => {
    render(<UsageDashboard {...dashboardProps({
      balance: { balance: null, isLoading: true, onClaimDaily: vi.fn() },
      summary: { daily: null, monthly: null, error: "摘要加载失败" },
      models: { models: [], error: "模型加载失败" },
      transactions: { items: [], total: 0, page: 1, pageSize: 20, onPageChange: vi.fn() },
    })} />);

    expect(screen.getByRole("status")).toHaveTextContent("正在加载余额");
    expect(screen.getByText("摘要加载失败").closest('[role="alert"]')).toHaveTextContent("摘要加载失败");
    expect(screen.getByText("模型加载失败").closest('[role="alert"]')).toHaveTextContent("模型加载失败");
    const transactionSection = screen.getByRole("heading", { name: "交易记录" }).closest("section");
    expect(transactionSection).not.toBeNull();
    expect(within(transactionSection as HTMLElement).getByText("暂无交易记录")).toBeInTheDocument();
  });
});
