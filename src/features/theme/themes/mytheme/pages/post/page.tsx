import { ClientOnly, Link, useRouteContext } from "@tanstack/react-router";
import { ContentRenderer } from "@theme/components/content/content-renderer";
import { Calendar, Folder, Pencil, Tag } from "lucide-react";
import type { PostPageProps } from "@/features/theme/contract/pages";
// 注意：@theme/* 别名在 tsconfig 里固定指向 themes/default，
// 而本主题的评论组件导出名是 FuwariCommentSection，
// 因此改用本主题的显式路径（与 fuwari 主题写法一致），避免 TS2724。
import { FuwariCommentSection } from "@/features/theme/themes/mytheme/components/comments/view/comment-section";
import { SidebarDownloadBox } from "@/features/post-resources/components/public/sidebar-download-box";
import { TestedBadge } from "@/features/theme/themes/mytheme/components/tested-badge";
import { authClient } from "@/lib/auth/auth.client";
import { m } from "@/paraglide/messages";
import { formatDate } from "@/lib/utils";
import { PostSummary } from "./components/post-summary";

export function PostPage({ post }: PostPageProps) {
  const { data: session } = authClient.useSession();
  const { siteConfig } = useRouteContext({ from: "__root__" });

  const copyrightNotice: string =
    siteConfig?.theme?.mytheme?.copyrightNotice ?? "";

  return (
    <div className="relative flex flex-col rounded-(--fuwari-radius-large) py-1 md:py-0 md:bg-transparent gap-4 mb-4 w-full">
      {/* 文章目录已关闭（原 TableOfContents 悬浮左侧；如需恢复请取消下方注释） */}
      {/* <div
        className="hidden 2xl:block absolute top-0 h-full pr-4"
        style={{
          left: "calc(var(--fuwari-toc-width) * -1)",
          width: "var(--fuwari-toc-width)",
        }}
      >
        <TableOfContents headers={post.toc} />
      </div> */}

      {/* Main Post Container */}
      <div className="fuwari-card-base z-10 px-6 md:px-9 pt-6 pb-4 relative w-full">
        {/* Top meta row: published date + category (left), edit (right, admin only) */}
        <div className="flex flex-row flex-wrap items-center justify-between gap-4 mb-3 fuwari-text-30 transition">
          <div className="flex flex-row flex-wrap items-center gap-4">
            {/* Publish date */}
            <div className="flex items-center">
              <Calendar strokeWidth={1.5} size={18} className="fuwari-text-50 mr-1.5" />
              <span className="text-sm font-medium fuwari-text-50">
                <ClientOnly fallback="-">{formatDate(post.publishedAt)}</ClientOnly>
              </span>
            </div>
            {/* 亲自测试状态徽章：位于发布时间之后、分类之前 */}
            <TestedBadge tested={post.isTested} />
            {/* Category */}
            {post.categories && post.categories.length > 0 && (
              <div className="flex items-center">
                <Folder strokeWidth={1.5} size={18} className="fuwari-text-50 mr-1.5" />
                <div className="flex flex-row flex-nowrap items-center gap-x-1.5">
                  {post.categories.map((cat, i) => (
                    <span key={cat.id} className="flex items-center">
                      {i > 0 && (
                        <span className="mx-1.5 text-(--fuwari-meta-divider) text-sm">
                          /
                        </span>
                      )}
                      <Link
                        to="/posts"
                        search={{ categoryId: cat.id }}
                        className="transition fuwari-text-50 text-sm font-medium hover:text-(--fuwari-primary) whitespace-nowrap"
                      >
                        {cat.name}
                      </Link>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          {session?.user.role === "admin" && (
            <Link
              to="/admin/posts/edit/$id"
              params={{ id: String(post.id) }}
              className="flex flex-row items-center fuwari-text-30 hover:fuwari-text-90 transition animate-in fade-in duration-500"
            >
              <Pencil strokeWidth={1.5} size={16} className="mr-2" />
              <span className="text-sm">{m.post_edit()}</span>
            </Link>
          )}
        </div>

        {/* Title */}
        <div className="relative">
          <h1
            className="transition w-full block font-bold mb-3
              text-3xl md:text-[2.25rem]/[2.75rem]
              fuwari-text-90
              md:before:w-1 before:h-5 before:rounded-md before:bg-(--fuwari-primary)
              before:absolute before:top-3 before:-left-4.5"
            style={{ viewTransitionName: `post-title-${post.slug}` }}
          >
            {post.title}
          </h1>
        </div>

        {/* 标题下的短装饰线：呼应标题左侧 accent 竖线，统一标题区与内容的层次（有无摘要都显示） */}
        <div className="h-0.5 w-14 rounded-full bg-(--fuwari-primary) mb-4" />

        {/* Summary */}
        <PostSummary summary={post.summary} />

        {/* Markdown Content */}
        <div className="mb-6 prose dark:prose-invert prose-base max-w-none! fuwari-custom-md">
          <ContentRenderer content={post.contentJson} />
        </div>

        {/* Download Module (Mobile only - between content and END, looks part of article) */}
        <div className="block lg:hidden mb-6">
          <SidebarDownloadBox postId={post.id} postTitle={post.title} />
        </div>

        {/* Tags below content, above END divider */}
        {post.tags && post.tags.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-2 mb-6 fuwari-text-30">
            <Tag strokeWidth={1.5} size={18} className="fuwari-text-50" />
            {post.tags.map((tag) => (
              <Link
                key={tag.name}
                to="/posts"
                search={{ tagName: tag.name }}
                className="transition fuwari-text-50 text-sm font-medium hover:text-(--fuwari-primary) whitespace-nowrap"
              >
                #{tag.name}
              </Link>
            ))}
          </div>
        )}

        {/* End of Content Notice */}
        <div className="my-8 flex items-center justify-center w-full">
          <div className="h-px w-full bg-linear-to-r from-transparent via-(--fuwari-meta-divider) to-transparent opacity-20" />
          <span className="mx-4 text-sm font-mono tracking-widest text-(--fuwari-meta-divider) opacity-50 whitespace-nowrap">
            END
          </span>
          <div className="h-px w-full bg-linear-to-r from-(--fuwari-meta-divider) via-transparent to-transparent opacity-20" />
        </div>

        {/* Copyright Notice */}
        {copyrightNotice ? (
          <div className="mt-6">
          <div
            dangerouslySetInnerHTML={{ __html: copyrightNotice }}
            className="prose dark:prose-invert prose-sm max-w-none! text-(--fuwari-meta-divider)/70"
            />
          </div>
        ) : null}
      </div>

      {/* Prev/Next buttons (Mock implementation for layout, actual data would come from the server in an ideal setup) */}
      <div className="hidden flex-col md:flex-row justify-between gap-4 overflow-hidden w-full">
        {/* Note: the backend schema doesn't currently provide prev/next slugs in PostWithToc. Using placeholder layouts to match Fuwari exactly. */}
      </div>

      {/* Comments Section */}
      <div className="fuwari-card-base p-6">
        <FuwariCommentSection postId={post.id} />
      </div>
    </div>
  );
}
