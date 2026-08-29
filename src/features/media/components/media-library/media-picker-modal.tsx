import { useInfiniteQuery } from "@tanstack/react-query";
import {
  Clapperboard,
  FileText,
  Image as ImageIcon,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { mediaInfiniteQueryOptions } from "@/features/media/queries";
import type { MediaAsset } from "@/features/media/components/media-library/types";
import { useDebounce } from "@/hooks/use-debounce";

interface MediaPickerModalProps {
  open: boolean;
  onClose: () => void;
  /** 选中媒体库文件后回调（url 可直接作为附件链接） */
  onSelect: (media: MediaAsset) => void;
  /** 文件类型过滤：image=仅图片 / video=仅视频 / all=全部（默认 all） */
  types?: "image" | "video" | "all";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * 通用媒体库选择弹窗：列出媒体库文件（图片缩略图 / 视频图标），
 * 支持搜索与无限滚动，可按类型过滤。供「资源下载 - 上传附件」「封面图」等场景选择已上传的文件。
 */
export function MediaPickerModal({
  open,
  onClose,
  onSelect,
  types = "all",
}: MediaPickerModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } =
    useInfiniteQuery({
      ...mediaInfiniteQueryOptions(debouncedSearch),
      enabled: open,
    });

  const mediaItems = (data?.pages.flatMap((page) => page.items) ?? []).filter(
    (m) =>
      types === "all" ||
      (types === "image" && m.mimeType.startsWith("image/")) ||
      (types === "video" && m.mimeType.startsWith("video/")),
  );

  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-100 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-md bg-background border border-border shadow-2xl rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
          <h3 className="text-base font-semibold text-foreground">
            从媒体库选择
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/10 transition-colors"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        {/* Search */}
        <div className="relative border-b border-border/40 px-5 py-3">
          <Search
            className="absolute left-8 top-1/2 -translate-y-1/2 text-muted-foreground"
            size={14}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="搜索媒体库文件…"
            className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-3 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
          />
        </div>

        {/* List */}
        <div className="max-h-[50vh] min-h-[220px] overflow-y-auto custom-scrollbar divide-y divide-border/40">
          {isPending ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              加载中…
            </div>
          ) : mediaItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
              <ImageIcon size={24} className="opacity-30" />
              <span className="text-sm">媒体库为空</span>
            </div>
          ) : (
            <div>
              {mediaItems.map((media) => (
                <button
                  key={media.key}
                  type="button"
                  onClick={() => {
                    onSelect(media);
                    onClose();
                  }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/10"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted/20 text-muted-foreground">
                    {media.mimeType.startsWith("image/") ? (
                      <img
                        src={`/images/${media.key}`}
                        alt={media.fileName}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : media.mimeType.startsWith("video/") ? (
                      <Clapperboard size={16} />
                    ) : (
                      <FileText size={16} />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm text-foreground">
                      {media.fileName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(media.sizeInBytes)} ·{" "}
                      {media.mimeType.startsWith("image/")
                        ? "图片"
                        : media.mimeType.startsWith("video/")
                          ? "视频"
                          : "文件"}
                    </span>
                  </span>
                </button>
              ))}
              <div
                ref={observerTarget}
                className="flex items-center justify-center py-3"
              >
                {isFetchingNextPage && (
                  <Loader2
                    size={14}
                    className="animate-spin text-muted-foreground"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
