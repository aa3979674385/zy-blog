import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Crown, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MembershipPlanModal } from "@/features/membership/components/admin/membership-plan-modal";
import { MembershipPlanTable } from "@/features/membership/components/admin/membership-plan-table";
import { systemConfigQuery } from "@/features/config/queries";
import { updateSystemConfigFn } from "@/features/config/api/config.api";
import type { MembershipPlan } from "@/lib/db/schema";

export const Route = createFileRoute("/admin/membership/")({
  ssr: "data-only",
  component: MembershipAdminPage,
  loader: () => ({ title: "会员套餐" }),
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.title }],
  }),
});

function MembershipAdminPage() {
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<MembershipPlan | null>(null);

  const { data: sysConfig } = useQuery(systemConfigQuery);
  const [normalDaily, setNormalDaily] = useState("0");
  const [savingNormalDaily, setSavingNormalDaily] = useState(false);

  useEffect(() => {
    if (sysConfig?.downloadLimit) {
      setNormalDaily(String(sysConfig.downloadLimit.normalUserDaily ?? 0));
    }
  }, [sysConfig]);

  const openAdd = () => {
    setEditing(null);
    setShowModal(true);
  };

  const openEdit = (plan: MembershipPlan) => {
    setEditing(plan);
    setShowModal(true);
  };

  const parsedNormalDaily = Number(normalDaily);
  const normalDailyValid =
    Number.isFinite(parsedNormalDaily) &&
    parsedNormalDaily >= 0 &&
    Number.isInteger(parsedNormalDaily);
  const normalDailyDirty =
    !!sysConfig?.downloadLimit &&
    normalDailyValid &&
    parsedNormalDaily !== (sysConfig.downloadLimit.normalUserDaily ?? 0);

  const handleSaveNormalDaily = async () => {
    if (!normalDailyValid) {
      toast.error("请输入非负整数");
      return;
    }
    setSavingNormalDaily(true);
    try {
      await updateSystemConfigFn({
        data: {
          downloadLimit: {
            normalUserDaily: parsedNormalDaily,
          },
        },
      });
      toast.success("已保存");
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setSavingNormalDaily(false);
    }
  };

  return (
    <div className="space-y-8 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <div className="space-y-1">
        <h1 className="text-3xl font-serif font-medium tracking-tight text-foreground flex items-center gap-3">
          <Crown size={26} className="opacity-70" />
          会员套餐
        </h1>
        <p className="text-xs font-mono tracking-widest text-muted-foreground uppercase">
          VIP Membership Plans
        </p>
      </div>

      <p className="text-sm text-muted-foreground max-w-2xl">
        在后台创建并管理 VIP 会员套餐：自定义套餐名称、说明、价格与有效期，并可随时显示 / 隐藏、编辑或删除。每个套餐可独立设置每日下载限制，用户侧的开通与支付能力可后续接入。
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Crown size={16} className="opacity-60" />
            普通用户每日下载限制
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-sm text-muted-foreground">
            设置未开通会员的普通用户每天最多可下载的不同文章篇数。各会员套餐的下载限制请在对应套餐的编辑弹窗中单独设置。
          </p>
          <div className="space-y-2">
            <label className="text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
              每日下载上限（篇）
            </label>
            <Input
              type="number"
              min={0}
              step={1}
              value={normalDaily}
              onChange={(e) => setNormalDaily(e.target.value)}
              placeholder="0"
            />
            <p className="text-xs text-muted-foreground">
              0 表示不限制。每日 0 点重置。
            </p>
          </div>
          <Button
            type="button"
            onClick={handleSaveNormalDaily}
            disabled={!normalDailyDirty || savingNormalDaily}
            className="h-11 px-8 rounded-none bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {savingNormalDaily ? (
              <Loader2 size={14} className="animate-spin mr-2" />
            ) : null}
            保存
          </Button>
        </CardContent>
      </Card>

      <MembershipPlanTable onEdit={openEdit} onAdd={openAdd} />

      <MembershipPlanModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        plan={editing}
      />
    </div>
  );
}
