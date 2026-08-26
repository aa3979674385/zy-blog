import type { ScheduledEvent } from "cloudflare:workers";
import { deleteExpiredVerificationCodes } from "@/features/email/data/email.data";
import { unbanExpiredUsers } from "@/features/users/data/users.data";
import { getDb } from "@/lib/db";

/**
 * Cron 定时任务入口：
 * - 每天执行一次「过期封禁清理」：把 banExpires 已到的账号真正解封（banned=false）。
 *   与用户侧惰性解封（getBanInfoByUser 顺手写库）形成双保险，保证 DB 状态不再长期挂着封禁。
 * - 每天执行一次「过期验证码清理」：删除 email_verification_codes 中 expiresAt <= now 的记录。
 */
export async function handleScheduled(
  _event: ScheduledEvent,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  const db = getDb(env);

  // 1. 清理过期封禁
  const unbannedCount = await unbanExpiredUsers(db);
  console.log(
    JSON.stringify({
      type: "scheduled.unban-expired",
      unbannedCount,
      at: new Date().toISOString(),
    }),
  );

  // 2. 清理过期验证码（只删已过期的，保留未过期的）
  const deletedCodes = await deleteExpiredVerificationCodes(db);
  console.log(
    JSON.stringify({
      type: "scheduled.cleanup-verification-codes",
      deletedCodes,
      at: new Date().toISOString(),
    }),
  );
}
