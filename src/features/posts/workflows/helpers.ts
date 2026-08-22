import * as CacheService from "@/features/cache/cache.service";
import { CATEGORIES_CACHE_KEYS } from "@/features/categories/categories.schema";
import * as PostService from "@/features/posts/services/posts.service";
import * as SearchService from "@/features/search/service/search.service";
import { TAGS_CACHE_KEYS } from "@/features/tags/tags.schema";
import { getDb } from "@/lib/db";
import { purgePostCDNCache } from "@/lib/invalidate";
import type { PostRef } from "@/lib/post-url";

export async function fetchPost(env: Env, postId: number) {
  const db = getDb(env);
  return await PostService.findPostById({ db, env }, { id: postId });
}

export async function invalidatePostCaches(env: Env, post: PostRef) {
  // 详情页已不再写 KV（posts:detail 缓存废弃，由 CDN 兜底），
  // 发布/更新文章只作废列表缓存 + purge CDN，避免无谓的 KV 写/删配额消耗。
  await Promise.all([
    purgePostCDNCache(env, post),
    CacheService.bumpVersion({ env }, "posts:list"),
    CacheService.deleteKey({ env }, TAGS_CACHE_KEYS.publicList),
    CacheService.deleteKey({ env }, CATEGORIES_CACHE_KEYS.publicList),
  ]);
}

export async function upsertPostSearchIndex(
  env: Env,
  post: {
    id: number;
    slug: string;
    title: string;
    summary: string | null;
    contentJson: Parameters<typeof SearchService.upsert>[1]["contentJson"];
    tags: Array<{ name: string }>;
    coverImage?: string | null;
    categoryId?: number | null;
  },
) {
  await SearchService.upsert(
    { env },
    {
      id: post.id,
      slug: post.slug,
      title: post.title,
      summary: post.summary,
      contentJson: post.contentJson,
      tags: post.tags.map((t) => t.name),
      coverImage: post.coverImage ?? null,
      categoryId: post.categoryId ?? null,
    },
  );
}
