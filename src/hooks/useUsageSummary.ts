import { useCallback, useEffect, useRef, useState } from "react";
import { usageApi, type UsageSummary } from "../services/usageApi";

export interface UsageSummaryState {
  daily: UsageSummary | null;
  monthly: UsageSummary | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

function message(error: unknown): string {
  return error instanceof Error && error.message.trim() ? error.message : "无法获取用量摘要";
}

export function useUsageSummary(): UsageSummaryState {
  const [daily, setDaily] = useState<UsageSummary | null>(null);
  const [monthly, setMonthly] = useState<UsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(false);
  const requestRef = useRef(0);

  const refetch = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (activeRef.current) setIsLoading(true);
    try {
      const [nextDaily, nextMonthly] = await Promise.all([
        usageApi.getSummary("daily"),
        usageApi.getSummary("monthly"),
      ]);
      if (!activeRef.current || requestId !== requestRef.current) return;
      setDaily(nextDaily);
      setMonthly(nextMonthly);
      setError(null);
    } catch (requestError) {
      if (!activeRef.current || requestId !== requestRef.current) return;
      setError(message(requestError));
    } finally {
      if (activeRef.current && requestId === requestRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    activeRef.current = true;
    void refetch();
    return () => {
      activeRef.current = false;
      ++requestRef.current;
    };
  }, [refetch]);

  return { daily, monthly, isLoading, error, refetch };
}
