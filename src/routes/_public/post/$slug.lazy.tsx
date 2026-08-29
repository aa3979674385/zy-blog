import { useSuspenseQuery } from "@tanstack/react-query";
import { createLazyFileRoute, notFound } from "@tanstack/react-router";
import { PostPage } from "@theme/pages/post";
import { useEffect } from "react";
import { recordPageViewFn } from "@/features/pageview/api/pageview.api";
import { primaryPostQuery } from "./$slug";

/**
 * 文章页懒加载组件（路由拆分）：loader/head 保留在 $slug.tsx，
 * 组件及其依赖（文章渲染 → @tiptap/static-renderer / katex / shiki）
 * 通过 createLazyFileRoute 拆成独立 chunk，仅在进入文章页时下载。
 * 首屏（首页/列表/搜索）不再携带这部分代码。
 *
 * PostPage 直接从 "@theme/pages/post" 引入（构建期解析到当前主题），
 * 刻意不走 theme 桶 —— 桶的静态聚合会把 PostPage 的重依赖拖进全站公共入口。
 */
export const Route = createLazyFileRoute("/_public/post/$slug")({
  component: RouteComponent,
});

function RouteComponent() {
  const { slug } = Route.useParams();
  // 与 loader 共用同一份解析逻辑（primaryPostQuery），保证水合命中同一缓存 key
  const postQuery = primaryPostQuery(slug);
  const { data: post } = useSuspenseQuery(postQuery);

  useEffect(() => {
    if (!post?.id) return;
    try {
      const key = `pv:${post.id}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      // Safari private mode / storage disabled — record anyway
    }
    void recordPageViewFn({ data: { postId: post.id } });
  }, [post?.id]);

  if (!post) throw notFound();

  return (
    <>
      <PostPage post={post} />
    </>
  );
}
