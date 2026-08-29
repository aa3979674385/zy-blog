import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { mediaInfiniteQueryOptions } from "@/features/media/queries";
import { useDebounce } from "@/hooks/use-debounce";

/**
 * 媒体库视频选择 hook（视频插入面板「媒体库」tab 用）。
 * 与 useMediaPicker 同构，仅过滤 video/* 类型。
 */
export function useVideoPicker() {
  // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Infinite Query for media list
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } =
    useInfiniteQuery({
      ...mediaInfiniteQueryOptions(debouncedSearch),
    });

  // Flatten all pages and filter to videos only
  const mediaItems = useMemo(() => {
    const items = data?.pages.flatMap((page) => page.items) ?? [];
    return items.filter((m) => m.mimeType.startsWith("video/"));
  }, [data]);

  // Load more handler - memoized to prevent IntersectionObserver recreation
  const loadMore = useCallback(() => {
    if (!isFetchingNextPage && hasNextPage) {
      fetchNextPage();
    }
  }, [isFetchingNextPage, hasNextPage, fetchNextPage]);

  return {
    mediaItems,
    searchQuery,
    setSearchQuery,
    loadMore,
    hasMore: hasNextPage,
    isLoadingMore: isFetchingNextPage,
    isPending,
  };
}
