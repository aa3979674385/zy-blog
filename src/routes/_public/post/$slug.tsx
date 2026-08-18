import { type QueryClient } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import theme from "@theme";
// 直接引入 skeleton（绕过 pages/post 的 barrel）：
// barrel 会同时导出 PostPage（→ @tiptap/static-renderer / katex / shiki 重型链），
// 本文件是路由静态模块、会被打进全站入口 chunk，若走 barrel 会把文章渲染库
// 全部拖进首屏（线上实测入口 1.97MB → 首开导航不可用）。
import { PostPageSkeleton } from "@theme/pages/post/skeleton";
import { z } from "zod";
import { siteConfigQuery, siteDomainQuery } from "@/features/config/queries";
import { postBySlugQuery, relatedPostsQuery, popularPostsQuery, postByIdPublicQuery } from "@/features/posts/queries";
import { publicPostResourcesQuery } from "@/features/post-resources/queries";
import type { PostWithToc } from "@/features/posts/schema/posts.schema";
import {
  buildArticleJsonLd,
  buildCanonicalUrl,
  canonicalLink,
} from "@/lib/seo";
import { postPath, decodeSegment } from "@/lib/post-url";

const searchSchema = z.object({
  highlightCommentId: z.coerce.number().optional(),
  rootId: z.number().optional(),
});

const { relatedPostsLimit } = theme.config.post;

/**
 * 主查询解析：loader 与组件必须共用同一份逻辑，保证客户端水合命中同一份缓存 key。
 *
 * 关键修复：解析只依据「段落本身是否为数字」，不再依赖全局 currentMode 单例。
 *  - 数字段落（/post/123.html）→ 只能来自 id 模式 → 走 postByIdQuery
 *  - 非数字段落（/post/my-slug.html）→ 来自 slug 模式 → 走 postBySlugQuery
 * 这样无论服务端还是客户端渲染，算出的 query key 完全一致，避免水合 key 不匹配导致的 404。
 * 末尾 .html 在此统一剥掉。
 */
function primaryPostQuery(segment: string) {
  const clean = decodeSegment(segment).replace(/\.html$/i, "");
  const idNum = Number(clean);
  const isNumeric = Number.isInteger(idNum) && idNum > 0;
  if (isNumeric) return postByIdPublicQuery(idNum);
  return postBySlugQuery(clean);
}

export { primaryPostQuery };

/**
 * 按当前段落加载文章。主查询与 primaryPostQuery 完全一致（确定性，与服务端/组件共用）。
 * 数字段落按 id 取不到时，再退回按 slug 取一次（兼容极老的纯数字 slug 链接），
 * 并把结果镜像到 id 查询缓存，保证组件始终能命中同一 key。
 */
export async function loadPostBySegment(
  queryClient: QueryClient,
  segment: string,
): Promise<PostWithToc | null> {
  const clean = decodeSegment(segment).replace(/\.html$/i, "");
  const idNum = Number(clean);
  const isNumeric = Number.isInteger(idNum) && idNum > 0;

  // 主解析：数字→id，非数字→slug（确定性，服务端/客户端一致）
  const post = (await queryClient
    .ensureQueryData(primaryPostQuery(segment))
    .catch(() => null)) as PostWithToc | null;
  if (post) return post;

  // 兜底：数字段落按 id 取不到时，再试一次 slug（兼容极老的纯数字 slug 链接）
  if (isNumeric) {
    const bySlug = (await queryClient
      .ensureQueryData(postBySlugQuery(clean))
      .catch(
        () => null,
      )) as (PostWithToc & { isSynced: boolean; hasPublicCache: boolean }) | null;
    if (bySlug) {
      queryClient.setQueryData(postByIdPublicQuery(idNum).queryKey, bySlug);
      return bySlug;
    }
  }
  return null;
}

export const Route = createFileRoute("/_public/post/$slug")({
  validateSearch: searchSchema,
  // 组件已拆到 $slug.lazy.tsx（路由懒加载），让文章渲染相关依赖（@tiptap/katex/shiki）
  // 只在进入文章页时加载，避免打进全站首屏入口 chunk（线上实测入口 1.97MB → 首开导航不可用）。
  loader: async ({ context, params }) => {
    // 1. Critical: Main post data - use serverFn (executes directly on server, no HTTP)
    const [post, domain, siteConfig] = await Promise.all([
      loadPostBySegment(context.queryClient, params.slug),
      // 站点域名：单个 serverFn 偶发失败不应阻断文章页导航，失败时回退到缓存。
      context.queryClient
        .ensureQueryData(siteDomainQuery)
        .catch(() =>
          context.queryClient.getQueryData(siteDomainQuery.queryKey) ?? undefined,
        ),
      // 站点配置：同上，单个失败不应阻断文章页导航。
      context.queryClient
        .ensureQueryData(siteConfigQuery)
        .catch(() =>
          context.queryClient.getQueryData(siteConfigQuery.queryKey) ?? undefined,
        ),
      // 热门文章：SSR 预取，整页刷新时客户端直接水合、不再重新请求后端
      context.queryClient
        .ensureQueryData(popularPostsQuery(5))
        .catch((err) => {
          console.error("[loader] 预取热门文章失败（不影响文章主体）", err);
          return undefined;
        }),
    ]);

    // 2. Deferred: Related posts (prefetch only, don't await)
    void context.queryClient.prefetchQuery(
      relatedPostsQuery(post?.slug ?? params.slug, relatedPostsLimit),
    );

    if (!post) throw notFound();

    // 下载资源：SSR 预取，详情页 / 右侧栏下载模块首屏即出，不必等客户端二次回查。
    // 与「热门文章」同一机制（loader 内 ensureQueryData → dehydrated cache → 水合即渲染）。
    await context.queryClient
      .ensureQueryData(publicPostResourcesQuery(post.id))
      .catch((err) => {
        console.error("[loader] 预取下载资源失败（不影响文章主体）", err);
      });

    return {
      post,
      authorName: siteConfig?.author,
      canonicalHref: buildCanonicalUrl(domain ?? "", postPath(post)),
    };
  },
  head: ({ loaderData }) => {
    const post = loaderData?.post;
    const canonicalHref = loaderData?.canonicalHref ?? "";

    return {
      meta: [
        {
          title: post?.title,
        },
        {
          name: "description",
          content: post?.summary ?? "",
        },
        { property: "og:title", content: post?.title ?? "" },
        { property: "og:description", content: post?.summary ?? "" },
        { property: "og:type", content: "article" },
        { property: "og:url", content: canonicalHref },
      ],
      links: [canonicalLink(canonicalHref)],
      scripts: post
        ? [
            {
              type: "application/ld+json",
              children: buildArticleJsonLd({
                authorName: loaderData.authorName,
                canonicalHref,
                post,
              }),
            },
          ]
        : [],
    };
  },
  pendingComponent: () => <PostPageSkeleton />,
  pendingMs: __THEME_CONFIG__.pendingMs,
});
