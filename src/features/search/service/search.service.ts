import { insert, search as oramaSearch, remove } from "@orama/orama";
import { and, asc, count, eq, inArray, lte } from "drizzle-orm";
import { convertToPlainText } from "@/features/posts/utils/content";
import { createMyDb, type MyOramaDB } from "@/features/search/model/schema";
import {
  getOramaDb,
  getOramaMeta,
  persistOramaDb,
} from "@/features/search/model/store";
import {
  CONTENT_SLICE,
  SNIPPET_SLICE,
} from "@/features/search/search.constants";
import type {
  DeleteSearchDocInput,
  SearchQueryInput,
  UpsertSearchDocInput,
} from "@/features/search/search.schema";
import { buildSnippet } from "@/features/search/utils/search.utils";
import { getDb } from "@/lib/db";
import {
  CategoriesTable,
  PostCategoriesTable,
  PostsTable,
} from "@/lib/db/schema";
import { postResource } from "@/lib/db/schema/post-resources.table";

type SearchMetaDb = Awaited<ReturnType<typeof getDb>>;

/** 读取搜索卡片所需的元信息：收费状态 / 分类名 / 发布时间（均不进分词索引） */
async function fetchPostSearchMeta(db: SearchMetaDb, postId: number) {
  const [resource] = await db
    .select({ accessType: postResource.accessType })
    .from(postResource)
    .where(eq(postResource.postId, postId))
    .limit(1);

  const catRows = await db
    .select({
      id: CategoriesTable.id,
      name: CategoriesTable.name,
    })
    .from(PostCategoriesTable)
    .innerJoin(
      CategoriesTable,
      eq(PostCategoriesTable.categoryId, CategoriesTable.id),
    )
    .where(eq(PostCategoriesTable.postId, postId))
    .limit(1);

  const [postRow] = await db
    .select({ publishedAt: PostsTable.publishedAt })
    .from(PostsTable)
    .where(eq(PostsTable.id, postId))
    .limit(1);

  return {
    accessType: (resource?.accessType ?? "free") as "free" | "member" | "paid",
    categoryId: (catRows[0]?.id ?? null) as number | null,
    categoryName: (catRows[0]?.name ?? null) as string | null,
    publishedAt: postRow?.publishedAt ?? null,
  };
}

export async function search(
  context: DbContext,
  data: SearchQueryInput,
  waitUntil?: (p: Promise<unknown>) => void,
) {
  const db = await getOramaDb(context.env, waitUntil);
  const query = data.q.toLowerCase();
  const page = Math.max(1, data.page);
  const limit = Math.min(data.limit, 50);
  const offset = (page - 1) * limit;

  // 全量线性扫描所有文档标题，做子串匹配。
  // 不依赖 Orama 的 BM25 相关性排序——BM25 会把标题长、匹配字占比低的文档排到后面，
  // 导致单字搜索时（如「黑」）低相关性文档被 limit 截断而漏召回。
  // 3000 篇文章的标题扫描在内存中是微秒级，性能无忧。
  // Orama v3 内部结构：db.data.docs.docs 是实际文档存储（Record<internalId, Document>）
  const allDocs = (
    db as unknown as {
      data?: {
        docs?: { docs?: Record<string, Record<string, unknown>> };
      };
    }
  ).data?.docs?.docs;

  let matched: Array<{
    id: string;
    slug: string;
    title: string;
    summary: string;
    tags: string[];
    cover: string | null;
    accessType: "free" | "member" | "paid" | null;
    categoryName: string | null;
    categoryId: number | null;
    publishedAt: string | Date | null;
    score: number;
  }>;

  if (allDocs) {
    matched = Object.values(allDocs)
      .filter((doc) =>
        String(doc?.title ?? "").toLowerCase().includes(query),
      )
      .map((doc) => ({
        id: String(doc.id ?? ""),
        slug: String(doc.slug ?? ""),
        title: String(doc.title ?? ""),
        summary: String(doc.summary ?? ""),
        tags: (doc.tags as string[]) ?? [],
        cover: (doc.cover as string) ?? null,
        accessType:
          (doc.accessType as "free" | "member" | "paid" | null) ?? null,
        categoryName: (doc.categoryName as string | null) ?? null,
        categoryId: (doc.categoryId as number | null) ?? null,
        publishedAt:
          (doc.publishedAt as string | Date | null) ?? null,
        score: 1,
      }))
      // 排序：按发布时间降序（最新优先），无发布时间的排到最后
      .sort((a, b) => {
        const tsA = a.publishedAt
          ? new Date(a.publishedAt).getTime()
          : 0;
        const tsB = b.publishedAt
          ? new Date(b.publishedAt).getTime()
          : 0;
        return tsB - tsA;
      });
  } else {
    // 降级：无法直接访问文档内部结构时，回退到 Orama 搜索
    const result = await oramaSearch(db, {
      term: data.q,
      properties: ["title"],
      limit: 200,
    });
    matched = result.hits
      .filter((hit) =>
        String(hit.document.title ?? "").toLowerCase().includes(query),
      )
      .map((hit) => {
        const doc = hit.document as Record<string, unknown>;
        return {
          id: String(doc.id ?? ""),
          slug: String(doc.slug ?? ""),
          title: String(doc.title ?? ""),
          summary: String(doc.summary ?? ""),
          tags: (doc.tags as string[]) ?? [],
          cover: (doc.cover as string) ?? null,
          accessType:
            (doc.accessType as "free" | "member" | "paid" | null) ?? null,
          categoryName: (doc.categoryName as string | null) ?? null,
          categoryId: (doc.categoryId as number | null) ?? null,
          publishedAt:
            (doc.publishedAt as string | Date | null) ?? null,
          score: hit.score,
        };
      })
      .sort((a, b) => {
        const tsA = a.publishedAt
          ? new Date(a.publishedAt).getTime()
          : 0;
        const tsB = b.publishedAt
          ? new Date(b.publishedAt).getTime()
          : 0;
        return tsB - tsA;
      });
  }

  const total = matched.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));

  const paged = matched.slice(offset, offset + limit).map((doc) => {
    const titleHighlight = buildSnippet({
      text: doc.title,
      terms: [],
      fallbackTerm: data.q,
    });
    const summaryHighlight = buildSnippet({
      text: doc.summary,
      terms: [],
      fallbackTerm: data.q,
    });

    return {
      post: {
        id: doc.id,
        slug: doc.slug,
        title: doc.title,
        summary: doc.summary,
        tags: doc.tags,
        cover: doc.cover,
        accessType: doc.accessType,
        categoryName: doc.categoryName,
        categoryId: doc.categoryId,
        publishedAt: doc.publishedAt,
      },
      score: doc.score,
      matches: {
        title: titleHighlight,
        summary: summaryHighlight,
      },
    };
  });

  return { results: paged, total, page, totalPages };
}

export async function upsert(
  context: { env: Env },
  data: UpsertSearchDocInput,
) {
  const db = await getOramaDb(context.env);

  try {
    await remove(db, data.id.toString());
  } catch {}

  const plain = convertToPlainText(data.contentJson ?? null);
  const content =
    plain.length > CONTENT_SLICE ? plain.slice(0, CONTENT_SLICE) : plain;
  const summary =
    data.summary && data.summary.trim().length > 0
      ? data.summary
      : content.slice(0, SNIPPET_SLICE);

  // 收费状态 / 分类 / 发布时间：优先用入参，缺失时回源查询（保证卡片信息准确）
  let meta: Awaited<ReturnType<typeof fetchPostSearchMeta>>;
  if (
    data.accessType !== undefined &&
    data.categoryName !== undefined &&
    data.categoryId !== undefined &&
    data.publishedAt !== undefined
  ) {
    meta = {
      accessType: (data.accessType ?? "free") as "free" | "member" | "paid",
      categoryId: data.categoryId ?? null,
      categoryName: data.categoryName ?? null,
      publishedAt: (data.publishedAt as Date | null) ?? null,
    };
  } else {
    meta = await fetchPostSearchMeta(getDb(context.env), data.id);
  }

  await insert(db, {
    id: data.id.toString(),
    slug: data.slug,
    title: data.title,
    summary,
    tags: data.tags ?? [],
    // 以下均为仅存储、不进分词索引的字段
    cover: data.coverImage ?? "",
    accessType: meta.accessType,
    categoryId: meta.categoryId,
    categoryName: meta.categoryName,
    publishedAt: meta.publishedAt,
    // biome-ignore lint/suspicious/noExplicitAny: Orama insert 接受动态文档字段，需绕过严格类型
  } as any);

  await persistOramaDb(context.env, db);
  return { id: data.id };
}

export async function deleteIndex(
  context: { env: Env },
  data: DeleteSearchDocInput,
) {
  const db = await getOramaDb(context.env);
  await remove(db, data.id.toString());
  await persistOramaDb(context.env, db);
  return { id: data.id };
}

/** D1 inArray 单次参数上限 1000，留余量取 500 */
const IN_ARRAY_CHUNK = 500;

/** 分批查询收费状态，避免 inArray 参数超 D1 上限 */
async function chunkedResourceQuery(
  db: SearchMetaDb,
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
  db: SearchMetaDb,
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
      if (!categoryByPostId.has(r.postId)) {
        categoryByPostId.set(r.postId, r.name);
        categoryIdByPostId.set(r.postId, r.id);
      }
    }
  }
  return { categoryByPostId, categoryIdByPostId };
}

export async function rebuildIndex(context: DbContext, targetDb?: MyOramaDB) {
  const { env, db } = context;
  const start = Date.now();
  console.log("[search] Start backfilling index...");

  const searchDb = targetDb ?? (await createMyDb());

  // 统计已发布文章总数
  const [countRow] = await db
    .select({ count: count() })
    .from(PostsTable)
    .where(
      and(
        eq(PostsTable.status, "published"),
        lte(PostsTable.publishedAt, new Date()),
      ),
    );
  const total = countRow?.count ?? 0;

  if (total === 0) {
    await persistOramaDb(env, searchDb, 0);
    return { indexed: 0, duration: Date.now() - start };
  }

  // 分批查询 + 插入（每批 200 篇，控制内存和 CPU）
  const BATCH_SIZE = 200;
  const batchCount = Math.ceil(total / BATCH_SIZE);
  let indexed = 0;

  for (let i = 0; i < batchCount; i++) {
    const offset = i * BATCH_SIZE;

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

    if (posts.length === 0) break;

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

    for (const post of posts) {
      if (!post.title || !post.slug) continue;
      const plain = convertToPlainText(post.contentJson);
      const content =
        plain.length > CONTENT_SLICE ? plain.slice(0, CONTENT_SLICE) : plain;
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
      indexed++;
    }
  }

  await persistOramaDb(env, searchDb, indexed);

  const duration = Date.now() - start;
  console.log(`[search] Indexed ${indexed} posts in ${duration}ms`);

  return { indexed, duration };
}

export async function getIndexVersion(context: DbContext) {
  return await getOramaMeta(context.env);
}
