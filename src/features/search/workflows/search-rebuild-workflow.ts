import { insert } from "@orama/orama";
import { and, asc, count, eq, inArray, lte } from "drizzle-orm";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";
import { convertToPlainText } from "@/features/posts/utils/content";
import { createMyDb } from "@/features/search/model/schema";
import {
  deleteTmpOramaDb,
  loadTmpOramaDb,
  persistOramaDb,
  saveTmpOramaDb,
  setRebuildStatus,
} from "@/features/search/model/store";
import { CONTENT_SLICE, SNIPPET_SLICE } from "@/features/search/search.constants";
import { getDb } from "@/lib/db";
import { purgeCDNCache, purgeInnerCache } from "@/lib/invalidate";
import {
  CategoriesTable,
  PostCategoriesTable,
  PostsTable,
} from "@/lib/db/schema";
import { postResource } from "@/lib/db/schema/post-resources.table";

/** 每批处理的文章数（控制在 30s CPU 预算内） */
const BATCH_SIZE = 200;
/** D1 inArray 单次参数上限 1000，留余量取 500 */
const IN_ARRAY_CHUNK = 500;

type Params = Record<string, never>;

/** 分批查询收费状态，避免 inArray 参数超 D1 上限 */
async function chunkedResourceQuery(
  db: ReturnType<typeof getDb>,
  ids: number[],
): Promise<Map<number, "free" | "member" | "paid">> {
  const result = new Map<number, "free" | "member" | "paid">();
  for (let i = 0; i < ids.length; i += IN_ARRAY_CHUNK) {
    const chunk = ids.slice(i, i + IN_ARRAY_CHUNK);
    const rows = await db
      .select({
        postId: postResource.postId,
        accessType: postResource.accessType,
      })
      .from(postResource)
      .where(inArray(postResource.postId, chunk));
    for (const r of rows) {
      result.set(r.postId, r.accessType as "free" | "member" | "paid");
    }
  }
  return result;
}

/** 分批查询分类信息，避免 inArray 参数超 D1 上限 */
async function chunkedCategoryQuery(
  db: ReturnType<typeof getDb>,
  ids: number[],
): Promise<{
  categoryByPostId: Map<number, string>;
  categoryIdByPostId: Map<number, number>;
}> {
  const categoryByPostId = new Map<number, string>();
  const categoryIdByPostId = new Map<number, number>();
  for (let i = 0; i < ids.length; i += IN_ARRAY_CHUNK) {
    const chunk = ids.slice(i, i + IN_ARRAY_CHUNK);
    const rows = await db
      .select({
        postId: PostCategoriesTable.postId,
        id: CategoriesTable.id,
        name: CategoriesTable.name,
      })
      .from(PostCategoriesTable)
      .innerJoin(
        CategoriesTable,
        eq(PostCategoriesTable.categoryId, CategoriesTable.id),
      )
      .where(inArray(PostCategoriesTable.postId, chunk));
    for (const r of rows) {
      // 取每篇文章的第一个分类
      if (!categoryByPostId.has(r.postId)) {
        categoryByPostId.set(r.postId, r.name);
        categoryIdByPostId.set(r.postId, r.id);
      }
    }
  }
  return { categoryByPostId, categoryIdByPostId };
}

export class SearchRebuildWorkflow extends WorkflowEntrypoint<Env, Params> {
  async run(_event: WorkflowEvent<Params>, step: WorkflowStep) {
    const start = Date.now();

    try {
      // ... 重建逻辑见下方
      return await this.runRebuild(step, start);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await setRebuildStatus(this.env, {
        status: "failed",
        total: 0,
        processed: 0,
        startTime: start,
        error: errorMsg,
      });
      throw err;
    }
  }

  private async runRebuild(step: WorkflowStep, start: number) {

    // Step 1: 统计已发布文章总数
    const total = await step.do("count posts", async () => {
      const db = getDb(this.env);
      const [row] = await db
        .select({ count: count() })
        .from(PostsTable)
        .where(
          and(
            eq(PostsTable.status, "published"),
            lte(PostsTable.publishedAt, new Date()),
          ),
        );
      const countResult = row?.count ?? 0;
      await setRebuildStatus(this.env, {
        status: "running",
        total: countResult,
        processed: 0,
        startTime: start,
        currentStep: `正在统计文章数量...`,
      });
      return countResult;
    });

    if (total === 0) {
      // 空库也要写入空索引，清除旧数据
      await step.do("persist empty index", async () => {
        const searchDb = await createMyDb();
        await persistOramaDb(this.env, searchDb, 0);
      });
      await setRebuildStatus(this.env, {
        status: "completed",
        total: 0,
        processed: 0,
        startTime: start,
        duration: Date.now() - start,
      });
      return { indexed: 0, duration: Date.now() - start };
    }

    const batchCount = Math.ceil(total / BATCH_SIZE);

    // Step 2: 初始化空索引，写入临时 KV
    await step.do("init index", async () => {
      const searchDb = await createMyDb();
      await saveTmpOramaDb(this.env, searchDb);
      await setRebuildStatus(this.env, {
        status: "running",
        total,
        processed: 0,
        startTime: start,
        currentStep: `正在初始化索引...`,
      });
    });

    // Step 3..N: 分批查询 + 插入
    for (let i = 0; i < batchCount; i++) {
      const offset = i * BATCH_SIZE;

      await step.do(
        `batch ${i + 1}/${batchCount}`,
        {
          retries: {
            limit: 3,
            delay: "5 seconds",
            backoff: "exponential",
          },
        },
        async () => {
          const db = getDb(this.env);

          // 从临时 KV 加载已有索引
          const searchDb = await loadTmpOramaDb(this.env);
          if (!searchDb) throw new Error("临时索引丢失，请重新触发重建");

          // 分页查询文章（按 id 排序保证稳定分页）
          const posts = await db.query.PostsTable.findMany({
            where: and(
              eq(PostsTable.status, "published"),
              lte(PostsTable.publishedAt, new Date()),
            ),
            with: {
              postTags: {
                with: {
                  tag: true,
                },
              },
            },
            limit: BATCH_SIZE,
            offset,
            orderBy: [asc(PostsTable.id)],
          });

          if (posts.length === 0) return { processed: offset };

          // 分批查询收费状态和分类（避免 inArray 超限）
          // 容错：如果 post_resource 表不存在或查询失败，使用默认值继续重建
          const ids = posts.map((p) => p.id);
          let accessByPostId = new Map<number, "free" | "member" | "paid">();
          let categoryByPostId = new Map<number, string>();
          let categoryIdByPostId = new Map<number, number>();
          try {
            accessByPostId = await chunkedResourceQuery(db, ids);
          } catch (err) {
            console.warn(
              `[search] chunkedResourceQuery failed, using defaults:`,
              err instanceof Error ? err.message : String(err),
            );
          }
          try {
            const catResult = await chunkedCategoryQuery(db, ids);
            categoryByPostId = catResult.categoryByPostId;
            categoryIdByPostId = catResult.categoryIdByPostId;
          } catch (err) {
            console.warn(
              `[search] chunkedCategoryQuery failed, using defaults:`,
              err instanceof Error ? err.message : String(err),
            );
          }

          // 逐条插入 Orama 索引
          for (const post of posts) {
            if (!post.title || !post.slug) continue;
            const plain = convertToPlainText(post.contentJson);
            const content =
              plain.length > CONTENT_SLICE
                ? plain.slice(0, CONTENT_SLICE)
                : plain;
            const summary =
              post.summary && post.summary.trim().length > 0
                ? post.summary
                : content.slice(0, SNIPPET_SLICE);
            const tags = post.postTags.map((pt) => pt.tag.name);

            await insert(searchDb, {
              id: post.id.toString(),
              title: post.title,
              slug: post.slug,
              tags,
              summary,
              cover: post.coverImage ?? "",
              accessType: accessByPostId.get(post.id) ?? "free",
              categoryId: categoryIdByPostId.get(post.id) ?? null,
              categoryName: categoryByPostId.get(post.id) ?? null,
              publishedAt: post.publishedAt ?? null,
              // biome-ignore lint/suspicious/noExplicitAny: Orama insert 接受动态文档字段
            } as any);
          }

          // 保存回临时 KV
          await saveTmpOramaDb(this.env, searchDb);

          // 更新进度
          const processed = Math.min(offset + posts.length, total);
          await setRebuildStatus(this.env, {
            status: "running",
            total,
            processed,
            startTime: start,
            currentStep: `正在处理第 ${i + 1}/${batchCount} 批 (${processed}/${total})`,
          });

          return { processed };
        },
      );
    }

    // Final Step: 持久化到正式 KV，清理临时数据，清除搜索缓存
    const result = await step.do("finalize", async () => {
      const searchDb = await loadTmpOramaDb(this.env);
      if (!searchDb) throw new Error("临时索引丢失，请重新触发重建");

      await persistOramaDb(this.env, searchDb, total);
      await deleteTmpOramaDb(this.env);

      await setRebuildStatus(this.env, {
        status: "running",
        total,
        processed: total,
        startTime: start,
        currentStep: `正在清除搜索缓存...`,
      });

      // 清除搜索 API 的 CDN 缓存和 Worker 内层缓存，
      // 否则重建后访客仍命中旧缓存拿到空结果（搜索 API 设了 immutable 头）
      try {
        await purgeCDNCache(this.env, {
          prefixes: ["/api/search", "/search"],
        });
        await purgeInnerCache(this.env, []);
      } catch (err) {
        console.warn(
          `[search] cache purge after rebuild failed:`,
          err instanceof Error ? err.message : String(err),
        );
      }

      const duration = Date.now() - start;
      await setRebuildStatus(this.env, {
        status: "completed",
        total,
        processed: total,
        startTime: start,
        duration,
        currentStep: `重建完成`,
      });

      console.log(
        `[search] Rebuild completed: ${total} posts in ${duration}ms`,
      );
      return { indexed: total, duration };
    });

    return result;
  }
}
