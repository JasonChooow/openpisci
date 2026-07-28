import { useCallback, useEffect, useRef, useState } from "react";
import { usageApi, type ModelUsage, type UsagePeriod } from "../services/usageApi";

export interface UsageByModelState {
  models: ModelUsage[];
  period: UsagePeriod;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useUsageByModel(period: UsagePeriod = "monthly"): UsageByModelState {
  const [models, setModels] = useState<ModelUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(false);
  const requestRef = useRef(0);

  const refetch = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (activeRef.current) setIsLoading(true);
    try {
      const next = await usageApi.getByModel(period);
      if (!activeRef.current || requestId !== requestRef.current) return;
      setModels(next.models);
      setError(null);
    } catch (requestError) {
      if (!activeRef.current || requestId !== requestRef.current) return;
      setError(requestError instanceof Error ? requestError.message : "无法获取模型用量");
    } finally {
      if (activeRef.current && requestId === requestRef.current) setIsLoading(false);
    }
  }, [period]);

  useEffect(() => {
    activeRef.current = true;
    void refetch();
    return () => {
      activeRef.current = false;
      ++requestRef.current;
    };
  }, [refetch]);

  return { models, period, isLoading, error, refetch };
}
