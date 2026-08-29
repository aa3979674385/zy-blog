import { useEffect, useRef, useState, type ChangeEvent } from "react";
import type { PostsPageProps } from "@/features/theme/contract/pages";
import type {
  PostSortDirection,
  PostSortField,
} from "@/features/posts/schema/posts.schema";
import { ArrowUpDown, Check, Folder } from "lucide-react";
import { m } from "@/paraglide/messages";
import { cn } from "@/lib/utils";
import { Pagination } from "@/features/theme/components/pagination";
import { GridPostCard } from "../../components/grid-post-card";

/** 排序选项（与后端 POST_SORT_FIELDS 对应） */
const SORT_OPTIONS: Array<{
  value: string;
  label: string;
  sortBy: PostSortField;
  sortDir: PostSortDirection;
}> = [
  { value: "publishedAt:desc", label: "最新发布", sortBy: "publishedAt", sortDir: "desc" },
  { value: "updatedAt:desc", label: "最近更新", sortBy: "updatedAt", sortDir: "desc" },
  { value: "publishedAt:asc", label: "最早发布", sortBy: "publishedAt", sortDir: "asc" },
  { value: "title:asc", label: "标题 A→Z", sortBy: "title", sortDir: "asc" },
];

function SortDropdown({
  value,
  options,
  onChange,
}: {
  value: string;
  options: typeof SORT_OPTIONS;
  onChange: (e: ChangeEvent<HTMLSelectElement>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = (nextValue: string) => {
    setOpen(false);
    // 复用原 select 的事件接口，保持 PostsPage 改动最小
    onChange({ target: { value: nextValue } } as ChangeEvent<HTMLSelectElement>);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fuwari-card-base flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-(--fuwari-title) outline-none transition hover:border-(--fuwari-primary)"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <ArrowUpDown size={14} className="text-(--fuwari-meta)" />
        {current?.label}
      </button>
      {open && (
        <div className="fuwari-card-base absolute right-0 z-20 mt-2 min-w-[9rem] overflow-hidden rounded-xl border py-1 shadow-lg">
          {options.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={cn(
                  "flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition",
                  active
                    ? "bg-(--fuwari-primary)/10 text-(--fuwari-primary)"
                    : "text-(--fuwari-title) hover:bg-(--fuwari-primary)/5",
                )}
                role="option"
                aria-selected={active}
              >
                {opt.label}
                {active && <Check size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function PostsPage({
  posts,
  page,
  totalPages,
  totalCount = 0,
  onPageChange,
  sortBy = "publishedAt",
  sortDir = "desc",
  onSortChange,
  categoryName,
  selectedTag,
  uncategorized,
}: PostsPageProps) {
  // 前台文章列表排序按钮暂时关闭（保留代码：恢复时改回 true 并恢复 SortDropdown 渲染）
  const SORT_ENABLED = false;
  const currentSortValue = `${sortBy}:${sortDir}`;

  // 头部标题：分类名 > 标签 > 未分类 > 全部文章
  const listTitle = categoryName
    ? categoryName
    : selectedTag
      ? `标签：${selectedTag}`
      : uncategorized
        ? "未分类"
        : "全部文章";

  const handleSortChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const opt = SORT_OPTIONS.find((o) => o.value === e.target.value);
    if (opt && onSortChange) {
      onSortChange(opt.sortBy, opt.sortDir);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 标题横栏：图标 + 分类名 + · + 共 N 篇 + 排序（合并为一行） */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-(--fuwari-card-bg) px-5 py-4">
        <Folder className="shrink-0 text-(--fuwari-primary)" size={22} />
        <h1 className="text-lg font-semibold text-(--fuwari-title)">
          {listTitle}
        </h1>
        <span className="text-(--fuwari-meta)">·</span>
        <span className="text-sm text-(--fuwari-meta)">共 {totalCount} 篇</span>
        {SORT_ENABLED && (
          <div className="ml-auto">
            <SortDropdown
              value={currentSortValue}
              options={SORT_OPTIONS}
              onChange={handleSortChange}
            />
          </div>
        )}
      </div>

      {posts.length > 0 ? (
        <>
          {/* 文章网格卡片排列（与首页一致） */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
            {posts.map((post) => (
              <GridPostCard key={post.slug} post={post} />
            ))}
          </div>
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={onPageChange}
          />
        </>
      ) : (
        <div className="fuwari-card-base w-full px-8 py-12 text-center text-sm fuwari-text-50">
          {m.posts_no_posts()}
        </div>
      )}
    </div>
  );
}
