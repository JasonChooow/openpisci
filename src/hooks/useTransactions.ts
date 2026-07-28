import { useCallback, useEffect, useRef, useState } from "react";
import { usageApi, type UsageTransaction } from "../services/usageApi";

export interface UseTransactionsOptions {
  initialPage?: number;
  pageSize?: number;
  startDate?: string;
  endDate?: string;
}

export interface TransactionsState {
  items: UsageTransaction[];
  total: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  error: string | null;
  setPage: (page: number) => void;
  refetch: () => Promise<void>;
}

export function useTransactions(options: UseTransactionsOptions = {}): TransactionsState {
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 20));
  const [page, setPageState] = useState(Math.max(1, options.initialPage ?? 1));
  const [items, setItems] = useState<UsageTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const activeRef = useRef(false);
  const requestRef = useRef(0);

  const setPage = useCallback((nextPage: number) => {
    setPageState(Math.max(1, Math.trunc(nextPage)));
  }, []);

  const refetch = useCallback(async () => {
    const requestId = ++requestRef.current;
    if (activeRef.current) setIsLoading(true);
    try {
      const next = await usageApi.getTransactions({
        page,
        pageSize,
        startDate: options.startDate,
        endDate: options.endDate,
      });
      if (!activeRef.current || requestId !== requestRef.current) return;
      setItems(next.items);
      setTotal(next.total);
      setError(null);
      if (next.page !== page) setPageState(next.page);
    } catch (requestError) {
      if (!activeRef.current || requestId !== requestRef.current) return;
      setError(requestError instanceof Error ? requestError.message : "无法获取交易记录");
    } finally {
      if (activeRef.current && requestId === requestRef.current) setIsLoading(false);
    }
  }, [options.endDate, options.startDate, page, pageSize]);

  useEffect(() => {
    activeRef.current = true;
    void refetch();
    return () => {
      activeRef.current = false;
      ++requestRef.current;
    };
  }, [refetch]);

  return { items, total, page, pageSize, isLoading, error, setPage, refetch };
}
