import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { PostManager } from "@/features/posts/components/post-manager";
import type {
  SortDirection,
  SortField,
  StatusFilter,
} from "@/features/posts/components/post-manager/types";
import {
  SORT_DIRECTIONS,
  SORT_FIELDS,
  STATUS_FILTERS,
} from "@/features/posts/components/post-manager/types";

const searchSchema = z.object({
  page: z.number().int().positive().optional().default(1).catch(1),
  status: z.enum(STATUS_FILTERS).optional().default("ALL").catch("ALL"),
  sortDir: z.enum(SORT_DIRECTIONS).optional().default("DESC").catch("DESC"),
  sortBy: z
    .enum(SORT_FIELDS)
    .optional()
    .default("updatedAt")
    .catch("updatedAt"),
  search: z.string().optional().default("").catch(""),
  /** 按分类筛选 */
  categoryId: z.number().int().optional(),
  /** 未分类视图：仅显示未归入任何分类的文章 */
  uncategorized: z.coerce.boolean().optional(),
});

export type PostsSearchParams = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/admin/posts/")({
  ssr: "data-only",
  validateSearch: searchSchema,
  component: PostManagerPage,
});

function PostManagerPage() {
  const navigate = useNavigate();
  const { page, status, sortDir, sortBy, search, categoryId, uncategorized } =
    Route.useSearch();

  const updateSearch = (updates: Partial<PostsSearchParams>) => {
    navigate({
      to: "/admin/posts",
      search: {
        page: updates.page ?? 1,
        status: updates.status ?? status,
        sortDir: updates.sortDir ?? sortDir,
        sortBy: updates.sortBy ?? sortBy,
        search: updates.search ?? search,
        // 互斥：categoryId 与 uncategorized 不能同时存在
        categoryId:
          updates.uncategorized !== undefined
            ? undefined
            : updates.categoryId !== undefined
              ? updates.categoryId
              : categoryId,
        uncategorized:
          updates.categoryId !== undefined
            ? undefined
            : updates.uncategorized !== undefined
              ? updates.uncategorized
              : uncategorized,
      },
    });
  };

  const handleCategoryChange = (newCategoryId?: number) => {
    updateSearch({ categoryId: newCategoryId, uncategorized: undefined, page: 1 });
  };

  const handleUncategorizedToggle = () => {
    updateSearch({ uncategorized: true, categoryId: undefined, page: 1 });
  };

  const handlePageChange = (newPage: number) => {
    updateSearch({ page: newPage });
  };

  const handleStatusChange = (newStatus: StatusFilter) => {
    updateSearch({ status: newStatus });
  };

  const handleSortUpdate = (update: {
    dir?: SortDirection;
    sortBy?: SortField;
  }) => {
    updateSearch({
      sortDir: update.dir ?? sortDir,
      sortBy: update.sortBy ?? sortBy,
    });
  };

  const handleSearchChange = (newSearch: string) => {
    updateSearch({ search: newSearch });
  };

  const handleResetFilters = () => {
    navigate({
      to: "/admin/posts",
      search: {
        page: 1,
        status: "ALL",
        sortDir: "DESC",
        sortBy: "updatedAt",
        search: "",
        categoryId: undefined,
        uncategorized: undefined,
      },
    });
  };

  return (
    <PostManager
      page={page}
      status={status}
      sortDir={sortDir}
      sortBy={sortBy}
      search={search}
      categoryId={categoryId}
      uncategorized={uncategorized}
      onPageChange={handlePageChange}
      onStatusChange={handleStatusChange}
      onSortUpdate={handleSortUpdate}
      onSearchChange={handleSearchChange}
      onCategoryChange={handleCategoryChange}
      onUncategorizedToggle={handleUncategorizedToggle}
      onResetFilters={handleResetFilters}
    />
  );
}
