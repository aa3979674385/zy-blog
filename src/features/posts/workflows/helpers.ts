import * as PostService from "@/features/posts/services/posts.service";
import * as SearchService from "@/features/search/service/search.service";
import { getDb } from "@/lib/db";
import type { PostRef } from "@/lib/post-url";

export async function fetchPost(env: Env, postId: number) {
  const db = getDb(env);
  return await PostService.findPostById({ db, env }, { id: postId });
}

/**
 * 发布/更新文章时的缓存失效。
 *
 * 设计变更：发文章**不再自动清缓存**。原因——批量发布（如一次发 10 张）时，
 * 每发一张都调 Cloudflare Purge API + 写 KV 版本号，既浪费 API 调用又消耗 KV
 * 写配额。改为由后台「一键清空缓存」按钮统一处理（invalidateSiteCache 同时
 * 清 CDN 层 + Worker 内层 Cache API + KV），发布完最后点一次即可。
 *
 * 因此本函数目前为空操作，仅保留签名以兼容调用方（post-process / scheduled-publish）。
 * 搜索索引同步不在此函数内，不受影响。
 */
export async function invalidatePostCaches(_env: Env, _post: PostRef) {
  // 故意留空：缓存失效交由后台 invalidateSiteCache 统一触发。
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
