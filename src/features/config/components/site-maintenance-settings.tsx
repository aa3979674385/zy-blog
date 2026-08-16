import { useEffect, useMemo, useState } from "react";
import { Hammer, Loader2, Play, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DEFAULT_MAINTENANCE_MESSAGE } from "@/features/maintenance/maintenance.service";
import { useSystemSetting } from "@/features/config/hooks/use-system-setting";

/**
 * 站点维护设置（维护 tab）：
 * - 开关：进入 / 结束维护
 * - 时长：设定维护时长（分钟），到点自动恢复；0 = 永久维护
 * - 话术：自定义维护话术（留空使用默认话术）
 */
export function SiteMaintenanceSettings() {
  const { settings, isLoading, saveSettings } = useSystemSetting();
  const maintenance = settings?.maintenance;

  const [enabled, setEnabled] = useState(false);
  const [duration, setDuration] = useState(30);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  // 同步配置到本地 state
  useEffect(() => {
    if (!settings) return;
    setEnabled(maintenance?.enabled ?? false);
    setMessage(maintenance?.message ?? "");
  }, [settings, maintenance?.enabled, maintenance?.message]);

  // 剩余时间展示
  const remainingText = useMemo(() => {
    const endsAt = maintenance?.endsAt;
    if (!enabled || !endsAt) return "";
    const diff = new Date(endsAt).getTime() - Date.now();
    if (diff <= 0) return "即将恢复";
    const mins = Math.ceil(diff / 60000);
    if (mins < 60) return `${mins} 分钟后自动恢复`;
    const hours = Math.floor(mins / 60);
    const rest = mins % 60;
    return rest > 0 ? `${hours} 小时 ${rest} 分钟后自动恢复` : `${hours} 小时后自动恢复`;
  }, [enabled, maintenance?.endsAt]);

  const apply = async (patch: {
    enabled: boolean;
    endsAt?: string | null;
    message?: string;
  }) => {
    setSaving(true);
    try {
      const next = {
        ...settings,
        maintenance: {
          enabled: patch.enabled,
          endsAt: patch.endsAt ?? undefined,
          message: patch.message ?? (message.trim() || undefined),
        },
      };
      await saveSettings({ data: next });
      toast.success(patch.enabled ? "已进入维护模式" : "维护已结束");
    } catch {
      toast.error("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  const startMaintenance = () => {
    const endsAt =
      duration > 0
        ? new Date(Date.now() + duration * 60 * 1000).toISOString()
        : null;
    void apply({ enabled: true, endsAt });
  };

  const stopMaintenance = () => {
    void apply({ enabled: false, endsAt: null });
  };

  if (isLoading) {
    return (
      <section className="border border-border/30 bg-background/50 p-8">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 size={14} className="animate-spin" />
          加载中…
        </div>
      </section>
    );
  }

  return (
    <section className="border border-border/30 bg-background/50 p-8">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/40 text-muted-foreground">
          <Hammer size={14} />
        </span>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-foreground">站点维护模式</h3>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            开启后前台所有页面显示维护提示（后台登录和管理不受影响）。可设定维护时长，
            到点自动恢复；也可自定义维护话术，留空使用默认话术。
          </p>
        </div>
        {enabled && (
          <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-600">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            维护中
          </span>
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* 维护设置 */}
        <div className="space-y-4 rounded-md border border-border/30 p-4">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            维护设置
          </p>

          <div className="space-y-1.5">
            <label className="block text-xs text-muted-foreground">
              维护时长（分钟）
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={10080}
                value={duration}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  setDuration(Number.isFinite(n) && n >= 0 ? Math.round(n) : 0);
                }}
                className="w-28 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary"
              />
              <span className="text-xs text-muted-foreground">
                0 = 永久维护（不自动恢复）
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs text-muted-foreground">
              维护话术（留空使用默认话术）
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder={DEFAULT_MAINTENANCE_MESSAGE}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/40"
            />
          </div>

          <div className="flex items-center gap-3 pt-1">
            {enabled ? (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={stopMaintenance}
                className="rounded-none text-xs font-mono uppercase tracking-widest"
              >
                {saving ? (
                  <Loader2 size={12} className="animate-spin mr-1" />
                ) : (
                  <Square size={12} className="mr-1" />
                )}
                立即结束维护
              </Button>
            ) : (
              <Button
                type="button"
                disabled={saving}
                onClick={startMaintenance}
                className="rounded-none bg-foreground text-background hover:bg-foreground/90 text-xs font-mono uppercase tracking-widest"
              >
                {saving ? (
                  <Loader2 size={12} className="animate-spin mr-1" />
                ) : (
                  <Play size={12} className="mr-1" />
                )}
                进入维护
              </Button>
            )}
          </div>
        </div>

        {/* 状态预览 */}
        <div className="space-y-4 rounded-md border border-border/30 bg-muted/10 p-4">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            维护页预览
          </p>
          <div className="rounded-lg border border-border/50 bg-background p-6 text-center">
            <p className="text-sm font-medium text-foreground">
              {settings?.site?.title || "站点"}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {message.trim() || DEFAULT_MAINTENANCE_MESSAGE}
            </p>
            {enabled && remainingText && (
              <p className="mt-3 text-[10px] text-muted-foreground/70">
                ● {remainingText}
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground/70 leading-relaxed">
            当前状态：
            {enabled ? "维护中" : "正常"}。
            {enabled && !maintenance?.endsAt
              ? "未设结束时间（永久维护），请手动结束。"
              : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
