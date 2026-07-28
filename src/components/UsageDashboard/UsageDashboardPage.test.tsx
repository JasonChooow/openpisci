import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "../../i18n";

vi.mock("../../services/usageApi", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../services/usageApi")>();
  return {
    ...original,
    usageApi: {
      getBalance: vi.fn().mockResolvedValue({ balance: 10.5, currency: "CNY" }),
      getSummary: vi.fn().mockResolvedValue({
        period: "daily",
        promptTokens: 500,
        completionTokens: 200,
        totalTokens: 700,
        totalCost: 0.3,
        requestCount: 5,
      }),
      getByModel: vi.fn().mockResolvedValue({
        period: "monthly",
        models: [{ model: "gpt-4o", promptTokens: 400, completionTokens: 150, totalCost: 0.2, requestCount: 3 }],
      }),
      getTransactions: vi.fn().mockResolvedValue({
        total: 1,
        page: 1,
        page_size: 20,
        items: [{ id: 1, model: "gpt-4o", prompt_tokens: 100, completion_tokens: 50, cost: 0.01, created_at: "2024-06-01T10:00:00Z" }],
      }),
      claimDaily: vi.fn().mockResolvedValue({ success: true, credited: 1, newBalance: 11.5, nextClaimAt: "2024-06-02T00:00:00Z" }),
    },
  };
});

import UsageDashboardPage from "./UsageDashboardPage";

describe("UsageDashboardPage", () => {
  it("renders the connected dashboard with data from hooks", async () => {
    render(<UsageDashboardPage />);

    // Page renders with the title from the presentational component
    expect(screen.getByRole("heading", { name: /用量与余额/ })).toBeInTheDocument();

    // Balance is loaded asynchronously; await it
    expect(await screen.findByTestId("current-balance")).toBeInTheDocument();
  });
});
