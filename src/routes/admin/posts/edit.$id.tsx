import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryOptions } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { MEDIA_KEYS } from "@/features/media/queries";
import {
  findPostByIdFn,
  updatePostFn as adminUpdatePostFn,
} from "@/features/posts/api/posts.admin.api";
import { PostEditor } from "@/features/posts/components/post-editor";
import { PostEditorSkeleton } from "@/features/posts/components/post-editor/post-editor-skeleton";
import type { PostEditorData } from "@/features/posts/components/post-editor/types";
import { POSTS_KEYS } from "@/features/posts/queries";
import type { PostWithToc } from "@/features/posts/schema/posts.schema";
import { PostWithTocSchema } from "@/features/posts/schema/posts.schema";
import { generateTableOfContents } from "@/features/posts/utils/toc";
import { setPostTagsFn } from "@/features/tags/api/tags.api";
import {
  TAGS_KEYS,
  tagsAdminQueryOptions,
  tagsByPostIdQueryOptions,
} from "@/features/tags/queries";
import { setPostCategoriesFn } from "@/features/categories/api/categories.api";
import {
  CATEGORIES_KEYS,
  categoriesAdminQueryOptions,
  categoriesByPostIdQueryOptions,
} from "@/features/categories/queries";
import { m } from "@/paraglide/messages";

/**
 * 编辑页专用「按 id 取文章」查询：SSR 与客户端 SPA 导航都走带鉴权的
 * admin serverFn（findPostByIdFn），可加载草稿。
 *
 * 不能复用 postByIdQuery / postByIdPublicQuery：它们在客户端走公开 API
 * （/api/post/by-id/:id），公开接口对「未发布/草稿」返回 null（防泄露），
 * 导致后台 SPA 内切换文章时草稿被误判为「未找到文章」，刷新（重新 SSR）
 * 才正常。
 */
function adminPostByIdQuery(id: number) {
  return queryOptions({
    queryKey: POSTS_KEYS.detail(id),
    queryFn: async () => {
      const res = await findPostByIdFn({ data: { id } });
      if (!res) return null;
      // findPostById 不返回 toc，这里补齐成 PostWithToc，保证编辑页目录正常
      return {
        ...PostWithTocSchema.parse({
          ...res,
          toc: generateTableOfContents(res.contentJson),
        }),
        isSynced: res.isSynced,
        hasPublicCache: res.hasPublicCache,
      } as PostWithToc & { isSynced: boolean; hasPublicCache: boolean };
    },
  });
}

export const Route = createFileRoute("/admin/posts/edit/$id")({
  ssr: "data-only",
  component: EditPost,
  pendingComponent: PostEditorSkeleton,
  loader: async ({ context, params }) => {
    const postId = Number(params.id);

    // 首次查询走 admin serverFn（可加载草稿）；查询为 null 时清缓存重试
    let post = await context.queryClient.ensureQueryData(adminPostByIdQuery(postId));
    if (!post) {
      for (let i = 0; i < 3 && !post; i++) {
        context.queryClient.removeQueries({
          queryKey: POSTS_KEYS.detail(postId),
        });
        await new Promise((r) => setTimeout(r, 100));
        try {
          post = await context.queryClient.fetchQuery(
            adminPostByIdQuery(postId),
          );
        } catch {
          // 继续重试
        }
      }
    }

    await Promise.all([
      context.queryClient.ensureQueryData(tagsByPostIdQueryOptions(postId)),
      context.queryClient.ensureQueryData(categoriesByPostIdQueryOptions(postId)),
      // Prefetch all tags for the selector
      context.queryClient.prefetchQuery(tagsAdminQueryOptions()),
      // Prefetch all categories for the selector
      context.queryClient.prefetchQuery(categoriesAdminQueryOptions()),
    ]);
    return { title: post?.title };
  },
  head: ({ loaderData }) => ({
    meta: [
      {
        title: loaderData?.title,
      },
    ],
  }),
});

function EditPost() {
  const { id } = Route.useParams();
  const postId = Number(id);
  const queryClient = useQueryClient();

  // Use useQuery instead of useSuspenseQuery to prevent flickering on background refetches
  // Since loader ensures data is in cache, these will have initial data immediately.
  const { data: post } = useQuery(adminPostByIdQuery(postId));
  const { data: tags } = useQuery(tagsByPostIdQueryOptions(postId));
  const { data: categories } = useQuery(categoriesByPostIdQueryOptions(postId));

  if (!post || !tags || !categories) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="text-center space-y-4">
          <h2 className="text-4xl font-serif font-medium">
            {m.admin_post_edit_not_found_title()}
          </h2>
          <p className="text-zinc-400 font-light text-sm">
            {m.admin_post_edit_not_found_desc({ id: String(postId) })}
          </p>
        </div>
      </div>
    );
  }

  const initialData = {
    id: post.id,
    title: post.title,
    summary: post.summary ?? "",
    slug: post.slug,
    status: post.status,
    readTimeInMinutes: post.readTimeInMinutes,
    contentJson: post.contentJson,
    publishedAt: post.publishedAt,
    tagIds: tags.map((t) => t.id),
    categoryIds: categories.map((c) => c.id),
    pinnedAt: post.pinnedAt,
    isTested: post.isTested ?? null,
    freeResourceEnabled: post.freeResourceEnabled ?? 1,
    coverImage: post.coverImage ?? null,
    isSynced: post.isSynced,
    hasPublicCache: post.hasPublicCache,
  };

  const handleSave = async (data: PostEditorData) => {
    const publishedAt =
      data.status === "published" && !post.publishedAt
        ? new Date()
        : data.publishedAt;

    // Parallelize updates
    const [updateResult] = await Promise.all([
      adminUpdatePostFn({
        data: {
          id: post.id,
          data: {
            ...data,
            publishedAt,
          },
        },
      }),
      setPostTagsFn({
        data: {
          postId: post.id,
          tagIds: data.tagIds,
        },
      }),
      setPostCategoriesFn({
        data: {
          postId: post.id,
          categoryIds: data.categoryIds,
        },
      }),
    ]);

    if (updateResult.error) {
      throw new Error(m.admin_post_edit_error_not_found());
    }

    // Invalidate cache to ensure fresh data on next visit
    queryClient.invalidateQueries({ queryKey: POSTS_KEYS.detail(postId) });
    // Invalidate lists and counts, but keep other details cached
    queryClient.invalidateQueries({ queryKey: POSTS_KEYS.lists });
    queryClient.invalidateQueries({ queryKey: POSTS_KEYS.adminLists });
    queryClient.invalidateQueries({ queryKey: POSTS_KEYS.counts });

    queryClient.invalidateQueries({ queryKey: TAGS_KEYS.postTags(postId) });
    queryClient.invalidateQueries({ queryKey: TAGS_KEYS.admin });
    queryClient.invalidateQueries({
      queryKey: CATEGORIES_KEYS.postCategories(postId),
    });
    queryClient.invalidateQueries({ queryKey: CATEGORIES_KEYS.admin });
    // Replaces predicate: matches ["media", "linked-keys", ...]
    queryClient.invalidateQueries({
      queryKey: MEDIA_KEYS.linked,
    });
  };

  return <PostEditor initialData={initialData} onSave={handleSave} />;
}
