import { useMutation, useQuery } from "@tanstack/react-query";
import {
  getBackupProgressFn,
  getRestoreProgressFn,
  listBackupsFn,
  startBackupFn,
  startRestoreFn,
} from "@/features/backup/api/backup.api";

const BACKUP_KEYS = {
  list: ["backup", "list"] as const,
  progress: (taskId: string) => ["backup", "progress", taskId] as const,
  restoreProgress: (taskId: string) =>
    ["backup", "restore-progress", taskId] as const,
};

export function useStartBackup() {
  return useMutation({
    mutationFn: startBackupFn,
  });
}

export function useBackupProgress(taskId: string | null) {
  return useQuery({
    queryKey: BACKUP_KEYS.progress(taskId ?? ""),
    queryFn: () => getBackupProgressFn({ data: { taskId: taskId! } }),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = (query.state.data as { data?: { status?: string } })
        ?.data?.status;
      return status === "completed" || status === "failed" ? false : 1500;
    },
  });
}

export function useRestoreProgress(taskId: string | null) {
  return useQuery({
    queryKey: BACKUP_KEYS.restoreProgress(taskId ?? ""),
    queryFn: () => getRestoreProgressFn({ data: { taskId: taskId! } }),
    enabled: !!taskId,
    refetchInterval: (query) => {
      const status = (query.state.data as { data?: { status?: string } })
        ?.data?.status;
      return status === "completed" || status === "failed" ? false : 1500;
    },
  });
}

export function useListBackups() {
  return useQuery({
    queryKey: BACKUP_KEYS.list,
    queryFn: listBackupsFn,
  });
}

export function useStartRestore() {
  return useMutation({
    mutationFn: (backupDate: string) => startRestoreFn({ data: { backupDate } }),
  });
}
