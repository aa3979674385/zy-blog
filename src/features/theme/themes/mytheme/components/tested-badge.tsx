import { CheckCircle2, CircleDashed } from "lucide-react";

/**
 * 文章「亲自测试」状态徽章。
 * - 已测试（is_tested === 1）：蓝色调
 * - 未测试（is_tested === 0）：灰色调
 * 列迁移执行前可能为 undefined/null，此时不渲染（兜底，避免旧数据/缓存误显示）。
 */
export function TestedBadge({ tested }: { tested?: number | null }) {
  if (tested === undefined || tested === null) return null;
  return tested === 1 ? (
    <span className="inline-flex items-center gap-1 rounded-md bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-400">
      <CheckCircle2 size={11} strokeWidth={2} />
      已测试
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-1.5 py-0.5 text-[11px] font-medium text-zinc-500 dark:bg-zinc-500/15 dark:text-zinc-400">
      <CircleDashed size={11} strokeWidth={2} />
      未测试
    </span>
  );
}
