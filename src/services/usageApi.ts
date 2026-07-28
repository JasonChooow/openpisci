import { invoke } from "@tauri-apps/api/core";

export type UsagePeriod = "daily" | "monthly";

export interface Balance {
  balance: number;
  currency: string;
}

export interface UsageSummary {
  period: UsagePeriod;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  totalCost: number;
  requestCount: number;
}

export interface ModelUsage {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalCost: number;
  requestCount: number;
}

export interface UsageByModel {
  period: UsagePeriod;
  models: ModelUsage[];
}

export interface UsageTransaction {
  id: string | number;
  model: string;
  promptTokens: number;
  completionTokens: number;
  cost: number;
  createdAt: string;
}

export interface TransactionsPage {
  total: number;
  page: number;
  pageSize: number;
  items: UsageTransaction[];
}

export interface TransactionQuery {
  page?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
}

export interface ClaimDailyResult {
  success: boolean;
  credited: number;
  newBalance: number;
  nextClaimAt: string;
}

interface CloudQuery {
  key: string;
  value: string;
}

interface CloudUsageResponse {
  status: number;
  body: unknown;
}

interface ApiErrorBody {
  error?: {
    code?: string;
    message?: string;
    next_claim_at?: string;
  };
  detail?: string | { code?: string; message?: string };
  message?: string;
}

export class UsageApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly nextClaimAt: string | null;
  readonly details: unknown;

  constructor(message: string, status: number, code: string | null, nextClaimAt: string | null, details: unknown) {
    super(message);
    this.name = "UsageApiError";
    this.status = status;
    this.code = code;
    this.nextClaimAt = nextClaimAt;
    this.details = details;
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("云端返回了无效的用量数据");
  }
  return value as Record<string, unknown>;
}

function number(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`云端用量响应缺少有效字段: ${field}`);
  }
  return value;
}

function string(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`云端用量响应缺少有效字段: ${field}`);
  }
  return value;
}

function period(value: unknown): UsagePeriod {
  if (value !== "daily" && value !== "monthly") {
    throw new Error("云端返回了无效的用量周期");
  }
  return value;
}

function apiError(response: CloudUsageResponse): UsageApiError {
  const body = (response.body ?? {}) as ApiErrorBody;
  const detail = body.detail;
  const detailObject = typeof detail === "object" && detail ? detail : undefined;
  const code = body.error?.code ?? detailObject?.code ?? null;
  const message = body.error?.message
    ?? detailObject?.message
    ?? (typeof detail === "string" ? detail : undefined)
    ?? body.message
    ?? `云端请求失败 (HTTP ${response.status})`;
  return new UsageApiError(
    message,
    response.status,
    code,
    body.error?.next_claim_at ?? null,
    response.body,
  );
}

async function request(method: "GET" | "POST", path: string, query: CloudQuery[] = []): Promise<unknown> {
  const response = await invoke<CloudUsageResponse>("cloud_usage_request", {
    request: { method, path, query },
  });
  if (response.status < 200 || response.status >= 300) throw apiError(response);
  return response.body;
}

function mapSummary(value: unknown): UsageSummary {
  const data = object(value);
  return {
    period: period(data.period),
    promptTokens: number(data.prompt_tokens, "prompt_tokens"),
    completionTokens: number(data.completion_tokens, "completion_tokens"),
    totalTokens: number(data.total_tokens, "total_tokens"),
    totalCost: number(data.total_cost, "total_cost"),
    requestCount: number(data.request_count, "request_count"),
  };
}

function mapModel(value: unknown): ModelUsage {
  const data = object(value);
  return {
    model: string(data.model, "model"),
    promptTokens: number(data.prompt_tokens, "prompt_tokens"),
    completionTokens: number(data.completion_tokens, "completion_tokens"),
    totalCost: number(data.total_cost, "total_cost"),
    requestCount: number(data.request_count, "request_count"),
  };
}

function mapTransaction(value: unknown): UsageTransaction {
  const data = object(value);
  const id = data.id;
  if (typeof id !== "string" && typeof id !== "number") {
    throw new Error("云端用量响应缺少有效字段: id");
  }
  return {
    id,
    model: string(data.model, "model"),
    promptTokens: number(data.prompt_tokens, "prompt_tokens"),
    completionTokens: number(data.completion_tokens, "completion_tokens"),
    cost: number(data.cost, "cost"),
    createdAt: string(data.created_at, "created_at"),
  };
}

export const usageApi = {
  async getBalance(): Promise<Balance> {
    const data = object(await request("GET", "/api/auth/user/balance"));
    return {
      balance: number(data.balance, "balance"),
      currency: string(data.currency, "currency"),
    };
  },

  getSummary(periodValue: UsagePeriod): Promise<UsageSummary> {
    return request("GET", "/api/usage/summary", [{ key: "period", value: periodValue }])
      .then(mapSummary);
  },

  async getByModel(periodValue: UsagePeriod): Promise<UsageByModel> {
    const data = object(await request("GET", "/api/usage/by-model", [
      { key: "period", value: periodValue },
    ]));
    if (!Array.isArray(data.models)) throw new Error("云端用量响应缺少有效字段: models");
    return { period: period(data.period), models: data.models.map(mapModel) };
  },

  async getTransactions(query: TransactionQuery = {}): Promise<TransactionsPage> {
    const params: CloudQuery[] = [
      { key: "page", value: String(query.page ?? 1) },
      { key: "page_size", value: String(query.pageSize ?? 20) },
    ];
    if (query.startDate) params.push({ key: "start_date", value: query.startDate });
    if (query.endDate) params.push({ key: "end_date", value: query.endDate });

    const data = object(await request("GET", "/api/usage/transactions", params));
    if (!Array.isArray(data.items)) throw new Error("云端用量响应缺少有效字段: items");
    return {
      total: number(data.total, "total"),
      page: number(data.page, "page"),
      pageSize: number(data.page_size, "page_size"),
      items: data.items.map(mapTransaction),
    };
  },

  async claimDaily(): Promise<ClaimDailyResult> {
    const data = object(await request("POST", "/api/billing/claim-daily"));
    if (data.success !== true) throw new Error("云端未确认每日额度领取成功");
    return {
      success: true,
      credited: number(data.credited, "credited"),
      newBalance: number(data.new_balance, "new_balance"),
      nextClaimAt: string(data.next_claim_at, "next_claim_at"),
    };
  },
};
