import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";
import * as CacheService from "@/features/cache/cache.service";
import {
  BACKUP_CACHE_KEYS,
  BACKUP_KEYS,
  type RestoreStartInput,
} from "@/features/backup/backup.schema";
import { truncateAllTables } from "@/features/backup/backup.service";

/**
 * 全量恢复：
 * 1) 读取 backup/<date>/data.json，清空并重建 D1 全部表
 * 2) 将 backup/<date>/files/ 下附件复制回原位置（去掉前缀）
 * ⚠️ 恢复会覆盖当前数据（清空重建），触发前需用户二次确认。
 */
export class RestoreWorkflow extends WorkflowEntrypoint<Env, RestoreStartInput> {
  async run(event: WorkflowEvent<RestoreStartInput>, step: WorkflowStep) {
    const { taskId, backupDate } = event.payload;
    const env = this.env;

    const progress = (patch: Partial<Record<string, unknown>>) =>
      CacheService.set(
        { env },
        BACKUP_CACHE_KEYS.restoreProgress(taskId),
        JSON.stringify({
          status: "processing",
          total: 0,
          completed: 0,
          current: "",
          errors: [],
          warnings: [],
          backupDate,
          ...patch,
        }),
        { ttl: "24h" },
      );

    const fail = (message: string) =>
      CacheService.set(
        { env },
        BACKUP_CACHE_KEYS.restoreProgress(taskId),
        JSON.stringify({
          status: "failed",
          total: 0,
          completed: 0,
          current: message,
          errors: [message],
          warnings: [],
          backupDate,
        }),
        { ttl: "24h" },
      );

    try {
      // 1) 恢复数据库
      await step.do("restore database tables", async (_ctx) => {
        await progress({ current: "正在恢复数据库…" });

        const dataObj = await env.R2.get(BACKUP_KEYS.data(backupDate));
        if (!dataObj) throw new Error(`备份数据不存在：${backupDate}`);

        const data = JSON.parse(await dataObj.text()) as {
          tables: Record<string, Array<Record<string, unknown>>>;
        };
        const db = env.DB;

        // 清空全部业务表
        await truncateAllTables(env);

        // 逐表重建
        for (const [table, rows] of Object.entries(data.tables)) {
          if (rows.length === 0) continue;
          const cols = Object.keys(rows[0]);
          const placeholders = cols.map(() => "?").join(", ");
          const sql = `INSERT INTO "${table}" (${cols
            .map((c) => `"${c}"`)
            .join(", ")}) VALUES (${placeholders})`;
          const stmt = db.prepare(sql);
          const batch: D1PreparedStatement[] = [];
          for (const row of rows) {
            batch.push(
              stmt.bind(...cols.map((c) => (row[c] ?? null) as never)),
            );
          }
          // D1 batch 上限 100 条/次，分批执行
          for (let i = 0; i < batch.length; i += 100) {
            const chunk = batch.slice(i, i + 100);
            if (chunk.length > 0) await db.batch(chunk);
          }
          await progress({
            current: `正在恢复表 ${table}（${rows.length} 行）…`,
            total: Object.keys(data.tables).length,
            completed: Object.keys(data.tables).length,
          });
        }
      });

      // 2) 恢复附件（复制回原位置）
      const fileCount = await step.do(
        "restore attachment files",
        {
          retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
        },
        async (_ctx) => {
          await progress({ current: "正在恢复附件文件…" });
          const prefix = BACKUP_KEYS.filesPrefix(backupDate);
          const keys: string[] = [];
          let cursor: string | undefined;
          do {
            const listed = await env.R2.list({ prefix, limit: 1000, cursor });
            for (const obj of listed.objects) keys.push(obj.key);
            cursor = listed.truncated ? listed.cursor : undefined;
          } while (cursor);

          for (let i = 0; i < keys.length; i++) {
            const backupKey = keys[i];
            const originalKey = backupKey.slice(prefix.length);
            const src = await env.R2.get(backupKey);
            if (!src) continue;
            await env.R2.put(originalKey, src.body, {
              httpMetadata: src.httpMetadata,
              customMetadata: src.customMetadata,
            });
            if ((i + 1) % 50 === 0 || i === keys.length - 1) {
              await progress({
                current: `正在恢复附件文件 ${i + 1}/${keys.length}…`,
                total: keys.length,
                completed: i + 1,
              });
            }
          }
          return keys.length;
        },
      );

      await progress({
        status: "completed",
        current: `恢复完成（${backupDate}，附件 ${fileCount} 个）`,
        total: fileCount,
        completed: fileCount,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ message: "restore failed", error: msg }));
      await fail(`恢复失败：${msg}`);
    }
  }
}
