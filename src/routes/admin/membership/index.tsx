import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Crown } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-4 duration-1000">
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
        在后台创建并管理 VIP 会员套餐：自定义套餐名称、说明、价格与有效期，并可随时显示 / 隐藏、编辑或删除。
      </p>

      <MembershipPlanTable
        onEdit={openEdit}
        onAdd={openAdd}
        normalDaily={normalDaily}
        onNormalDailyChange={setNormalDaily}
        onSaveNormalDaily={handleSaveNormalDaily}
        savingNormalDaily={savingNormalDaily}
        canSaveNormalDaily={normalDailyDirty}
      />

      <MembershipPlanModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        plan={editing}
      />
    </div>
  );
}
