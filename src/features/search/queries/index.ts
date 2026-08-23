import { queryOptions } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { getIndexVersionFn } from "../api/search.api";

export const SEARCH_KEYS = {
  all: ["search"] as const,

  // Leaf keys (static arrays - no child queries)
  meta: ["search", "meta"] as const,

  // Child keys (functions for specific queries)
  results: (query: string, version: string, page: string) =>
    ["search", "results", query, version, page] as const,
};

export const searchMetaQuery = queryOptions({
  queryKey: SEARCH_KEYS.meta,
  queryFn: () => getIndexVersionFn(),
});

export const searchDocsQueryOptions = (
  query: string,
  version: string,
  page: number = 1,
) =>
  queryOptions({
    queryKey: SEARCH_KEYS.results(query, version, String(page)),
    queryFn: async () => {
      const res = await apiClient.search.$get({
        query: { q: query, v: version, page: String(page) },
      });
      if (!res.ok) throw new Error("Failed to search");
      return res.json();
    },
  });
