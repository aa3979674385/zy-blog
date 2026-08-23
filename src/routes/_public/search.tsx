import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import theme from "@theme";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import {
  searchDocsQueryOptions,
  searchMetaQuery,
} from "@/features/search/queries";
import { useDebounce } from "@/hooks/use-debounce";
import { postSegment } from "@/lib/post-url";
import { m } from "@/paraglide/messages";

const searchSchema = z.object({
  q: z.string().optional(),
  page: z.number().int().positive().optional().default(1).catch(1),
});

export const Route = createFileRoute("/_public/search")({
  validateSearch: (search) => searchSchema.parse(search),
  component: SearchRoute,
  loader: () => {
    return {
      title: m.search_title(),
    };
  },
  head: ({ loaderData }) => {
    return {
      meta: [
        {
          title: loaderData?.title,
        },
      ],
    };
  },
});

function SearchRoute() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const [query, setQuery] = useState(search.q || "");

  useEffect(() => {
    if (search.q !== undefined && search.q !== query) {
      setQuery(search.q);
    }
  }, [search.q]);

  const debouncedQuery = useDebounce(query, 300);

  // 搜索词变化时重置到第 1 页
  useEffect(() => {
    if (debouncedQuery !== (search.q || "")) {
      navigate({
        search: (prev: ReturnType<typeof Route.useSearch>) => ({
          ...prev,
          q: debouncedQuery || undefined,
          page: 1,
        }),
        replace: true,
      });
    }
  }, [debouncedQuery, navigate, search.q]);

  const { data: meta } = useQuery({
    ...searchMetaQuery,
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading: isSearching } = useQuery({
    ...searchDocsQueryOptions(
      debouncedQuery,
      meta?.version || "init",
      search.page,
    ),
    enabled: debouncedQuery.length > 0 && !!meta?.version,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  });

  const searchResults = useMemo(
    () => data?.results ?? [],
    [data],
  );
  const totalPages = data?.totalPages ?? 1;

  const handleQueryChange = (newQuery: string) => {
    setQuery(newQuery);
  };

  const handleSelectPost = (post: { id: string | number; slug: string }) => {
    navigate({ to: "/post/$slug", params: { slug: postSegment(post) } });
  };

  const handleBack = () => {
    navigate({ to: "/" });
  };

  const handlePageChange = (page: number) => {
    navigate({
      search: (prev: ReturnType<typeof Route.useSearch>) => ({
        ...prev,
        page,
      }),
    });
    // 滚动到页面顶部
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <theme.SearchPage
      query={query}
      results={searchResults}
      isSearching={isSearching}
      onQueryChange={handleQueryChange}
      onSelectPost={handleSelectPost}
      onBack={handleBack}
      currentPage={search.page}
      totalPages={totalPages}
      onPageChange={handlePageChange}
    />
  );
}
