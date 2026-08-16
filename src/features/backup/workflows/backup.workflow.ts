import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { WorkflowEntrypoint } from "cloudflare:workers";
import * as CacheService from "@/features/cache/cache.service";
import {
  BACKUP_CACHE_KEYS,
  BACKUP_KEYS,
  type BackupStartInput,
} from "@/features/backup/backup.schema";
import {
  exportAllTables,
  type BackupTablesData,
} from "@/features/backup/backup.service";

/** 备份日期目录（本地时区 YYYY-MM-DD-HHmmss） */
export function makeBackupDate(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

/**
 * 全量备份：
 * 1) D1 全部表导出为 JSON（data.json）
 * 2) R2 全部附件复制到 backup/<date>/files/（云端留存，不下载）
 * 3) 写 manifest.json
 */
export class BackupWorkflow extends WorkflowEntrypoint<Env, BackupStartInput> {
  async run(event: WorkflowEvent<BackupStartInput>, step: WorkflowStep) {
    const { taskId } = event.payload;
    const env = this.env;

    const progress = (patch: Partial<Record<string, unknown>>) =>
      CacheService.set(
        { env },
        BACKUP_CACHE_KEYS.backupProgress(taskId),
        JSON.stringify({
          status: "processing",
          total: 0,
          completed: 0,
          current: "",
          errors: [],
          warnings: [],
          ...patch,
        }),
        { ttl: "24h" },
      );

    const fail = (message: string) =>
      CacheService.set(
        { env },
        BACKUP_CACHE_KEYS.backupProgress(taskId),
        JSON.stringify({
          status: "failed",
          total: 0,
          completed: 0,
          current: message,
          errors: [message],
          warnings: [],
        }),
        { ttl: "24h" },
      );

    try {
      // 1) 导出数据库全表
      const dbData = (await step.do(
        "export database tables",
        async (_ctx) => {
          await progress({ current: "正在导出数据库全表…" });
          const data = await exportAllTables(env);
          const tableCounts: Record<string, number> = {};
          for (const [t, rows] of Object.entries(data.tables)) {
            tableCounts[t] = rows.length;
          }
          return { data, tableCounts };
        },
      )) as { data: BackupTablesData; tableCounts: Record<string, number> } | undefined;
      if (!dbData) throw new Error("导出数据库失败：无数据返回");

      const date = makeBackupDate();

      // 2) 存 data.json
      await step.do("store database json", async (_ctx) => {
        await progress({ current: "正在保存数据库数据…" });
        await env.R2.put(
          BACKUP_KEYS.data(date),
          JSON.stringify(dbData.data),
          { httpMetadata: { contentType: "application/json" } },
        );
      });

      // 3) 复制 R2 附件到备份目录（流式转发，不占内存）
      const fileStats = await step.do(
        "copy attachment files",
        {
          retries: { limit: 3, delay: "5 seconds", backoff: "exponential" },
        },
        async (_ctx) => {
          await progress({ current: "正在复制附件文件…" });
          const allKeys: string[] = [];
          let cursor: string | undefined;
          do {
            const listed = await env.R2.list({ limit: 1000, cursor });
            for (const obj of listed.objects) allKeys.push(obj.key);
            cursor = listed.truncated ? listed.cursor : undefined;
          } while (cursor);

          let totalBytes = 0;
          for (let i = 0; i < allKeys.length; i++) {
            const key = allKeys[i];
            const src = await env.R2.get(key);
            if (!src) continue;
            const destKey = `${BACKUP_KEYS.filesPrefix(date)}${key}`;
            await env.R2.put(destKey, src.body, {
              httpMetadata: src.httpMetadata,
              customMetadata: src.customMetadata,
            });
            totalBytes += src.size;
            if ((i + 1) % 50 === 0 || i === allKeys.length - 1) {
              await progress({
                current: `正在复制附件文件 ${i + 1}/${allKeys.length}…`,
                total: allKeys.length,
                completed: i + 1,
              });
            }
          }
          return { count: allKeys.length, totalBytes };
        },
      );

      // 4) 写 manifest
      await step.do("store manifest", async (_ctx) => {
        const manifest = {
          exportedAt: new Date().toISOString(),
          version: 1 as const,
          tables: dbData.tableCounts,
          files: fileStats,
          dataKey: BACKUP_KEYS.data(date),
          filesPrefix: BACKUP_KEYS.filesPrefix(date),
        };
        await env.R2.put(BACKUP_KEYS.manifest(date), JSON.stringify(manifest), {
          httpMetadata: { contentType: "application/json" },
        });
      });

      await progress({
        status: "completed",
        current: `备份完成（${date}）`,
        total: fileStats.count,
        completed: fileStats.count,
        backupDate: date,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ message: "backup failed", error: msg }));
      await fail(`备份失败：${msg}`);
    }
  }
}
