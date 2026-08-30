import { Search, X, icons } from "lucide-react";
import { useMemo, useState } from "react";
import type { ComponentType } from "react";
import { Input } from "@/components/ui/input";

const ICON_NAMES = Object.keys(icons) as string[];

type IconComponent = ComponentType<{
  size?: number | string;
  strokeWidth?: number | string;
}>;

interface IconPickerProps {
  onSelect: (name: string) => void;
  onClose: () => void;
}

/**
 * 图标库选择器：列出 lucide 全部图标，支持搜索，点击即选中。
 * 用于悬浮窗工具栏按钮的图标选择（iconName 字段）。
 */
export function IconPicker({ onSelect, onClose }: IconPickerProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ICON_NAMES;
    return ICON_NAMES.filter((n) => n.toLowerCase().includes(q));
  }, [query]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border p-3">
          <Search size={16} className="shrink-0 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索图标，如 mail / user / message"
            autoFocus
            className="h-9 flex-1"
          />
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-accent/10"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>
        <div className="grid grid-cols-5 gap-1 overflow-y-auto p-3 sm:grid-cols-7 md:grid-cols-8">
          {filtered.slice(0, 500).map((name) => {
            const Icon = (icons as Record<string, IconComponent>)[name];
            return (
              <button
                key={name}
                type="button"
                onClick={() => onSelect(name)}
                title={name}
                className="flex flex-col items-center gap-1 rounded-lg border border-transparent p-2 hover:border-(--fuwari-primary) hover:bg-accent/10"
              >
                <Icon size={20} strokeWidth={1.75} />
                <span className="w-full truncate text-center text-[10px] leading-tight text-muted-foreground">
                  {name}
                </span>
              </button>
            );
          })}
          {filtered.length === 0 ? (
            <div className="col-span-full py-10 text-center text-sm text-muted-foreground">
              没有匹配的图标
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
