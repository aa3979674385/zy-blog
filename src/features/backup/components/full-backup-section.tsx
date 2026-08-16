import { useState } from "react";
import { Database, Download, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  useBackupProgress,
  useListBackups,
  useRestoreProgress,
  useStartBackup,
  useStartRestore,
} from "@/features/backup/queries/backup.queries";

/**
 * 全量备份/恢复（D1 全表 + R2 附件）。
 * - 备份：导出 D1 全部表为 JSON（可下载）+ R2 附件复制到备份目录（云端留存）
 * - 恢复：按备份日期清空并重建全表 + 附件复制回原位置（覆盖现有数据，需二次确认）
 */
export function FullBackupSection() {
  const startBackup = useStartBackup();
  const startRestore = useStartRestore();
  const { data: backupList, refetch: refetchList } = useListBackups();

  const [backupTaskId, setBackupTaskId] = useState<string | null>(null);
  const [restoreTaskId, setRestoreTaskId] = useState<string | null>(null);
  const [confirmDate, setConfirmDate] = useState<string | null>(null);

  const backupProgress = useBackupProgress(backupTaskId);
  const restoreProgress = useRestoreProgress(restoreTaskId);

  const handleStartBackup = async () => {
    const res = await startBackup.mutateAsync(undefined as never);
    if (res?.error) {
      toast.error(`备份启动失败：${res.error.reason}`);
      return;
    }
    setBackupTaskId(res?.data?.taskId ?? null);
    toast.success("全量备份已启动，正在处理…");
  };

  const handleStartRestore = async (date: string) => {
    const res = await startRestore.mutateAsync(date);
    if (res?.error) {
      toast.error(`恢复启动失败：${res.error.reason}`);
      return;
    }
    setRestoreTaskId(res?.data?.taskId ?? null);
    setConfirmDate(null);
    toast.success(`恢复已启动（${date}），正在处理…`);
  };

  const downloadDataUrl = (date: string) => `/api/admin/backup/data/${date}`;

  const bp = backupProgress.data;
  const rp = restoreProgress.data;

  return (
    <div className="border border-border/30 bg-background/50 p-8">
      <div className="flex items-start gap-3">
        <Database size={18} className="mt-1 shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">全量备份（数据库 + 附件）</h3>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">
            备份 = <strong>数据库全部表</strong>（文章、会员、卡密、积分、用户、配置、评论、日志等，
            可下载 data.json） + <strong>R2 附件</strong>（自动复制到备份目录，云端留存）。
            恢复会<strong className="text-red-600 dark:text-red-400">清空并覆盖当前数据</strong>，请谨慎操作。
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-4">
        <Button
          type="button"
          onClick={handleStartBackup}
          disabled={startBackup.isPending || (bp?.status === "processing")}
          className="h-10 gap-2 rounded-none bg-foreground px-6 font-mono text-[10px] uppercase tracking-[0.2em] text-background transition-all hover:opacity-90 disabled:opacity-50"
        >
          {startBackup.isPending || bp?.status === "processing" ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          {bp?.status === "processing" ? "备份中…" : "开始全量备份"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => refetchList()}
          className="h-10 gap-2 rounded-none font-mono text-[10px] uppercase tracking-[0.2em]"
        >
          <RefreshCw size={14} /> 刷新列表
        </Button>
      </div>

      {/* 备份进度 */}
      {bp && bp.status === "processing" && (
        <div className="mt-4 rounded border border-border/40 bg-muted/40 p-3 text-sm">
          <Loader2 size={13} className="mr-2 inline animate-spin" />
          {bp.current}
          {bp.total > 0 && `（${bp.completed}/${bp.total}）`}
        </div>
      )}
      {bp && bp.status === "completed" && (
        <div className="mt-4 rounded border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-emerald-600 dark:text-emerald-400">
          ✅ {bp.current}
        </div>
      )}
      {bp && bp.status === "failed" && (
        <div className="mt-4 rounded border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
          ❌ {bp.current}
        </div>
      )}

      {/* 恢复进度 */}
      {rp && rp.status === "processing" && (
        <div className="mt-4 rounded border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <Loader2 size={13} className="mr-2 inline animate-spin" />
          {rp.current}
          {rp.total > 0 && `（${rp.completed}/${rp.total}）`}
        </div>
      )}
      {rp && rp.status === "completed" && (
        <div className="mt-4 rounded border border-emerald-500/40 bg-emerald-500/5 p-3 text-sm text-emerald-600 dark:text-emerald-400">
          ✅ {rp.current}
        </div>
      )}
      {rp && rp.status === "failed" && (
        <div className="mt-4 rounded border border-red-500/40 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
          ❌ {rp.current}
        </div>
      )}

      {/* 备份列表 */}
      <div className="mt-6">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          历史备份
        </h4>
        {!backupList?.data?.length ? (
          <p className="mt-2 text-sm text-muted-foreground">
            暂无备份，点击"开始全量备份"创建第一份。
          </p>
        ) : (
          <div className="mt-2 space-y-2">
            {backupList.data.map((b) => (
              <div
                key={b.date}
                className="flex flex-wrap items-center gap-3 rounded border border-border/30 bg-background/60 px-4 py-2.5 text-sm"
              >
                <span className="font-mono">{b.date}</span>
                <span className="text-xs text-muted-foreground">
                  {b.hasData ? "数据 ✓" : "数据 -"}
                  {b.hasFiles ? " 附件 ✓" : " 附件 -"}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  {b.hasData && (
                    <a
                      href={downloadDataUrl(b.date)}
                      className="inline-flex h-8 items-center gap-1.5 rounded border border-border/50 px-3 text-xs font-medium transition-colors hover:bg-muted"
                    >
                      <Download size={12} /> 下载数据
                    </a>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 rounded-none text-xs"
                    onClick={() => setConfirmDate(b.date)}
                  >
                    恢复
                  </Button>
                </div>

                {confirmDate === b.date && (
                  <div className="w-full rounded border border-red-500/40 bg-red-500/5 p-3">
                    <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                      <TriangleAlert size={15} className="mt-0.5 shrink-0" />
                      <span>
                        恢复将<strong>清空并覆盖当前全部数据</strong>
                        （数据库 + 附件）为 {b.date} 的状态，此操作不可撤销。确定继续？
                      </span>
                    </div>
                    <div className="mt-2 flex gap-3">
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 rounded-none bg-red-600 text-xs text-white hover:bg-red-700"
                        disabled={startRestore.isPending}
                        onClick={() => handleStartRestore(b.date)}
                      >
                        {startRestore.isPending ? "恢复中…" : "确认恢复"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 rounded-none text-xs"
                        onClick={() => setConfirmDate(null)}
                      >
                        取消
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
