import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MARKET_PAGE_SIZE, useLazyList } from "./marketLazyList";

describe("useLazyList", () => {
  const items = Array.from({ length: 25 }, (_, i) => ({ id: `item-${i}` }));

  it("caps loaded count at total after loadMore", () => {
    const { result } = renderHook(() => useLazyList(items, MARKET_PAGE_SIZE));

    expect(result.current.visibleCount).toBe(24);
    expect(result.current.total).toBe(25);
    expect(result.current.hasMore).toBe(true);

    act(() => {
      result.current.loadMore();
    });

    expect(result.current.visibleCount).toBe(25);
    expect(result.current.visible).toHaveLength(25);
    expect(result.current.hasMore).toBe(false);

    act(() => {
      result.current.loadMore();
    });

    expect(result.current.visibleCount).toBe(25);
    expect(result.current.hasMore).toBe(false);
  });

  it("does not reset visible count when items are appended", () => {
    const initial = items.slice(0, 25);
    const { result, rerender } = renderHook(
      ({ list }) => useLazyList(list, MARKET_PAGE_SIZE),
      { initialProps: { list: initial } },
    );

    act(() => {
      result.current.loadMore();
    });
    expect(result.current.visibleCount).toBe(25);

    const appended = [...initial, ...Array.from({ length: 10 }, (_, i) => ({ id: `item-${25 + i}` }))];
    rerender({ list: appended });

    expect(result.current.visibleCount).toBe(25);
    expect(result.current.total).toBe(35);
    expect(result.current.hasMore).toBe(true);
  });
});
