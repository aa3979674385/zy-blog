-- 文章级免费资源获取开关：1=开启（默认），0=关闭
-- 历史文章无此字段，应用层默认视为 1（开启）
ALTER TABLE "posts" ADD COLUMN "free_resource_enabled" integer DEFAULT 1;

-- 免费获取每日配额表：记录每个用户每天通过「免费获取」按钮消耗的次数
CREATE TABLE "free_resource_quota" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "date" text NOT NULL,
  "used" integer DEFAULT 0 NOT NULL,
  "created_at" integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL,
  UNIQUE("user_id", "date")
);
CREATE INDEX "free_resource_quota_user_date_idx" ON "free_resource_quota" ("user_id", "date");

-- 免费获取中转 token 表：用户点击免费获取后生成一次性 token，
-- 前端拿不到真实网盘 URL，只能拿到 token；
-- PC 端用 token 生成二维码（二维码内容是 /api/free-dl/{token}），
-- 手机端用 token 作为下载按钮 href。
-- token 有过期时间（30 分钟），过期后不可用。
CREATE TABLE "free_resource_token" (
  "token" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "resource_id" text NOT NULL,
  "link_idx" integer NOT NULL,
  "expires_at" integer NOT NULL,
  "created_at" integer DEFAULT (cast(unixepoch('subsecond') * 1000 as integer)) NOT NULL
);
CREATE INDEX "free_resource_token_user_idx" ON "free_resource_token" ("user_id");
CREATE INDEX "free_resource_token_expires_idx" ON "free_resource_token" ("expires_at");
