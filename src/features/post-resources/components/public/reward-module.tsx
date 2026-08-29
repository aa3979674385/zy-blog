import { useQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { getRewardConfigFn } from "@/features/config/api/reward.api";

/**
 * 前台打赏模块（文章页下载模块下方常驻展示）：
 * - 全局开关关闭 → 不显示
 * - 两种码都没上传 → 不显示
 * - 上传了哪种就显示哪种；尺寸自适应（最宽 200px，窄屏缩放）
 */
export function RewardModule() {
  const { data } = useQuery({
    queryKey: ["reward", "config"],
    queryFn: () => getRewardConfigFn(),
    staleTime: 60_000,
  });

  if (!data) return null;
  if (!data.enabled) return null;
  const codes = [data.tipCode, data.payCode].filter(
    (c): c is string => !!c,
  );
  if (codes.length === 0) return null;

  return (
    <div className="rounded-2xl bg-(--fuwari-card-bg) px-6 py-5">
      <div className="flex items-center gap-2 mb-1">
        <Heart size={15} className="text-red-500" fill="currentColor" />
        <h3 className="text-sm font-semibold text-(--fuwari-title)">
          打赏支持
        </h3>
      </div>
      <p className="text-xs text-(--fuwari-meta) mb-4">
        如果这篇文章对你有帮助，欢迎打赏支持～
      </p>
      <div className="flex flex-wrap items-center gap-4">
        {codes.map((key) => (
          <img
            key={key}
            src={`/images/${key}`}
            alt="打赏二维码"
            loading="lazy"
            className="h-auto w-full max-w-[200px] rounded-lg border border-border/20 bg-white object-contain"
          />
        ))}
      </div>
    </div>
  );
}
