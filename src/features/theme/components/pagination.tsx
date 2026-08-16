import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

function generatePageItems(
  current: number,
  total: number,
): Array<number | "ellipsis"> {
  // 最多显示 5 个槽位（含省略号），避免手机端横向溢出出现滚动滑块
  if (total <= 5) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  if (current <= 3) {
    return [1, 2, 3, "ellipsis", total];
  }

  if (current >= total - 2) {
    return [1, "ellipsis", total - 2, total - 1, total];
  }

  return [1, "ellipsis", current, current + 1, "ellipsis", total];
}

/**
 * 分页组件（仿 zy 站 WordPress 主题的紧凑样式）：
 * - 紧凑小页码（h-8），当前页主题色高亮，省略号用 …
 * - 上一页/下一页为图标（手机）或「上一页/下一页」文字（桌面）
 * - 跳转框：窄输入框 + 「跳转」+ 双箭头，内联紧凑
 * - 容器 flex-nowrap 永不换行，极窄时横向滚动
 */
export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
}: PaginationProps) {
  const [jumpValue, setJumpValue] = useState("");
  const [jumpFocused, setJumpFocused] = useState(false);

  if (totalPages <= 1) return null;

  const items = generatePageItems(currentPage, totalPages);

  const handleJump = () => {
    const page = Number(jumpValue);
    if (!Number.isNaN(page) && page >= 1 && page <= totalPages) {
      onPageChange(page);
      setJumpValue("");
    }
  };

  return (
    <nav
      aria-label="分页"
      className="flex flex-nowrap items-center justify-center gap-1 py-6 max-w-full"
    >
      {/* 上一页 */}
      <button
        type="button"
        disabled={currentPage <= 1}
        onClick={() => onPageChange(currentPage - 1)}
        aria-label="上一页"
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-sm fuwari-text-75 transition",
          currentPage <= 1
            ? "cursor-not-allowed fuwari-text-50 opacity-40"
            : "hover:bg-(--fuwari-card-bg) hover:text-(--fuwari-primary)",
        )}
      >
        <ChevronLeft size={14} />
        <span className="hidden sm:inline">上一页</span>
      </button>

      {/* 页码 */}
      {items.map((item, idx) => {
        if (item === "ellipsis") {
          return (
            <span
              key={`ellipsis-${idx}`}
              className="shrink-0 px-1 text-sm fuwari-text-50"
            >
              …
            </span>
          );
        }

        const isActive = item === currentPage;
        return (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "inline-flex h-8 min-w-8 shrink-0 items-center justify-center rounded-md px-2 text-sm transition",
              isActive
                ? "bg-(--fuwari-primary) font-medium text-white"
                : "fuwari-text-75 hover:bg-(--fuwari-card-bg) hover:text-(--fuwari-primary)",
            )}
          >
            {item}
          </button>
        );
      })}

      {/* 下一页 */}
      <button
        type="button"
        disabled={currentPage >= totalPages}
        onClick={() => onPageChange(currentPage + 1)}
        aria-label="下一页"
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1 rounded-md px-2 text-sm fuwari-text-75 transition",
          currentPage >= totalPages
            ? "cursor-not-allowed fuwari-text-50 opacity-40"
            : "hover:bg-(--fuwari-card-bg) hover:text-(--fuwari-primary)",
        )}
      >
        <span className="hidden sm:inline">下一页</span>
        <ChevronRight size={14} />
      </button>

      {/* 跳转：占位文字用覆盖层实现（聚焦即消失，输入也不挡），颜色更浅 */}
      <div className="ml-1 flex shrink-0 items-center gap-0.5 rounded-md bg-(--fuwari-card-bg) py-1 pl-2 pr-1">
        <div className="relative flex h-6 w-9 items-center justify-center">
          {/* 背景提示文字：未聚焦且空值时显示；点击（聚焦）立即消失 */}
          {!jumpFocused && jumpValue === "" && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs fuwari-text-50 opacity-70"
            >
              跳转
            </span>
          )}
          <input
            type="text"
            inputMode="numeric"
            value={jumpValue}
            onChange={(e) => setJumpValue(e.target.value.replace(/\D/g, ""))}
            onFocus={() => setJumpFocused(true)}
            onBlur={() => setJumpFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleJump();
            }}
            aria-label="跳转页码"
            className="relative h-6 w-9 rounded border border-(--fuwari-input-border) bg-transparent px-1 text-center text-xs text-(--fuwari-btn-content) outline-none focus:border-(--fuwari-primary)"
          />
        </div>
        <button
          type="button"
          onClick={handleJump}
          aria-label="跳转到指定页"
          className="flex h-6 w-5 items-center justify-center rounded fuwari-text-50 transition hover:bg-black/5 hover:text-(--fuwari-primary) dark:hover:bg-white/10"
        >
          <ChevronRight size={13} />
          <ChevronRight size={13} className="-ml-2.5" />
        </button>
      </div>
    </nav>
  );
}
