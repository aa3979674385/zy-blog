import type { ScheduledEvent } from "cloudflare:workers";
import { unbanExpiredUsers } from "@/features/users/data/users.data";
import { getDb } from "@/lib/db";

/**
 * Cron 定时任务入口：
 * - 每天执行一次「过期封禁清理」：把 banExpires 已到的账号真正解封（banned=false）。
 *   与用户侧惰性解封（getBanInfoByUser 顺手写库）形成双保险，保证 DB 状态不再长期挂着封禁。
 */
export async function handleScheduled(
  _event: ScheduledEvent,
  env: Env,
  _ctx: ExecutionContext,
): Promise<void> {
  const db = getDb(env);
  const count = await unbanExpiredUsers(db);
  console.log(
    JSON.stringify({
      type: "scheduled.unban-expired",
      unbannedCount: count,
      at: new Date().toISOString(),
    }),
  );
}
