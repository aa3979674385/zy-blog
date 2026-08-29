import { useEffect, useRef, useState } from "react";
import { Heart, ImagePlus, Loader2, Save, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSystemSetting } from "@/features/config/hooks/use-system-setting";
import { uploadImageFn } from "@/features/media/api/media.api";

/**
 * 打赏设置（模板设置 → 详情页设置）：
 * - 全局开关：关闭后前台完全不显示打赏模块
 * - 赞赏码 / 收款码上传：传了哪个显示哪个；都不传则不显示（即使开关开着）
 * 独立保存（updateSystemConfigFn.reward），不影响模板表单其他字段。
 */
export function RewardSettingsPanel() {
  const queryClient = useQueryClient();
  const { settings, isLoading, saveSettings } = useSystemSetting();
  const reward = settings?.reward;

  const [enabled, setEnabled] = useState(true);
  const [tipCode, setTipCode] = useState<string | null>(null);
  const [payCode, setPayCode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"tip" | "pay" | null>(null);

  const tipInputRef = useRef<HTMLInputElement>(null);
  const payInputRef = useRef<HTMLInputElement>(null);

  // 同步配置到本地 state
  useEffect(() => {
    if (!settings) return;
    setEnabled(reward?.enabled ?? true);
    setTipCode(reward?.tipCode ?? null);
    setPayCode(reward?.payCode ?? null);
  }, [settings, reward?.enabled, reward?.tipCode, reward?.payCode]);

  const handleUpload = async (field: "tip" | "pay", file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("请上传图片文件（二维码）");
      return;
    }
    setUploading(field);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const result = await uploadImageFn({ data: formData });
      if (result.error) {
        toast.error("上传失败：" + (result.error.reason ?? ""));
        return;
      }
      const key = result.data.key;
      if (field === "tip") setTipCode(key);
      else setPayCode(key);
      toast.success(field === "tip" ? "赞赏码已上传" : "收款码已上传");
    } catch {
      toast.error("上传失败，请重试");
    } finally {
      setUploading(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSettings({
        data: {
          reward: { enabled, tipCode, payCode },
        },
      });
      // 立即刷新前台打赏缓存（让前台马上生效，不用等 10 分钟）
      await queryClient.invalidateQueries({ queryKey: ["reward", "config"] });
      toast.success("打赏设置已保存");
    } catch {
      toast.error("保存失败，请重试");
    } finally {
      setSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl border border-border/20 bg-background/60 p-6 text-sm text-muted-foreground">
        加载中…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/20 bg-background/60 p-6">
      <div className="flex items-center justify-between border-b border-border/10 pb-3 mb-5">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Heart size={14} className="text-red-500" />
          打赏设置
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleSave}
          disabled={saving}
          className="h-8 gap-1.5 rounded-none text-[11px] font-mono"
        >
          {saving ? (
            <Loader2 size={13} className="animate-spin" />
          ) : (
            <Save size={13} />
          )}
          保存
        </Button>
      </div>

      {/* 全局开关（直观 Switch：开=绿色滑块在右，关=灰色滑块在左） */}
      <button
        type="button"
        onClick={() => setEnabled(!enabled)}
        className="flex w-full items-center justify-between gap-4 mb-5 text-left"
        aria-pressed={enabled}
      >
        <div>
          <p className="text-sm font-medium text-foreground">开启打赏模块</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            关闭后前台文章页完全不显示打赏模块
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-xs font-medium ${
              enabled ? "text-green-600" : "text-muted-foreground"
            }`}
          >
            {enabled ? "已开启" : "已关闭"}
          </span>
          <span
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              enabled ? "bg-green-500" : "bg-muted-foreground/30"
            }`}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                enabled ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </span>
        </div>
      </button>

      {/* 二维码上传 */}
      <div className="grid gap-5 sm:grid-cols-2">
        {(
          [
            {
              key: "tip" as const,
              label: "赞赏码",
              hint: "微信赞赏码（传了才显示）",
              value: tipCode,
              ref: tipInputRef,
            },
            {
              key: "pay" as const,
              label: "收款码",
              hint: "微信/支付宝收款码（传了才显示）",
              value: payCode,
              ref: payInputRef,
            },
          ] as const
        ).map((item) => (
          <div
            key={item.key}
            className="rounded-lg border border-border/15 bg-muted/5 p-4"
          >
            <p className="text-sm font-medium text-foreground">{item.label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 mb-3">
              {item.hint}
            </p>

            {item.value ? (
              <div className="flex items-start gap-3">
                <img
                  src={`/images/${item.value}`}
                  alt={item.label}
                  className="h-28 w-28 rounded-md border border-border/20 object-cover bg-white"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    item.key === "tip"
                      ? setTipCode(null)
                      : setPayCode(null)
                  }
                  className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  title="移除二维码"
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => item.ref.current?.click()}
                disabled={uploading !== null}
                className="h-9 w-full gap-1.5 rounded-none text-[11px]"
              >
                {uploading === item.key ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <ImagePlus size={13} />
                )}
                上传{item.label}
              </Button>
            )}
            <input
              ref={item.ref}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(item.key, file);
                e.target.value = "";
              }}
            />
          </div>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground mt-4">
        显示规则：上传了哪种码就显示哪种；两种都没上传则前台不显示（即使开关开启）。
      </p>
    </div>
  );
}
