import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { createdAt } from "./helper";

/**
 * 免费获取每日配额：记录每个用户每天通过「免费获取」按钮消耗的次数。
 * 按自然日（date = YYYY-MM-DD）统计，次日 0 点重置。
 */
export const freeResourceQuota = sqliteTable(
  "free_resource_quota",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    date: text("date").notNull(),
    used: integer("used").notNull().default(0),
    createdAt: createdAt,
  },
  (table) => [
    uniqueIndex("free_resource_quota_user_date_idx").on(table.userId, table.date),
  ],
);

/**
 * 免费获取中转 token：用户点击「免费获取」后，服务端生成 token 并存入此表。
 * 前端拿不到真实网盘 URL，只拿到 token。
 * - PC 端：用 /api/free-dl/{token} 生成二维码，用户扫码后访问中转路由 302 跳转。
 * - 手机端：用 /api/free-dl/{token} 作为下载按钮 href，点击后 302 跳转。
 * token 有过期时间（30 分钟），过期后中转路由返回 410 Gone。
 */
export const freeResourceToken = sqliteTable(
  "free_resource_token",
  {
    token: text("token").primaryKey(),
    userId: text("user_id").notNull(),
    resourceId: text("resource_id").notNull(),
    linkIdx: integer("link_idx").notNull(),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(cast(unixepoch('subsecond') * 1000 as integer))`),
  },
  (table) => [
    index("free_resource_token_user_idx").on(table.userId),
    index("free_resource_token_expires_idx").on(table.expiresAt),
  ],
);

export type FreeResourceQuota = typeof freeResourceQuota.$inferSelect;
export type FreeResourceToken = typeof freeResourceToken.$inferSelect;
