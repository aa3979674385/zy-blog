import { useMemo, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import type { HomeCategoryTabConfig, HomePageProps } from "@/features/theme/contract/pages";
import type { PostItem } from "@/features/posts/schema/posts.schema";
import { CategoryTabs, type Tab } from "../../components/category-tabs";
import { GridPostCard } from "../../components/grid-post-card";
import { Pagination } from "@/features/theme/components/pagination";
import { postsPagedQueryOptions } from "@/features/posts/queries";

/**
 * 把置顶文章固定到列表最前面（第 1 页），其余文章去重后跟在后面，并截断到每页数量。
 * 置顶文章占用「最新文章」的名额（不额外多显示），所以第 1 页总数 = pageSize。
 */
function withPinnedOnTop(
  items: Array<PostItem>,
  pinned: Array<PostItem> | undefined,
  page: number,
  pageSize: number,
): Array<PostItem> {
  if (!pinned?.length || page !== 1) return items;
  const pinnedSlugs = new Set(pinned.map((p) => p.slug));
  const rest = items.filter((p) => !pinnedSlugs.has(p.slug));
  return [...pinned, ...rest].slice(0, pageSize);
}

/**
 * 计算真正发给后端的 limit/offset（仅对「最新发布」全部文章、且排除置顶时生效）。
 * 目标：置顶文章算进「最新文章」的名额里——
 *   第 1 页 = 置顶(pinnedCount) + 普通前(pageSize-pinnedCount)篇 = 共 pageSize 篇；
 *   第 2 页起接着普通文章连续翻页，offset 扣除第 1 页已展示的置顶名额，保证不重不漏。
 */
function resolvePagedQuery(
  page: number,
  pageSize: number,
  pinnedCount: number,
  excludePinned: boolean,
): { limit: number; offset: number | undefined } {
  if (!excludePinned || pinnedCount <= 0) {
    return { limit: pageSize, offset: undefined };
  }
  if (page === 1) {
    return { limit: Math.max(0, pageSize - pinnedCount), offset: 0 };
  }
  return { limit: pageSize, offset: (page - 1) * pageSize - pinnedCount };
}

const LATEST_TAB_ID = "__latest__";
const HOME_DEFAULT_PAGE_SIZE = 12;

type StyleMode = "tabs" | "stacked";

export function HomePage({
  recentPostsLimit,
  categoryTabs = [],
  homeCategoryStyle = "tabs",
  pinnedPosts,
}: HomePageProps) {
  const mode: StyleMode =
    homeCategoryStyle === "stacked" ? "stacked" : "tabs";

  if (mode === "stacked") {
    return (
      <HomeStackedView
        recentPostsLimit={recentPostsLimit}
        categoryTabs={categoryTabs}
        pinnedPosts={pinnedPosts}
      />
    );
  }
  return (
    <HomeTabsView
      recentPostsLimit={recentPostsLimit}
      categoryTabs={categoryTabs}
      pinnedPosts={pinnedPosts}
    />
  );
}

/** 标签切换式：顶部一排 tab，选一个分类显示其文章（原逻辑） */
function HomeTabsView({
  recentPostsLimit,
  categoryTabs,
  pinnedPosts,
}: {
  recentPostsLimit?: number;
  categoryTabs: Array<HomeCategoryTabConfig>;
  pinnedPosts?: Array<PostItem>;
}) {
  const [activeId, setActiveId] = useState<string>(LATEST_TAB_ID);
  const [page, setPage] = useState(1);

  // tab 列表：最新发布 + 后台配置的分类 tab（按配置顺序）
  const tabs = useMemo<Tab[]>(() => {
    const list: Tab[] = [{ id: LATEST_TAB_ID, label: "最新发布" }];
    for (const cfg of categoryTabs) {
      list.push({ id: `cat_${cfg.categoryId}`, label: cfg.displayName });
    }
    return list;
  }, [categoryTabs]);

  // 当前选中的分类 id（"最新发布"为 undefined → 查全部）
  const activeCategoryId = activeId.startsWith("cat_")
    ? Number(activeId.slice(4))
    : undefined;

  // 当前 tab 每页数量：最新发布用 recentPostsLimit，分类用该 tab 的 postLimit
  const pageSize = useMemo(() => {
    if (activeCategoryId === undefined) {
      return recentPostsLimit && recentPostsLimit > 0
        ? recentPostsLimit
        : HOME_DEFAULT_PAGE_SIZE;
    }
    const tab = categoryTabs.find((t) => t.categoryId === activeCategoryId);
    return tab?.postLimit && tab.postLimit > 0
      ? tab.postLimit
      : HOME_DEFAULT_PAGE_SIZE;
  }, [activeCategoryId, recentPostsLimit, categoryTabs]);

  // “更多”链接目标：选中具体分类 → /posts?categoryId=X；选中“最新发布”(全部) → /posts
  const moreSearch = useMemo<{ categoryId?: number }>(() => {
    if (activeCategoryId !== undefined) {
      return { categoryId: activeCategoryId };
    }
    return {};
  }, [activeCategoryId]);

  const pinnedCount = pinnedPosts?.length ?? 0;
  // 最新发布（全部文章）排除置顶：置顶由 pinnedPosts 单独注入第 1 页顶部。
  // 把置顶占的名额从第 1 页普通文章数里扣掉，使第 1 页总数 = pageSize（含置顶），翻页连续不重不漏。
  const pagedQuery = useMemo(
    () =>
      resolvePagedQuery(
        page,
        pageSize,
        pinnedCount,
        activeCategoryId === undefined,
      ),
    [page, pageSize, pinnedCount, activeCategoryId],
  );

  const { data } = useSuspenseQuery(
    postsPagedQueryOptions({
      categoryId: activeCategoryId,
      page,
      limit: pagedQuery.limit,
      offset: pagedQuery.offset,
      excludePinned: activeCategoryId === undefined,
    }),
  );
  const visiblePosts = data.items;
  // 「最新发布」的总页数按「置顶 + 普通文章」总数算（置顶占用名额，所以总数含置顶）；分类 tab 用后端返回值。
  const totalPages = useMemo(() => {
    if (activeCategoryId !== undefined) return data.totalPages;
    const total = pinnedCount + (data.totalCount ?? 0);
    return Math.max(1, Math.ceil(total / pageSize));
  }, [activeCategoryId, data.totalPages, data.totalCount, pinnedCount, pageSize]);
  // 仅「最新发布」(全部文章) 把置顶文章固定到最前（并截断到每页数量）；具体分类 tab 不强制置顶。
  const displayPosts =
    activeCategoryId === undefined
      ? withPinnedOnTop(visiblePosts, pinnedPosts, page, pageSize)
      : visiblePosts;

  // 切换分类 tab 时回到第 1 页
  const handleTabChange = (id: string) => {
    setActiveId(id);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-6">
      {tabs.length > 0 && (
        <div className="flex items-center gap-4">
          <CategoryTabs
            tabs={tabs}
            activeId={activeId}
            onChange={handleTabChange}
          />
          <Link
            to="/posts"
            search={moreSearch}
            className="group ml-auto flex shrink-0 items-center gap-0.5 text-sm font-medium text-(--fuwari-meta) transition hover:text-(--fuwari-primary)"
          >
            更多
            <ChevronRight
              size={16}
              className="transition-transform group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      )}

      {displayPosts.length === 0 ? (
        <div className="flex min-h-40 items-center justify-center rounded-2xl bg-(--fuwari-card-bg) py-16 text-(--fuwari-meta)">
          {activeCategoryId === undefined ? "暂无最新发布" : "该分类下暂无文章"}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
          {displayPosts.map((post) => (
            <GridPostCard
              key={post.slug}
              post={post}
              showPinned={activeCategoryId === undefined}
            />
          ))}
        </div>
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}

/** 单个分类区块（含标题、文章网格、独立分页、更多），堆叠式复用 */
function CategorySection({
  categoryId,
  limit,
  title,
  pinnedPosts,
  isLatest,
}: {
  categoryId?: number;
  limit: number;
  title: string;
  pinnedPosts?: Array<PostItem>;
  isLatest?: boolean;
}) {
  const [page, setPage] = useState(1);

  const isLatestAll = !!isLatest && categoryId === undefined;
  const pinnedCount = isLatestAll ? (pinnedPosts?.length ?? 0) : 0;
  // 「最新发布」区块排除置顶；置顶占用的名额从第 1 页普通文章数里扣掉（与首页 tab 行为一致）。
  const pagedQuery = useMemo(
    () => resolvePagedQuery(page, limit, pinnedCount, isLatestAll),
    [page, limit, pinnedCount, isLatestAll],
  );

  // 按分类 + 当前页实时分页查询（categoryId 为 undefined → 最新发布/全部）
  // 「最新发布」区块排除置顶，与首页 tab 行为一致：置顶仅在第 1 页顶部出现一次。
  const { data } = useSuspenseQuery(
    postsPagedQueryOptions({
      categoryId,
      page,
      limit: pagedQuery.limit,
      offset: pagedQuery.offset,
      excludePinned: isLatestAll,
    }),
  );
  const visiblePosts = data.items;
  // 「最新发布」区块总页数按「置顶 + 普通」算；具体分类区块用后端返回值。
  const totalPages = useMemo(() => {
    if (!isLatestAll) return data.totalPages;
    const total = pinnedCount + (data.totalCount ?? 0);
    return Math.max(1, Math.ceil(total / limit));
  }, [isLatestAll, data.totalPages, data.totalCount, pinnedCount, limit]);
  // 「最新发布」区块把置顶文章固定到最前，具体分类区块不强制置顶。
  const displayPosts = isLatestAll
    ? withPinnedOnTop(visiblePosts, pinnedPosts, page, limit)
    : visiblePosts;

  const moreSearch = useMemo<{ categoryId?: number }>(
    () => (categoryId !== undefined ? { categoryId } : {}),
    [categoryId],
  );

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-semibold text-(--fuwari-title)">{title}</h2>
        <Link
          to="/posts"
          search={moreSearch}
          className="group ml-auto flex shrink-0 items-center gap-0.5 text-sm font-medium text-(--fuwari-meta) transition hover:text-(--fuwari-primary)"
        >
          更多
          <ChevronRight
            size={16}
            className="transition-transform group-hover:translate-x-0.5"
          />
        </Link>
      </div>

      {displayPosts.length === 0 ? (
        <div className="flex min-h-32 items-center justify-center rounded-2xl bg-(--fuwari-card-bg) py-12 text-(--fuwari-meta)">
          暂无文章
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
          {displayPosts.map((post) => (
            <GridPostCard key={post.slug} post={post} showPinned={isLatestAll} />
          ))}
        </div>
      )}

      <Pagination
        currentPage={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </section>
  );
}

/** 垂直堆叠式：最新发布 + 各分类依次向下堆叠成多个区块，每块独立翻页 */
function HomeStackedView({
  recentPostsLimit,
  categoryTabs,
  pinnedPosts,
}: {
  recentPostsLimit?: number;
  categoryTabs: Array<HomeCategoryTabConfig>;
  pinnedPosts?: Array<PostItem>;
}) {
  const latestLimit =
    recentPostsLimit && recentPostsLimit > 0
      ? recentPostsLimit
      : HOME_DEFAULT_PAGE_SIZE;

  return (
    <div className="flex flex-col gap-10">
      <CategorySection
        categoryId={undefined}
        limit={latestLimit}
        title="最新发布"
        pinnedPosts={pinnedPosts}
        isLatest
      />
      {categoryTabs.map((tab) => {
        const limit =
          tab.postLimit && tab.postLimit > 0
            ? tab.postLimit
            : HOME_DEFAULT_PAGE_SIZE;
        return (
          <CategorySection
            key={tab.categoryId}
            categoryId={tab.categoryId}
            limit={limit}
            title={tab.displayName}
          />
        );
      })}
    </div>
  );
}

// 类型 re-export keep TS happy in other themes that may reference HomeCategoryTabConfig
export type { HomeCategoryTabConfig };
