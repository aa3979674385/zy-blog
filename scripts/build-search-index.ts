/**
 * 本地构建搜索索引脚本
 *
 * 从 Cloudflare D1 拉取所有已发布文章数据，在本地用 Orama 构建搜索索引，
 * gzip 压缩后通过 Cloudflare KV REST API 写回，替代线上 Workflow 重建。
 *
 * 用法:
 *   bun scripts/build-search-index.ts
 *
 * 环境变量（可选，不设则使用脚本内默认值）:
 *   CF_ACCOUNT_ID   - Cloudflare Account ID
 *   CF_D1_DATABASE  - D1 数据库 UUID
 *   CF_KV_NAMESPACE - KV 命名空间 ID
 *   CF_API_TOKEN    - Cloudflare API Token（需有 D1 读取 + KV 写入权限）
 */

import { create, insert, save } from "@orama/orama";
import type { Tokenizer } from "@orama/orama";
import { gzipSync } from "node:zlib";

// ==================== 配置 ====================

const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID;
const D1_DATABASE_ID = process.env.CF_D1_DATABASE;
const KV_NAMESPACE_ID = process.env.CF_KV_NAMESPACE;
const CF_API_TOKEN = process.env.CF_API_TOKEN;

if (!CF_ACCOUNT_ID || !D1_DATABASE_ID || !KV_NAMESPACE_ID || !CF_API_TOKEN) {
  console.error(
    "[build-search-index] Missing required environment variables.\n" +
    "Set the following before running:\n" +
    "  CF_ACCOUNT_ID   - Cloudflare Account ID\n" +
    "  CF_D1_DATABASE  - D1 database UUID\n" +
    "  CF_KV_NAMESPACE - KV namespace ID\n" +
    "  CF_API_TOKEN    - Cloudflare API token (D1 read + KV write)",
  );
  process.exit(1);
}

// KV 键名 —— 必须与 src/features/search/model/store.ts 完全一致
const KV_KEY = "search:index:v13";
const KV_META_KEY = "search:index:meta:v13";
const KV_REBUILD_STATUS_KEY = "search:index:rebuild:status";

// 常量 —— 必须与 src/features/search/search.constants.ts 一致
const CONTENT_SLICE = 10000;
const SNIPPET_SLICE = 200;
const BATCH_SIZE = 200;

// ==================== Orama Schema & Tokenizer ====================
// 必须与 src/features/search/model/schema.ts 完全一致

const searchSchema = {
  id: "string",
  slug: "string",
  title: "string",
} as const;

const chineseTokenizerConfig: Tokenizer = {
  language: "chinese",
  // 按「字符」切分：中文逐字、英文逐字母（转小写、去空白）
  tokenize: (text: string) => {
    return Array.from(text.toLowerCase()).filter((ch) => !/\s/.test(ch));
  },
  normalizationCache: new Map(),
};

// ==================== convertToPlainText ====================
// 复制自 src/features/posts/utils/content.ts，避免导入整个 Tiptap 依赖链

interface JSONContent {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown> & { alt?: string };
  content?: JSONContent[];
}

function convertToPlainText(doc: JSONContent | null): string {
  if (!doc) return "";
  const textParts: Array<string> = [];

  function traverse(node: JSONContent) {
    if (node.type === "text" && node.text) {
      textParts.push(node.text);
    } else if (node.type === "image" && node.attrs?.alt) {
      textParts.push(` ${node.attrs.alt} `);
    }

    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }

    const isBlock = [
      "paragraph",
      "heading",
      "codeBlock",
      "blockquote",
      "listItem",
      "bulletList",
      "orderedList",
    ].includes(node.type || "");

    if (isBlock) {
      textParts.push("\n");
    }
  }

  traverse(doc);
  return textParts.join("").replace(/\n+/g, "\n").trim();
}

// ==================== Cloudflare D1 REST API ====================

interface D1Row {
  [key: string]: unknown;
}

async function queryD1(sql: string, params: (string | number)[] = []): Promise<D1Row[]> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/d1/database/${D1_DATABASE_ID}/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`D1 API HTTP ${res.status}: ${text}`);
  }

  const data = await res.json() as {
    success: boolean;
    errors?: Array<{ code: number; message: string }>;
    result?: Array<{ results?: D1Row[] }>;
  };

  if (!data.success) {
    throw new Error(`D1 query failed: ${JSON.stringify(data.errors)}`);
  }

  return data.result?.[0]?.results ?? [];
}

// ==================== Cloudflare KV REST API ====================

async function putKV(key: string, value: BodyInit): Promise<void> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
    },
    body: value,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`KV PUT HTTP ${res.status} for key "${key}": ${text}`);
  }

  const data = await res.json() as { success: boolean; errors?: unknown };
  if (!data.success) {
    throw new Error(`KV PUT failed for key "${key}": ${JSON.stringify(data.errors)}`);
  }
}

// ==================== 主逻辑 ====================

async function main() {
  const start = Date.now();
  console.log("[build-search-index] Starting...");

  // 1. 统计已发布文章总数
  const countRows = await queryD1(
    `SELECT COUNT(*) as count FROM posts WHERE status = 'published' AND published_at <= unixepoch()`,
  );
  const total = (countRows[0]?.count as number) ?? 0;
  console.log(`[build-search-index] Total published posts: ${total}`);

  if (total === 0) {
    console.log("[build-search-index] No posts to index. Writing empty index...");

    // 即使没有文章也写一个空索引
    const emptyDb = await create({
      schema: searchSchema,
      components: { tokenizer: chineseTokenizerConfig },
    });
    const raw = save(emptyDb);
    const json = JSON.stringify(raw);
    const compressed = gzipSync(Buffer.from(json));

    await putKV(KV_KEY, compressed);
    const meta = {
      version: Date.now().toString(),
      updatedAt: new Date().toISOString(),
      sizeInBytes: compressed.length,
      count: 0,
    };
    await putKV(KV_META_KEY, JSON.stringify(meta));

    console.log("[build-search-index] Empty index written. Done.");
    return;
  }

  // 2. 创建 Orama DB
  const db = await create({
    schema: searchSchema,
    components: { tokenizer: chineseTokenizerConfig },
  });

  // 3. 分批查询 + 插入
  const batchCount = Math.ceil(total / BATCH_SIZE);
  let indexed = 0;

  for (let i = 0; i < batchCount; i++) {
    const offset = i * BATCH_SIZE;

    // 单条 SQL 用子查询关联 tags / access_type / category
    // D1 REST API 一次查询返回所有行，BATCH_SIZE 控制单次响应大小
    const posts = await queryD1(
      `SELECT
         p.id,
         p.title,
         p.slug,
         p.content_json,
         p.summary,
         p.cover_image,
         p.published_at,
         (SELECT group_concat(t.name, '\x01')
            FROM post_tags pt
            JOIN tags t ON pt.tag_id = t.id
           WHERE pt.post_id = p.id) AS tag_names,
         (SELECT pr.access_type
            FROM post_resource pr
           WHERE pr.post_id = p.id
           LIMIT 1) AS access_type,
         (SELECT c.id
            FROM post_categories pc
            JOIN categories c ON pc.category_id = c.id
           WHERE pc.post_id = p.id
           LIMIT 1) AS category_id,
         (SELECT c.name
            FROM post_categories pc
            JOIN categories c ON pc.category_id = c.id
           WHERE pc.post_id = p.id
           LIMIT 1) AS category_name
       FROM posts p
       WHERE p.status = 'published'
         AND p.published_at <= unixepoch()
       ORDER BY p.id ASC
       LIMIT ? OFFSET ?`,
      [BATCH_SIZE, offset],
    );

    if (posts.length === 0) break;

    for (const post of posts) {
      const title = post.title as string | null;
      const slug = post.slug as string | null;
      if (!title || !slug) continue;

      // 解析 content_json（D1 REST API 返回的是字符串）
      const rawContent = post.content_json;
      let contentJson: JSONContent | null = null;
      if (rawContent) {
        try {
          contentJson =
            typeof rawContent === "string"
              ? (JSON.parse(rawContent) as JSONContent)
              : (rawContent as JSONContent);
        } catch {
          contentJson = null;
        }
      }

      const plain = convertToPlainText(contentJson);
      const content =
        plain.length > CONTENT_SLICE ? plain.slice(0, CONTENT_SLICE) : plain;
      const summary =
        post.summary && String(post.summary).trim().length > 0
          ? String(post.summary)
          : content.slice(0, SNIPPET_SLICE);

      // tags 用 \x01 分隔（避免逗号冲突）
      const tagNames = (post.tag_names as string | null) ?? "";
      const tags = tagNames ? tagNames.split("\x01") : [];

      // published_at: D1 存储为 Unix 秒，转为 Date 对象（与 Workers 端 Drizzle 行为一致）
      const publishedAtRaw = post.published_at as number | null;
      const publishedAt = publishedAtRaw != null
        ? new Date(publishedAtRaw * 1000)
        : null;

      await insert(db, {
        id: String(post.id),
        title,
        slug,
        tags,
        summary,
        cover: (post.cover_image as string) ?? "",
        accessType: (post.access_type as string) ?? "free",
        categoryId: (post.category_id as number) ?? null,
        categoryName: (post.category_name as string) ?? null,
        publishedAt,
        // biome-ignore lint/suspicious/noExplicitAny: Orama insert 接受动态文档字段
      } as any);
      indexed++;
    }

    console.log(
      `[build-search-index] Batch ${i + 1}/${batchCount}: indexed ${indexed}/${total} posts`,
    );
  }

  // 4. Save + gzip 压缩
  console.log("[build-search-index] Saving and compressing index...");
  const raw = save(db);
  const json = JSON.stringify(raw);
  const compressed = gzipSync(Buffer.from(json));

  const sizeMB = (compressed.length / 1024 / 1024).toFixed(2);
  console.log(
    `[build-search-index] Index size: ${compressed.length} bytes (${sizeMB} MB)`,
  );

  // 5. 写入 KV: 索引数据
  console.log("[build-search-index] Writing index to KV...");
  await putKV(KV_KEY, compressed);

  // 6. 写入 KV: 元数据
  const newVersion = Date.now().toString();
  const meta = {
    version: newVersion,
    updatedAt: new Date().toISOString(),
    sizeInBytes: compressed.length,
    count: indexed,
  };
  await putKV(KV_META_KEY, JSON.stringify(meta));

  // 7. 写入 KV: 重建状态（让后台按钮显示 "completed"）
  const rebuildStatus = {
    status: "completed",
    total,
    processed: indexed,
    startTime: start,
    duration: Date.now() - start,
    currentStep: "Local build completed",
  };
  await putKV(KV_REBUILD_STATUS_KEY, JSON.stringify(rebuildStatus));

  const duration = Date.now() - start;
  console.log(
    `[build-search-index] Done! Indexed ${indexed} posts in ${duration}ms (${(duration / 1000).toFixed(1)}s)`,
  );
  console.log(`[build-search-index] Index version: ${newVersion}`);
  console.log(
    `[build-search-index] KV keys updated: ${KV_KEY}, ${KV_META_KEY}, ${KV_REBUILD_STATUS_KEY}`,
  );
}

main().catch((err) => {
  console.error("[build-search-index] Fatal error:", err);
  process.exit(1);
});
