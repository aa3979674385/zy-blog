/**
 * 管理员账号自动初始化模块。
 *
 * 核心原则：ADMIN_PASSWORD 仅用于首次创建，创建后不再覆盖。
 *
 * 工作流程：
 * 1. 模块级标记 `adminChecked` = true → 直接返回（同一 Worker 实例只查一次）
 * 2. 首次请求 → 用 `INSERT ... ON CONFLICT DO NOTHING` 原子插入管理员
 *    - 管理员不存在 → 创建 user + account（用 ADMIN_PASSWORD 生成 argon2 哈希）
 *    - 已存在 → 静默跳过，不碰密码
 * 3. 定时任务（每天凌晨 3 点）兜底检查一次
 *
 * 兜底机制：ADMIN_EMAIL / ADMIN_PASSWORD 未配置时自动使用默认值，
 * 部署后仍可登录管理后台修改密码，不会因遗漏配置而导致无法进入。
 *
 * 重置管理员密码（忘记密码时）：
 *   1. 在 D1 中删除该管理员用户行
 *   2. 重新部署 → 系统以 ADMIN_PASSWORD 环境变量重新创建管理员
 */
import { eq } from "drizzle-orm";
import { getPasswordHasher } from "@/lib/auth/utils";
import { account, user } from "@/lib/db/schema/auth.table";
import { serverEnv } from "@/lib/env/server.env";

const DEFAULT_ADMIN_EMAIL = "admin@example.com";
const DEFAULT_ADMIN_PASSWORD = "admin123456";

/**
 * 模块级标记：同一个 Worker 实例（isolate）只检查一次。
 * 部署/更新后新 isolate 启动时自动重置为 false，第一个请求触发检查。
 */
let adminChecked = false;

/** 重置标记，供定时任务调用后重新允许下次请求检查 */
export function resetAdminCheckFlag(): void {
  adminChecked = false;
}

export async function ensureAdminUser(db: DB, env: Env): Promise<void> {
  // 同一 isolate 内，后续请求直接跳过
  if (adminChecked) return;
  adminChecked = true;

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

  // ---- 原子插入：email 冲突时静默跳过，杜绝并发竞态 ----
  const userId = crypto.randomUUID();
  const now = new Date();
  await db
    .insert(user)
    .values({
      id: userId,
      name: "Admin",
      email: ADMIN_EMAIL,
      emailVerified: true,
      role: "admin",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: user.email });

  // ---- 查出实际用户 ID（可能是刚创建的，也可能是已存在的）----
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, ADMIN_EMAIL))
    .limit(1);

  if (existing.length === 0) {
    // 极端情况：插入失败且查不到，下次请求会重试（标记已在入口设为 true，
    // 但定时任务会 reset 后重试）
    console.error("[ADMIN INIT] Failed to create or find admin user.");
    return;
  }

  const actualUserId = existing[0].id;

  // ---- 检查 account 是否存在，不存在才创建（不碰已有密码）----
  const existingAccount = await db
    .select({ id: account.id })
    .from(account)
    .where(eq(account.userId, actualUserId))
    .limit(1);

  if (existingAccount.length === 0) {
    const hasher = getPasswordHasher(env);
    const hashedPw = await hasher.hash(ADMIN_PASSWORD);
    await db.insert(account).values({
      id: crypto.randomUUID(),
      accountId: ADMIN_EMAIL,
      providerId: "credential",
      userId: actualUserId,
      password: hashedPw,
      createdAt: now,
      updatedAt: now,
    });
  }
  // 管理员已存在且 account 已存在 → 不碰密码，不碰用户数据
  // 管理员在后台修改的密码、权限、资料等全部保留
}
