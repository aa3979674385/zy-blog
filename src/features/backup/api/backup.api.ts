import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as BackupService from "@/features/backup/backup.service";
import { requirePermission } from "@/lib/middlewares";

const TaskIdSchema = z.object({ taskId: z.string() });
const BackupDateSchema = z.object({ backupDate: z.string() });

/** 启动全量备份（D1 全表 + R2 附件） */
export const startBackupFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("import.manage")])
  .handler(async ({ context }) => {
    return await BackupService.startBackup(context);
  });

/** 查询备份进度 */
export const getBackupProgressFn = createServerFn()
  .middleware([requirePermission("import.manage")])
  .inputValidator(TaskIdSchema)
  .handler(async ({ data, context }) => {
    return await BackupService.getBackupProgress(context, data.taskId);
  });

/** 启动全量恢复（覆盖现有数据，需二次确认后调用） */
export const startRestoreFn = createServerFn({ method: "POST" })
  .middleware([requirePermission("import.manage")])
  .inputValidator(BackupDateSchema)
  .handler(async ({ data, context }) => {
    return await BackupService.startRestore(context, data.backupDate);
  });

/** 查询恢复进度 */
export const getRestoreProgressFn = createServerFn()
  .middleware([requirePermission("import.manage")])
  .inputValidator(TaskIdSchema)
  .handler(async ({ data, context }) => {
    return await BackupService.getRestoreProgress(context, data.taskId);
  });

/** 列出所有备份日期 */
export const listBackupsFn = createServerFn()
  .middleware([requirePermission("import.manage")])
  .handler(async ({ context }) => {
    return await BackupService.listBackupsServerFn(context);
  });
