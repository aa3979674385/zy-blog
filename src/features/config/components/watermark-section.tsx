import { Controller, useFormContext, useWatch } from "react-hook-form";
import { AssetUploadField } from "@/features/config/components/asset-upload-field";
import type { SystemConfig } from "@/features/config/config.schema";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const POSITIONS = [
  { value: "southeast", label: "右下角" },
  { value: "southwest", label: "左下角" },
  { value: "northeast", label: "右上角" },
  { value: "northwest", label: "左上角" },
  { value: "center", label: "居中" },
  { value: "north", label: "顶部居中" },
  { value: "south", label: "底部居中" },
  { value: "east", label: "右侧居中" },
  { value: "west", label: "左侧居中" },
] as const;

export function WatermarkSection() {
  const { control } = useFormContext<SystemConfig>();
  const watermarkType = useWatch({ control, name: "watermark.type" }) ?? "text";

  return (
    <section className="border border-border/30 bg-background/50 overflow-hidden">
      <div className="p-8 space-y-2 border-b border-border/20">
        <h3 className="text-lg font-medium text-foreground">图片水印</h3>
        <p className="text-sm text-muted-foreground">
          访客访问图片时由 Cloudflare Image Resizing 动态叠加水印（原图不受影响）。
          启用后，外部请求携带 ?original=true 将被拒绝，防止绕过水印拿到原图。
        </p>
      </div>

      <div className="p-8 space-y-8">
        {/* 总开关 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">启用图片水印</p>
            <p className="mt-1 text-sm text-muted-foreground">
              关闭后所有图片按原样返回，不叠加水印。
            </p>
          </div>
          <Controller
            control={control}
            name="watermark.enabled"
            render={({ field }) => (
              <Checkbox
                checked={field.value ?? false}
                onCheckedChange={field.onChange}
              />
            )}
          />
        </div>

        {/* 水印类型 */}
        <div>
          <p className="text-sm font-medium text-foreground mb-3">水印类型</p>
          <Controller
            control={control}
            name="watermark.type"
            render={({ field }) => {
              const current = field.value ?? "text";
              return (
                <div className="grid gap-4 md:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => field.onChange("text")}
                    className={cn(
                      "text-left rounded-xl border p-5 transition-all",
                      current === "text"
                        ? "border-foreground bg-muted/40"
                        : "border-border/40 hover:border-foreground/40",
                    )}
                  >
                    <span className="font-medium text-foreground">文字水印</span>
                    <p className="mt-2 text-sm text-muted-foreground">
                      无需额外文件，支持自定义文字、颜色与字号。
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => field.onChange("image")}
                    className={cn(
                      "text-left rounded-xl border p-5 transition-all",
                      current === "image"
                        ? "border-foreground bg-muted/40"
                        : "border-border/40 hover:border-foreground/40",
                    )}
                  >
                    <span className="font-medium text-foreground">图片水印</span>
                    <p className="mt-2 text-sm text-muted-foreground">
                      使用 Logo 等自定义图片作为水印，需先上传水印图。
                    </p>
                  </button>
                </div>
              );
            }}
          />
        </div>

        {/* 文字水印配置 */}
        {watermarkType === "text" && (
          <div className="space-y-6">
            <Controller
              control={control}
              name="watermark.text"
              render={({ field }) => (
                <div>
                  <label className="text-sm font-medium text-foreground">
                    水印文字
                  </label>
                  <Input
                    className="mt-2"
                    placeholder="例如：www.yourblog.com"
                    value={field.value ?? ""}
                    onChange={field.onChange}
                  />
                </div>
              )}
            />
            <div className="grid gap-6 md:grid-cols-2">
              <Controller
                control={control}
                name="watermark.textColor"
                render={({ field }) => (
                  <div>
                    <label className="text-sm font-medium text-foreground">
                      文字颜色
                    </label>
                    <div className="mt-2 flex items-center gap-3">
                      <input
                        type="color"
                        className="h-9 w-14 cursor-pointer border border-border/50 bg-transparent"
                        value={normalizeColor(field.value ?? "#ffffff")}
                        onChange={(e) => field.onChange(hexToRgba(e.target.value))}
                      />
                      <Input
                        value={field.value ?? "rgba(255,255,255,0.6)"}
                        onChange={field.onChange}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      支持 #hex / rgb() / rgba()，可手动输入带透明度的值
                    </p>
                  </div>
                )}
              />
              <Controller
                control={control}
                name="watermark.textSize"
                render={({ field }) => (
                  <div>
                    <label className="text-sm font-medium text-foreground">
                      字号（px）
                    </label>
                    <Input
                      type="number"
                      min={12}
                      max={200}
                      className="mt-2"
                      value={field.value ?? 36}
                      onChange={(e) =>
                        field.onChange(
                          Number.parseInt(e.target.value, 10) || 36,
                        )
                      }
                    />
                  </div>
                )}
              />
            </div>
          </div>
        )}

        {/* 图片水印配置 */}
        {watermarkType === "image" && (
          <div>
            <label className="text-sm font-medium text-foreground">
              水印图片
            </label>
            <div className="mt-2">
              <AssetUploadField
                name="watermark.imageUrl"
                assetPath="watermark.png"
                accept="image/png,image/webp,image/jpeg,image/svg+xml"
                label="上传水印图"
                hint="推荐使用透明背景 PNG，大小建议不超过 500KB"
                placeholder="/images/asset/watermark.png?v=..."
              />
            </div>
          </div>
        )}

        {/* 通用配置 */}
        <div className="grid gap-6 md:grid-cols-3">
          <Controller
            control={control}
            name="watermark.opacity"
            render={({ field }) => (
              <div>
                <label className="text-sm font-medium text-foreground">
                  透明度（0-1）
                </label>
                <Input
                  type="number"
                  min={0}
                  max={1}
                  step={0.05}
                  className="mt-2"
                  value={field.value ?? 0.5}
                  onChange={(e) => {
                    const v = Number.parseFloat(e.target.value);
                    field.onChange(Number.isNaN(v) ? 0.5 : v);
                  }}
                />
              </div>
            )}
          />
          <Controller
            control={control}
            name="watermark.scale"
            render={({ field }) => (
              <div>
                <label className="text-sm font-medium text-foreground">
                  水印大小（相对图片宽度）
                </label>
                <Input
                  type="number"
                  min={0.05}
                  max={1}
                  step={0.05}
                  className="mt-2"
                  value={field.value ?? 0.2}
                  onChange={(e) => {
                    const v = Number.parseFloat(e.target.value);
                    field.onChange(Number.isNaN(v) ? 0.2 : v);
                  }}
                />
              </div>
            )}
          />
          <Controller
            control={control}
            name="watermark.position"
            render={({ field }) => (
              <div>
                <label className="text-sm font-medium text-foreground">
                  水印位置
                </label>
                <select
                  className="mt-2 h-9 w-full rounded-none border-b border-input bg-transparent px-0 py-1 text-sm focus-visible:outline-hidden focus-visible:border-foreground"
                  value={field.value ?? "southeast"}
                  onChange={(e) => field.onChange(e.target.value)}
                >
                  {POSITIONS.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          />
        </div>
      </div>
    </section>
  );
}

/** 把 #hex 转成 rgba() 字符串，兼容项目默认的带透明度写法 */
function normalizeColor(value: string): string {
  if (value.startsWith("#")) return value;
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return "#ffffff";
  const parts = match[1].split(",").map((s) => s.trim());
  const r = Number.parseInt(parts[0], 10) || 255;
  const g = Number.parseInt(parts[1], 10) || 255;
  const b = Number.parseInt(parts[2], 10) || 255;
  const hex = ((1 << 24) | (r << 16) | (g << 8) | b)
    .toString(16)
    .slice(1)
    .padStart(6, "0");
  return `#${hex}`;
}

function hexToRgba(hex: string): string {
  const h = hex.replace("#", "");
  const full =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r},${g},${b},0.6)`;
}
