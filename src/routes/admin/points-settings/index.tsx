import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Coins, Gift, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { usePointConfig, systemConfigQuery } from "@/features/config/queries";
import { updatePointConfigFn, updateSystemConfigFn } from "@/features/config/api/config.api";

export const Route = createFileRoute("/admin/points-settings/")({
  ssr: "data-only",
  component: PointsSettingsPage,
  loader: () => ({ title: "积分设置" }),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.title }],
  }),
});

function PointsSettingsPage() {
  const { data: config, isLoading } = usePointConfig();
  const { data: sysConfig } = useQuery(systemConfigQuery);
  const [pointsPerYuan, setPointsPerYuan] = useState("10");
  const [paymentEnabled, setPaymentEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  const [cardKeyUrl, setCardKeyUrl] = useState("");
  const [savingCardKey, setSavingCardKey] = useState(false);

  // 免费资源获取（全局总开关 + 每日次数）
  const [freeEnabled, setFreeEnabled] = useState(true);
  const [freeDailyLimit, setFreeDailyLimit] = useState("3");
  const [savingFree, setSavingFree] = useState(false);

  useEffect(() => {
    if (config) {
      setPointsPerYuan(String(config.pointsPerYuan ?? 10));
      setPaymentEnabled(config.paymentEnabled ?? false);
    }
  }, [config]);

  useEffect(() => {
    if (sysConfig?.site) {
      setCardKeyUrl(sysConfig.site.cardKeyPurchaseUrl ?? "");
    }
  }, [sysConfig]);

  useEffect(() => {
    if (sysConfig?.freeResource) {
      setFreeEnabled(sysConfig.freeResource.enabled ?? true);
      setFreeDailyLimit(String(sysConfig.freeResource.dailyLimit ?? 3));
    }
  }, [sysConfig]);

  const parsedRatio = Number(pointsPerYuan);
  const ratioValid = Number.isFinite(parsedRatio) && parsedRatio > 0;
  const dirty =
    Number(config?.pointsPerYuan ?? 10) !== parsedRatio ||
    (config?.paymentEnabled ?? false) !== paymentEnabled;

  const handleSave = async () => {
    if (!ratioValid) {
      toast.error("积分比例必须为正数");
      return;
    }
    setSaving(true);
    try {
      await updatePointConfigFn({
        data: {
          pointsPerYuan: Math.floor(parsedRatio),
          paymentEnabled,
        },
      });
      toast.success("已保存");
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  const cardDirty =
    !!sysConfig?.site &&
    cardKeyUrl.trim() !== (sysConfig.site.cardKeyPurchaseUrl ?? "");

  const handleSaveCardKey = async () => {
    setSavingCardKey(true);
    try {
      await updateSystemConfigFn({
        data: { site: { cardKeyPurchaseUrl: cardKeyUrl.trim() } },
      });
      toast.success("已保存");
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setSavingCardKey(false);
    }
  };

  const parsedFreeLimit = Number(freeDailyLimit);
  const freeLimitValid =
    Number.isFinite(parsedFreeLimit) &&
    parsedFreeLimit >= 0 &&
    Number.isInteger(parsedFreeLimit);
  const freeDirty =
    !!sysConfig?.freeResource &&
    freeLimitValid &&
    (freeEnabled !== (sysConfig.freeResource.enabled ?? true) ||
      parsedFreeLimit !== (sysConfig.freeResource.dailyLimit ?? 3));

  const handleSaveFreeResource = async () => {
    if (!freeLimitValid) {
      toast.error("请输入非负整数");
      return;
    }
    setSavingFree(true);
    try {
      await updateSystemConfigFn({
        data: {
          freeResource: {
            enabled: freeEnabled,
            dailyLimit: parsedFreeLimit,
          },
        },
      });
      toast.success("已保存");
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setSavingFree(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-serif font-medium tracking-tight text-foreground">
          积分设置
        </h1>
        <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase">
          Points Settings
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins size={16} className="opacity-60" />
            积分计费与支付
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            资源仅以「积分」计价。当用户的积分不足时，系统会按下方比例自动折算成人民币；
            若已接入支付网关，则生成支付订单并调起支付（当前支付为占位，需后台接入）。
          </p>

          <div className="space-y-2">
            <label className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              积分比例（多少积分 = 1 元）
            </label>
            <Input
              type="number"
              min={1}
              step={1}
              value={pointsPerYuan}
              onChange={(e) => setPointsPerYuan(e.target.value)}
              placeholder="如：10"
            />
            <p className="text-xs text-muted-foreground">
              例如填 10，即「10 积分 = ¥1」。资源标价 100 积分时，积分不足将折算为 ¥10。
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={paymentEnabled}
              onChange={(e) => setPaymentEnabled(e.target.checked)}
              className="h-4 w-4 accent-foreground"
            />
            <span className="text-sm">
              已接入支付网关（开启后，积分不足可折算人民币支付；关闭则积分不足无法购买）
            </span>
          </label>

          <Button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="h-11 px-8 rounded-none bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 size={14} className="animate-spin mr-2" />
            ) : null}
            保存
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift size={16} className="opacity-60" />
            免费资源获取
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            全局总开关：关闭后全站所有文章均不显示「免费获取」按钮，即使文章级开关已开启。
            开启后，用户每日可免费获取指定次数的下载链接（PC 端显示二维码、手机端直接展示链接）。
          </p>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={freeEnabled}
              onChange={(e) => setFreeEnabled(e.target.checked)}
              className="h-4 w-4 accent-foreground"
            />
            <span className="text-sm font-medium">
              启用免费资源获取（全局总开关）
            </span>
          </label>

          <div className="space-y-2">
            <label className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              每日免费获取次数
            </label>
            <Input
              type="number"
              min={0}
              step={1}
              value={freeDailyLimit}
              onChange={(e) => setFreeDailyLimit(e.target.value)}
              placeholder="如：3"
            />
            <p className="text-xs text-muted-foreground">
              每位登录用户每天可免费获取的次数，0 点重置。填 0 表示不限制。
            </p>
          </div>

          <Button
            type="button"
            onClick={handleSaveFreeResource}
            disabled={!freeDirty || savingFree || !freeLimitValid}
            className="h-11 px-8 rounded-none bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {savingFree ? (
              <Loader2 size={14} className="animate-spin mr-2" />
            ) : null}
            保存
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins size={16} className="opacity-60" />
            卡密购买配置
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            配置卡密购买页地址。会员中心「输入卡密」处会显示「前往购买卡密」入口并跳转此链接；留空则不显示。
          </p>
          <div className="space-y-2">
            <label className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              购买卡密链接
            </label>
            <Input
              value={cardKeyUrl}
              maxLength={500}
              onChange={(e) => setCardKeyUrl(e.target.value)}
              placeholder="https://example.com/buy-card-key"
            />
          </div>
          <Button
            type="button"
            onClick={handleSaveCardKey}
            disabled={!cardDirty || savingCardKey}
            className="h-11 px-8 rounded-none bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {savingCardKey ? (
              <Loader2 size={14} className="animate-spin mr-2" />
            ) : null}
            保存
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
