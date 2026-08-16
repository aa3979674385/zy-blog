import { z } from "zod";

/** 全量备份/恢复任务进度（与导入导出共用结构） */
export const BackupTaskProgressSchema = z.object({
  status: z.enum(["pending", "processing", "completed", "failed"]),
  total: z.number(),
  completed: z.number(),
  current: z.string(),
  errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  backupDate: z.string().optional(),
});
export type BackupTaskProgress = z.infer<typeof BackupTaskProgressSchema>;

/** 备份 manifest（存于 R2 backup/<date>/manifest.json） */
export const BackupManifestSchema = z.object({
  exportedAt: z.string(),
  version: z.literal(1),
  /** 表名 -> 行数 */
  tables: z.record(z.string(), z.number()),
  /** R2 附件统计 */
  files: z.object({
    count: z.number(),
    totalBytes: z.number(),
  }),
  dataKey: z.string(), // backup/<date>/data.json
  filesPrefix: z.string(), // backup/<date>/files/
});
export type BackupManifest = z.infer<typeof BackupManifestSchema>;

/** 备份目录 key 助手 */
export const BACKUP_KEYS = {
  /** 备份根目录前缀 */
  root: (date: string) => `backup/${date}`,
  /** 数据库全量 JSON */
  data: (date: string) => `backup/${date}/data.json`,
  /** manifest */
  manifest: (date: string) => `backup/${date}/manifest.json`,
  /** 附件复制前缀 */
  filesPrefix: (date: string) => `backup/${date}/files/`,
};

export const BACKUP_CACHE_KEYS = {
  backupProgress: (taskId: string) => `backup:progress:${taskId}`,
  restoreProgress: (taskId: string) => `backup:restore:progress:${taskId}`,
};

export interface BackupStartInput {
  taskId: string;
  locale: string;
}

export interface RestoreStartInput {
  taskId: string;
  backupDate: string;
  locale: string;
}
