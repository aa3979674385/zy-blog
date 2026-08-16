import * as CacheService from "@/features/cache/cache.service";
import {
  BACKUP_CACHE_KEYS,
  BACKUP_KEYS,
  type BackupStartInput,
  type BackupTaskProgress,
  type RestoreStartInput,
} from "@/features/backup/backup.schema";
import { serverEnv } from "@/lib/env/server.env";
import { err, ok } from "@/lib/errors";
import { getLocale } from "@/paraglide/runtime";

function getRequestLocaleOrDefault(env: Env) {
  try {
    return getLocale();
  } catch {
    return serverEnv(env).LOCALE;
  }
}

function initialProgress(
  status: BackupTaskProgress["status"],
  current: string,
): BackupTaskProgress {
  return { status, total: 0, completed: 0, current, errors: [], warnings: [] };
}

/** 启动全量备份（D1 全表 + R2 附件复制到备份目录） */
export async function startBackup(context: BaseContext) {
  const taskId = crypto.randomUUID();
  const locale = getRequestLocaleOrDefault(context.env);

  await CacheService.set(
    context,
    BACKUP_CACHE_KEYS.backupProgress(taskId),
    JSON.stringify(initialProgress("pending", "备份任务已创建")),
    { ttl: "24h" },
  );

  try {
    await context.env.BACKUP_WORKFLOW.create({
      params: { taskId, locale } satisfies BackupStartInput,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "backup workflow create failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    await CacheService.deleteKey(
      context,
      BACKUP_CACHE_KEYS.backupProgress(taskId),
    );
    return err({ reason: "WORKFLOW_CREATE_FAILED" });
  }

  return ok({ taskId });
}

/** 启动全量恢复（从指定备份日期恢复 D1 + R2 附件） */
export async function startRestore(context: BaseContext, backupDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(backupDate)) {
    return err({ reason: "INVALID_BACKUP_DATE" });
  }

  const taskId = crypto.randomUUID();
  const locale = getRequestLocaleOrDefault(context.env);

  await CacheService.set(
    context,
    BACKUP_CACHE_KEYS.restoreProgress(taskId),
    JSON.stringify(initialProgress("pending", "恢复任务已创建")),
    { ttl: "24h" },
  );

  try {
    await context.env.RESTORE_WORKFLOW.create({
      params: { taskId, backupDate, locale } satisfies RestoreStartInput,
    });
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "restore workflow create failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    await CacheService.deleteKey(
      context,
      BACKUP_CACHE_KEYS.restoreProgress(taskId),
    );
    return err({ reason: "WORKFLOW_CREATE_FAILED" });
  }

  return ok({ taskId });
}

export async function getBackupProgress(context: BaseContext, taskId: string) {
  const raw = await CacheService.getRaw(
    context,
    BACKUP_CACHE_KEYS.backupProgress(taskId),
  );
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BackupTaskProgress;
  } catch {
    return null;
  }
}

export async function getRestoreProgress(
  context: BaseContext,
  taskId: string,
) {
  const raw = await CacheService.getRaw(
    context,
    BACKUP_CACHE_KEYS.restoreProgress(taskId),
  );
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BackupTaskProgress;
  } catch {
    return null;
  }
}

/** 列出所有备份日期（R2 backup/ 顶层目录） */
export async function listBackups(env: Env) {
  const dates: Array<{ date: string; hasData: boolean; hasFiles: boolean }> =
    [];
  let cursor: string | undefined;
  do {
    const listed = await env.R2.list({ prefix: "backup/", limit: 1000, cursor });
    for (const obj of listed.objects) {
      const m = obj.key.match(/^backup\/(\d{4}-\d{2}-\d{2})/);
      if (!m) continue;
      const date = m[1];
      let entry = dates.find((d) => d.date === date);
      if (!entry) {
        entry = { date, hasData: false, hasFiles: false };
        dates.push(entry);
      }
      if (obj.key.endsWith("/data.json")) entry.hasData = true;
      if (obj.key.includes("/files/")) entry.hasFiles = true;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return dates.sort((a, b) => b.date.localeCompare(a.date));
}

/** 读取备份 manifest */
export async function getBackupManifest(env: Env, date: string) {
  const obj = await env.R2.get(BACKUP_KEYS.manifest(date));
  if (!obj) return null;
  const text = await obj.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 备份数据文件（data.json）是否存在 */
export async function backupDataExists(env: Env, date: string) {
  const obj = await env.R2.get(BACKUP_KEYS.data(date));
  return !!obj;
}

/** 供 TanStack serverFn 直接调用的数据访问封装 */
export async function listBackupsServerFn(context: BaseContext) {
  return ok(await listBackups(context.env));
}

/** 判断当前用户是否有管理员权限（恢复/下载用） */
export function isAdminSession(
  session: { user?: { email?: string | null } } | null,
  env: Env,
) {
  return !!session?.user?.email && session.user.email === serverEnv(env).ADMIN_EMAIL;
}

/** D1 表数据行（仅含可 JSON 序列化标量） */
export type BackupRow = Record<string, string | number | boolean | null>;

export interface BackupTablesData {
  exportedAt: string;
  tables: Record<string, Array<BackupRow>>;
}

/** 恢复时清空并重建 D1（供 RestoreWorkflow 使用） */
export async function exportAllTables(env: Env): Promise<BackupTablesData> {
  const db = env.DB;
  const tablesResult = await db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .all();
  const tableNames = (tablesResult.results as Array<{ name: string }>).map(
    (r) => r.name,
  );

  const tables: Record<string, Array<BackupRow>> = {};
  for (const table of tableNames) {
    const res = await db.prepare(`SELECT * FROM "${table}"`).all();
    tables[table] = (res.results as Array<BackupRow>) ?? [];
  }
  return { exportedAt: new Date().toISOString(), tables };
}

/** 清空全部业务表（恢复前调用） */
export async function truncateAllTables(env: Env) {
  const db = env.DB;
  const tablesResult = await db
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    )
    .all();
  const tableNames = (tablesResult.results as Array<{ name: string }>).map(
    (r) => r.name,
  );
  // D1 默认不强制外键（未开 foreign_keys pragma），DELETE 顺序安全
  const statements = tableNames.map((t) => db.prepare(`DELETE FROM "${t}"`));
  if (statements.length > 0) await db.batch(statements);
  return tableNames;
}
