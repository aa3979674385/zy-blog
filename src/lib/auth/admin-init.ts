/**
 * 管理员账号自动初始化模块。
 *
 * 核心原则：ADMIN_PASSWORD 仅用于首次创建，创建后不再覆盖。
 *
 * 工作流程：
 * 1. KV `admin:initialized` = "true" → 直接返回（零 DB 开销，二次部署不走后续逻辑）
 * 2. KV 标记不存在 → 查 D1 user 表确认管理员是否存在
 *    - 不存在 → 创建 user + account（用 ADMIN_PASSWORD 生成 argon2 哈希）
 *    - 已存在 → 不碰密码，只补上 KV 标记（管理员在后台改过的密码不受影响）
 * 3. 写入 KV 标记，后续请求直接走第一层快速路径
 *
 * 兜底机制：ADMIN_EMAIL / ADMIN_PASSWORD 未配置时自动使用默认值，
 * 部署后仍可登录管理后台修改密码，不会因遗漏配置而导致无法进入。
 *
 * 重置管理员密码（忘记密码时）：
 *   1. 在 Cloudflare Dashboard 删除 KV 键 `admin:initialized`
 *   2. 在 D1 中删除该管理员用户行（或其 account 行的 password 字段）
 *   3. 重新部署 → 系统以 ADMIN_PASSWORD 环境变量重新创建管理员
 */
import { eq } from "drizzle-orm";
import { account, user } from "@/lib/db/schema/auth.table";
import { getPasswordHasher } from "@/lib/auth/utils";
import { serverEnv } from "@/lib/env/server.env";

const KV_INITIALIZED = "admin:initialized";

/** 默认凭据（与环境变量 schema 的 catch 值保持一致） */
const DEFAULT_ADMIN_EMAIL = "admin@example.com";
const DEFAULT_ADMIN_PASSWORD = "admin123456";

export async function ensureAdminUser(
  db: DB,
  env: Env,
): Promise<void> {
  const { ADMIN_EMAIL, ADMIN_PASSWORD } = serverEnv(env);

  // 使用默认凭据时在控制台醒目告警，提醒尽快修改
  const usingDefaults =
    ADMIN_EMAIL === DEFAULT_ADMIN_EMAIL &&
    ADMIN_PASSWORD === DEFAULT_ADMIN_PASSWORD;
  if (usingDefaults) {
    console.warn(
      "[ADMIN INIT] Using default credentials (admin@example.com / admin123456). " +
        "Please set ADMIN_EMAIL and ADMIN_PASSWORD via `wrangler secret put` and change the password in admin panel after login.",
    );
  }

  // ---- 第一层：KV 快速路径 ----
  // KV 标记存在 = 已初始化过，直接返回，不查库、不碰密码
  const initialized = await env.KV.get(KV_INITIALIZED);
  if (initialized === "true") return;

  // ---- 第二层：D1 查询 ----
  const existing = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.email, ADMIN_EMAIL))
    .limit(1);

  if (existing.length === 0) {
    // ---- 首次创建管理员 ----
    const hasher = getPasswordHasher(env);
    const hashedPw = await hasher.hash(ADMIN_PASSWORD);
    const userId = crypto.randomUUID();
    const now = new Date();
    await db.insert(user).values({
      id: userId,
      name: "Admin",
      email: ADMIN_EMAIL,
      emailVerified: true,
      role: "admin",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: ADMIN_EMAIL,
      providerId: "credential",
      userId,
      password: hashedPw,
      createdAt: now,
      updatedAt: now,
    });
  }
  // 管理员已存在 → 不碰密码，不碰用户数据
  // 管理员在后台修改的密码、权限、资料等全部保留

  // ---- 第三层：写入 KV 标记 ----
  // 之后所有请求都走第一层快速路径，零 DB 开销
  await env.KV.put(KV_INITIALIZED, "true");
}
