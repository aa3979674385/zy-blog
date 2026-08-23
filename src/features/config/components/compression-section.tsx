import { Controller, useFormContext } from "react-hook-form";
import type { SystemConfig } from "@/features/config/config.schema";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const FORMATS = [
  {
    value: "webp",
    label: "WebP",
    desc: "体积最小，现代浏览器全支持（推荐）",
  },
  {
    value: "jpeg",
    label: "JPEG",
    desc: "兼容性最好，不支持透明通道",
  },
  {
    value: "png",
    label: "PNG",
    desc: "无损压缩，支持透明通道",
  },
  {
    value: "auto",
    label: "保持原格式",
    desc: "不转换格式，仅缩小尺寸",
  },
] as const;

export function CompressionSection() {
  const { control } = useFormContext<SystemConfig>();

  return (
    <section className="border border-border/30 bg-background/50 overflow-hidden">
      <div className="p-8 space-y-2 border-b border-border/20">
        <h3 className="text-lg font-medium text-foreground">图片压缩</h3>
        <p className="text-sm text-muted-foreground">
          上传图片时自动缩小尺寸并转换格式，减少图片体积、加快页面加载。
          与水印功能独立运行，可单独开启或关闭。若两者同时开启，先压缩再加水印。
        </p>
      </div>

      <div className="p-8 space-y-8">
        {/* 总开关 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">启用图片压缩</p>
            <p className="mt-1 text-sm text-muted-foreground">
              关闭后图片原样上传，不做任何处理。
            </p>
          </div>
          <Controller
            control={control}
            name="compression.enabled"
            render={({ field }) => (
              <Checkbox
                checked={field.value ?? false}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>

        {/* 最大宽度 */}
        <Controller
          control={control}
          name="compression.maxWidth"
          render={({ field }) => (
            <div>
              <label className="text-sm font-medium text-foreground">
                最大宽度（px）
              </label>
              <Input
                type="number"
                min={100}
                max={4096}
                className="mt-2"
                value={field.value ?? 1200}
                onChange={(e) =>
                  field.onChange(
                    Number.parseInt(e.target.value, 10) || 1200,
                  )
                }
              />
              <p className="mt-1 text-xs text-muted-foreground">
                图片宽度超过此值时才压缩，小于此值保持原尺寸。常见值：1200（文章配图）、1920（横幅大图）。
              </p>
            </div>
          )}
        />

        {/* 输出格式 */}
        <div>
          <p className="text-sm font-medium text-foreground mb-3">输出格式</p>
          <Controller
            control={control}
            name="compression.outputFormat"
            render={({ field }) => {
              const current = field.value ?? "webp";
              return (
                <div className="grid gap-4 md:grid-cols-2">
                  {FORMATS.map((f) => (
                    <button
                      key={f.value}
                      type="button"
                      onClick={() => field.onChange(f.value)}
                      className={cn(
                        "text-left rounded-xl border p-5 transition-all",
                        current === f.value
                          ? "border-foreground bg-muted/40"
                          : "border-border/40 hover:border-foreground/40",
                      )}
                    >
                      <span className="font-medium text-foreground">
                        {f.label}
                      </span>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {f.desc}
                      </p>
                    </button>
                  ))}
                </div>
              );
            }}
          />
        </div>

        {/* 压缩质量 */}
        <Controller
          control={control}
          name="compression.quality"
          render={({ field }) => (
            <div>
              <label className="text-sm font-medium text-foreground">
                压缩质量（0.1 - 1.0）
              </label>
              <div className="mt-2 flex items-center gap-4">
                <input
                  type="range"
                  min={0.1}
                  max={1}
                  step={0.05}
                  className="flex-1 accent-foreground"
                  value={field.value ?? 0.85}
                  onChange={(e) => {
                    const v = Number.parseFloat(e.target.value);
                    field.onChange(Number.isNaN(v) ? 0.85 : v);
                  }}
                />
                <Input
                  type="number"
                  min={0.1}
                  max={1}
                  step={0.05}
                  className="w-24"
                  value={field.value ?? 0.85}
                  onChange={(e) => {
                    const v = Number.parseFloat(e.target.value);
                    field.onChange(Number.isNaN(v) ? 0.85 : v);
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                数值越小体积越小，但画质也越低。推荐 0.8 - 0.9。
              </p>
            </div>
          )}
        />
      </div>
    </section>
  );
}
