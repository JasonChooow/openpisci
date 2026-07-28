import { useCallback, useEffect, useRef, useState } from "react";
import { usageApi, UsageApiError, type ClaimDailyResult } from "../services/usageApi";

export interface BalanceState {
  balance: number | null;
  currency: string;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  claimDaily: () => Promise<ClaimDailyResult | null>;
  isClaiming: boolean;
  claimError: string | null;
  claimErrorCode: string | null;
  hasClaimedToday: boolean;
}

function message(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export function useBalance(): BalanceState {
  const [balance, setBalance] = useState<number | null>(null);
  const [currency, setCurrency] = useState("CNY");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimErrorCode, setClaimErrorCode] = useState<string | null>(null);
  const [hasClaimedToday, setHasClaimedToday] = useState(false);
  const activeRef = useRef(false);
  const balanceRequestRef = useRef(0);
  const claimRequestRef = useRef(0);

  const refetch = useCallback(async () => {
    const requestId = ++balanceRequestRef.current;
    if (activeRef.current) setIsLoading(true);
    try {
      const next = await usageApi.getBalance();
      if (!activeRef.current || requestId !== balanceRequestRef.current) return;
      setBalance(next.balance);
      setCurrency(next.currency);
      setError(null);
    } catch (requestError) {
      if (!activeRef.current || requestId !== balanceRequestRef.current) return;
      setError(message(requestError, "无法获取账户余额"));
    } finally {
      if (activeRef.current && requestId === balanceRequestRef.current) setIsLoading(false);
    }
  }, []);

  const claimDaily = useCallback(async (): Promise<ClaimDailyResult | null> => {
    const requestId = ++claimRequestRef.current;
    if (activeRef.current) {
      setIsClaiming(true);
      setClaimError(null);
      setClaimErrorCode(null);
    }
    try {
      const result = await usageApi.claimDaily();
      if (!activeRef.current || requestId !== claimRequestRef.current) return null;
      setBalance(result.newBalance);
      setHasClaimedToday(true);
      await refetch();
      return result;
    } catch (requestError) {
      if (!activeRef.current || requestId !== claimRequestRef.current) return null;
      const code = requestError instanceof UsageApiError ? requestError.code : null;
      setClaimErrorCode(code);
      setClaimError(message(requestError, "无法领取每日额度"));
      if (code === "already_claimed") setHasClaimedToday(true);
      return null;
    } finally {
      if (activeRef.current && requestId === claimRequestRef.current) setIsClaiming(false);
    }
  }, [refetch]);

  useEffect(() => {
    activeRef.current = true;
    void refetch();
    return () => {
      activeRef.current = false;
      ++balanceRequestRef.current;
      ++claimRequestRef.current;
    };
  }, [refetch]);

  return {
    balance,
    currency,
    isLoading,
    error,
    refetch,
    claimDaily,
    isClaiming,
    claimError,
    claimErrorCode,
    hasClaimedToday,
  };
}
