import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import theme from "@theme";
import type { HomeCategoryTabConfig } from "@/features/theme/contract/pages";
import { siteDomainQuery } from "@/features/config/queries";
import {
  pinnedPostsQuery,
  postsByCategoryQuery,
} from "@/features/posts/queries";
import { categoriesQueryOptions } from "@/features/categories/queries";
import { buildCanonicalUrl, canonicalLink } from "@/lib/seo";

export const Route = createFileRoute("/_public/")({
  loader: async ({ context }) => {
    const homeCategoryTabs =
      context.siteConfig?.theme?.mytheme?.homeCategoryTabs ?? [];
    const recentPostsLimit =
      context.siteConfig?.theme?.mytheme?.recentPostsLimit ??
      theme.config.home.recentPostsLimit;
    const homeCategoryStyle =
      context.siteConfig?.theme?.mytheme?.homeCategoryStyle ?? "tabs";

    // 核心首屏数据（3 个查询，并行）：
    // - pinnedPosts：组件使用，SSR 缓存减少首屏延迟
    // - siteDomain：SEO canonical 链接需要
    // - categories：构建分类 Tab 元数据（displayName 等）
    // 注意：recentPosts / popularPosts / 分类文章列表 均不在 loader 预取，
    // 因为 mytheme HomePage 组件内部自行通过 postsPagedQueryOptions 查询，
    // 预取这些 query 只会增加 SSR 耗时且缓存不会被命中（queryKey 不同）。
    const baseDataPromise = Promise.all([
      context.queryClient.ensureQueryData(pinnedPostsQuery),
      context.queryClient.ensureQueryData(siteDomainQuery),
      context.queryClient.ensureQueryData(categoriesQueryOptions),
    ]);

    // stacked 模式：所有分类区块都显示在首屏，必须全部预取。
    // tabs 模式：HomePage 组件内部自行查询，这里不预取（避免浪费）。
    const categoryPostsPromise =
      homeCategoryStyle === "stacked" && homeCategoryTabs.length > 0
        ? Promise.all(
            homeCategoryTabs.map((tab) =>
              context.queryClient.ensureQueryData(
                postsByCategoryQuery(tab.categoryId, tab.postLimit),
              ),
            ),
          )
        : Promise.resolve([]);

    const [, domain, publicCategories] = await baseDataPromise;
    const perCategoryPosts = await categoryPostsPromise;

    // 构建 categoryId -> name 映射（用于 tab displayName fallback）
    const categoryNameById = new Map<number, string>();
    for (const cat of publicCategories ?? []) {
      categoryNameById.set(cat.id, cat.name);
    }

    const categoryTabs: Array<HomeCategoryTabConfig> = homeCategoryTabs.map(
      (tab, idx) => ({
        categoryId: tab.categoryId,
        label: tab.label,
        postLimit: tab.postLimit,
        posts: perCategoryPosts[idx] ?? [],
        displayName:
          tab.label?.trim() ||
          categoryNameById.get(tab.categoryId) ||
          `分类#${tab.categoryId}`,
      }),
    );

    return {
      canonicalHref: buildCanonicalUrl(domain, "/"),
      recentPostsLimit,
      homeCategoryStyle,
      categoryTabs,
    };
  },
  head: ({ loaderData }) => ({
    links: [canonicalLink(loaderData?.canonicalHref ?? "/")],
  }),
  pendingComponent: HomePageSkeleton,
  component: HomeRoute,
});

function HomeRoute() {
  const { recentPostsLimit, categoryTabs, homeCategoryStyle } =
    Route.useLoaderData();

  // pinnedPosts 在 SSR 阶段已通过 loader ensureQueryData 写入缓存，
  // 这里读取命中缓存，不会触发新的服务端请求。
  const { data: pinnedPosts } = useSuspenseQuery(pinnedPostsQuery);

  return (
    <theme.HomePage
      recentPostsLimit={recentPostsLimit}
      homeCategoryStyle={homeCategoryStyle}
      categoryTabs={categoryTabs}
      pinnedPosts={pinnedPosts}
    />
  );
}

function HomePageSkeleton() {
  return <theme.HomePageSkeleton />;
}
