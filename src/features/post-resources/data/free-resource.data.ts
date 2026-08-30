import { and, eq } from "drizzle-orm";
import { resolveSystemConfig } from "@/features/config/service/config.service";
import { getSystemConfig as getSystemConfigRaw } from "@/features/config/data/config.data";
import { DEFAULT_CONFIG } from "@/features/config/config.schema";
import type { DB } from "@/lib/db";
import {
  freeResourceQuota,
  freeResourceToken,
  postResource,
  PostsTable,
} from "@/lib/db/schema";
import type { ResourceLink } from "@/lib/db/schema/post-resources.table";

/** 从 D1 读取系统配置并应用默认值（不走缓存层，适配 Hono 路由 / 数据层场景） */
async function getConfig(db: DB) {
  const raw = await getSystemConfigRaw(db);
  return resolveSystemConfig(raw);
}

/* ======================= 每日配额 ======================= */

/** 获取当前自然日日期字符串（YYYY-MM-DD，按服务器本地时区） */
export function getTodayDate(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 查询用户今日已使用的免费获取次数 + 上限。
 * 返回 { used, limit, remaining }。
 */
export async function getFreeQuota(
  db: DB,
  userId: string,
): Promise<{ used: number; limit: number; remaining: number }> {
  const cfg = await getConfig(db);
  const limit = cfg.freeResource?.dailyLimit ?? DEFAULT_CONFIG.freeResource!.dailyLimit!;
  const today = getTodayDate();

  const row = await db
    .select()
    .from(freeResourceQuota)
    .where(
      and(
        eq(freeResourceQuota.userId, userId),
        eq(freeResourceQuota.date, today),
      ),
    )
    .limit(1);

  const used = row[0]?.used ?? 0;
  return {
    used,
    limit,
    remaining: limit === 0 ? 0 : Math.max(0, limit - used),
  };
}

/**
 * 扣减一次免费获取配额（原子操作）。
 * 使用 INSERT ON CONFLICT DO UPDATE 实现原子自增。
 * 如果超限则抛错。
 */
export async function consumeFreeQuota(
  db: DB,
  userId: string,
): Promise<void> {
  const cfg = await getConfig(db);
  const limit = cfg.freeResource?.dailyLimit ?? DEFAULT_CONFIG.freeResource!.dailyLimit!;
  const today = getTodayDate();

  // 先查当前已用次数
  const row = await db
    .select()
    .from(freeResourceQuota)
    .where(
      and(
        eq(freeResourceQuota.userId, userId),
        eq(freeResourceQuota.date, today),
      ),
    )
    .limit(1);

  const used = row[0]?.used ?? 0;
  if (limit > 0 && used >= limit) {
    throw new Error("今日免费获取次数已耗尽，明日再试");
  }

  // 原子自增：已存在则 used+1，不存在则插入 used=1
  if (row[0]) {
    await db
      .update(freeResourceQuota)
      .set({ used: used + 1 })
      .where(eq(freeResourceQuota.id, row[0].id));
  } else {
    await db.insert(freeResourceQuota).values({
      id: crypto.randomUUID(),
      userId,
      date: today,
      used: 1,
    });
  }
}

/* ======================= 中转 Token ======================= */

/** Token 过期时间：30 分钟 */
export const FREE_TOKEN_TTL_MS = 30 * 60 * 1000;

/**
 * 为一条网盘链接生成中转 token 并存入 D1。
 * 返回 token 字符串。前端用此 token 构造 /api/free-dl/{token} URL。
 */
export async function createFreeToken(
  db: DB,
  userId: string,
  resourceId: string,
  linkIdx: number,
): Promise<string> {
  const token = crypto.randomUUID();
  const now = Date.now();
  await db.insert(freeResourceToken).values({
    token,
    userId,
    resourceId,
    linkIdx,
    expiresAt: now + FREE_TOKEN_TTL_MS,
  });
  return token;
}

/**
 * 验证中转 token 并返回关联的资源信息。
 * 如果 token 不存在或已过期，返回 null。
 */
export async function validateFreeToken(
  db: DB,
  token: string,
): Promise<{
  userId: string;
  resourceId: string;
  linkIdx: number;
  resource: typeof postResource.$inferSelect | null;
  link: ResourceLink | null;
} | null> {
  const row = await db
    .select()
    .from(freeResourceToken)
    .where(eq(freeResourceToken.token, token))
    .limit(1);

  if (!row[0]) return null;
  if (Date.now() > row[0].expiresAt) return null;

  const resource = await db
    .select()
    .from(postResource)
    .where(eq(postResource.id, row[0].resourceId))
    .limit(1);

  const r = resource[0];
  if (!r) return null;

  const links = r.links;
  if (!Array.isArray(links) || row[0].linkIdx >= links.length) return null;

  return {
    userId: row[0].userId,
    resourceId: row[0].resourceId,
    linkIdx: row[0].linkIdx,
    resource: r,
    link: links[row[0].linkIdx],
  };
}

/* ======================= 文章开关 ======================= */

/**
 * 检查文章是否开启了免费资源获取。
 * - 全局总开关关闭 → 返回 false
 * - 文章级字段为 null 或 1 → 视为开启
 * - 文章级字段为 0 → 关闭
 */
export async function isFreeResourceEnabledForPost(
  db: DB,
  postId: number,
): Promise<boolean> {
  // 1. 检查全局总开关
  const cfg = await getConfig(db);
  const globalEnabled = cfg.freeResource?.enabled ?? DEFAULT_CONFIG.freeResource!.enabled!;
  if (!globalEnabled) return false;

  // 2. 检查文章级开关
  const post = await db
    .select({ freeResourceEnabled: PostsTable.freeResourceEnabled })
    .from(PostsTable)
    .where(eq(PostsTable.id, postId))
    .limit(1);

  if (!post[0]) return false;
  // null 或 1 = 开启，0 = 关闭
  return post[0].freeResourceEnabled !== 0;
}

/**
 * 检查文章是否有付费资源（免费获取只对有付费/会员资源的文章有意义）。
 */
export async function hasPaidResources(
  db: DB,
  postId: number,
): Promise<boolean> {
  const resources = await db
    .select()
    .from(postResource)
    .where(eq(postResource.postId, postId));
  return resources.some((r) => r.accessType === "paid" || r.accessType === "member");
}
