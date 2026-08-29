import { Controller, useFormContext } from "react-hook-form";
import { Camera } from "lucide-react";
import type { SystemConfig } from "@/features/config/config.schema";

/**
 * 文章历史自动快照设置（维护 tab）：
 * - 开关：完全关闭 / 开启自动快照
 * - 条数：每篇文章最多保留的自动快照条数（超出自动删除最旧的）
 */
export function AutoSnapshotSettings() {
  const { control } = useFormContext<SystemConfig>();

  return (
    <section className="border border-border/30 bg-background/50 p-8">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border/40 text-muted-foreground">
          <Camera size={14} />
        </span>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-foreground">文章历史自动快照</h3>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            文章编辑保存后会自动生成历史快照（可在编辑页「历史」中回滚）。
            可在此关闭该功能，或限制每篇文章最多保留的快照条数（超出自动删除最旧的）。
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {/* 开关 */}
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm text-foreground">启用自动快照</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              关闭后不再自动生成新快照（已保存的历史仍保留，可手动清理）。
            </p>
          </div>
          <Controller
            name="autoSnapshot.enabled"
            control={control}
            render={({ field }) => (
              <button
                type="button"
                role="switch"
                aria-checked={field.value}
                onClick={() => field.onChange(!field.value)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  field.value ? "bg-foreground" : "bg-border"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-all ${
                    field.value ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            )}
          />
        </div>

        {/* 条数 */}
        <div className="flex items-center justify-between gap-6">
          <div>
            <p className="text-sm text-foreground">每篇最多保留</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              超过该数量的最旧快照会被自动删除（1-100）。
            </p>
          </div>
          <Controller
            name="autoSnapshot.maxRevisions"
            control={control}
            render={({ field }) => (
              <input
                type="number"
                min={1}
                max={100}
                value={field.value}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  field.onChange(Number.isFinite(n) ? Math.min(100, Math.max(1, Math.round(n))) : 1);
                }}
                className="w-24 rounded-md border border-input bg-background px-3 py-2 text-center text-sm text-foreground outline-none focus:border-primary"
              />
            )}
          />
        </div>
      </div>
    </section>
  );
}
