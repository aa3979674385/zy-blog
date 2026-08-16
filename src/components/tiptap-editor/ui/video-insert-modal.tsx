import { Clapperboard, Loader2, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { uploadImageWithWatermark } from "@/features/media/utils/upload-with-watermark.client";
import { useVideoPicker } from "@/features/media/components/media-library/hooks/use-video-picker";
import { cn } from "@/lib/utils";
import { m } from "@/paraglide/messages";

type TabType = "upload" | "library" | "bilibili" | "iframe";

/** 文件大小格式化（媒体库列表展示） */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

interface VideoInsertModalProps {
  open: boolean;
  onClose: () => void;
  /** 插入上传的 MP4（src 为媒体 URL） */
  onInsertVideo: (src: string) => void;
  /** 插入嵌入（B 站 / 外链，src 为 iframe URL） */
  onInsertIframe: (src: string) => void;
}

/** 从 B 站链接提取 BV 号 */
function extractBvId(input: string): string | null {
  const m = input.match(/bilibili\.com\/video\/(BV[\w]+)/i);
  return m ? m[1] : null;
}

/** 构造 B 站播放器 iframe URL */
function buildBilibiliSrc(bv: string): string {
  return `https://player.bilibili.com/player.html?bvid=${bv}&page=1&high_quality=1&danmaku=0`;
}

export function VideoInsertModal({
  open,
  onClose,
  onInsertVideo,
  onInsertIframe,
}: VideoInsertModalProps) {
  const [tab, setTab] = useState<TabType>("upload");
  const [linkInput, setLinkInput] = useState("");
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const {
    mediaItems: videoItems,
    searchQuery,
    setSearchQuery,
    loadMore,
    hasMore,
    isLoadingMore,
    isPending,
  } = useVideoPicker();
  const observerTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = observerTarget.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, loadMore]);

  if (!open) return null;

  const reset = () => {
    setTab("upload");
    setLinkInput("");
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleUpload = async (file: File | undefined) => {
    if (!file) return;
    const isMp4 =
      file.type.startsWith("video/mp4") || /\.(mp4|m4v)$/i.test(file.name);
    if (!isMp4) {
      toast.error("仅支持 MP4 视频");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      toast.error("视频不能超过 100MB");
      return;
    }

    setUploading(true);
    try {
      const result = await uploadImageWithWatermark(file);
      if (result.error) {
        throw new Error(m.media_upload_error_db());
      }
      toast.success(m.media_upload_success({ name: file.name }));
      onInsertVideo(result.data.url);
      close();
    } catch (e) {
      console.error("video upload failed", e);
      toast.error("视频上传失败", {
        description: e instanceof Error ? e.message : "未知错误",
      });
    } finally {
      setUploading(false);
    }
  };

  const handleLinkSubmit = () => {
    const input = linkInput.trim();
    if (!input) return;

    if (tab === "bilibili") {
      const bv = extractBvId(input);
      if (!bv) {
        toast.error("无法识别 B 站视频链接，请粘贴形如 bilibili.com/video/BV1xx 的地址");
        return;
      }
      onInsertIframe(buildBilibiliSrc(bv));
      close();
      return;
    }

    // iframe 外链：直接使用输入 URL
    onInsertIframe(input);
    close();
  };

  const tabs: Array<{ key: TabType; label: string }> = [
    { key: "upload", label: "上传 MP4" },
    { key: "library", label: "媒体库" },
    { key: "bilibili", label: "B 站视频" },
    { key: "iframe", label: "外链嵌入" },
  ];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-sm"
        onClick={close}
      />
      <div className="relative w-full max-w-md bg-background border border-border shadow-2xl rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border/50 px-5 py-4">
          <h3 className="text-base font-semibold text-foreground">插入视频</h3>
          <button
            type="button"
            onClick={close}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/10 transition-colors"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border/50">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 py-2.5 text-sm font-medium transition-colors border-b-2",
                tab === t.key
                  ? "text-foreground border-primary"
                  : "text-muted-foreground border-transparent hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {tab === "upload" && (
            <div>
              <input
                ref={fileRef}
                type="file"
                accept="video/mp4"
                className="hidden"
                onChange={(e) => handleUpload(e.target.files?.[0])}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  handleUpload(e.dataTransfer.files?.[0]);
                }}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border py-10 text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-60",
                  isDragOver && "border-primary text-foreground bg-primary/5",
                )}
              >
                {uploading ? (
                  <>
                    <Loader2 size={22} className="animate-spin" />
                    <span className="text-sm">上传中…</span>
                  </>
                ) : (
                  <>
                    <Clapperboard size={26} className="opacity-70" />
                    <span className="text-sm">点击选择 MP4 视频</span>
                    <span className="text-xs opacity-60">
                      支持最大 100MB，仅 MP4 格式
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {tab === "library" && (
            <div className="flex flex-col gap-3">
              {/* 搜索已上传视频 */}
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  size={14}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索已上传的视频…"
                  className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
                />
              </div>

              {/* 视频列表 */}
              <div className="max-h-[42vh] min-h-[200px] overflow-y-auto custom-scrollbar rounded-md border border-border/50 divide-y divide-border/40">
                {isPending ? (
                  <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                    <Loader2 size={16} className="animate-spin" />
                    加载中…
                  </div>
                ) : videoItems.length === 0 ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-10 text-muted-foreground">
                    <Clapperboard size={24} className="opacity-30" />
                    <span className="text-sm">没有已上传的视频</span>
                  </div>
                ) : (
                  <div>
                    {videoItems.map((media) => (
                      <button
                        key={media.key}
                        type="button"
                        onClick={() => {
                          onInsertVideo(media.url);
                          close();
                        }}
                        className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/10"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted/20 text-muted-foreground">
                          <Clapperboard size={16} />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-sm text-foreground">
                            {media.fileName}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatBytes(media.sizeInBytes)}
                          </span>
                        </span>
                      </button>
                    ))}
                    <div
                      ref={observerTarget}
                      className="flex items-center justify-center py-3"
                    >
                      {isLoadingMore && (
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
          )}

          {tab === "bilibili" && (
            <div className="space-y-2">
              <label className="block text-xs text-muted-foreground">
                粘贴 B 站视频链接，将自动嵌入 B 站播放器
              </label>
              <input
                type="text"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLinkSubmit()}
                placeholder="https://www.bilibili.com/video/BV1xx..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
              />
            </div>
          )}

          {tab === "iframe" && (
            <div className="space-y-2">
              <label className="block text-xs text-muted-foreground">
                粘贴支持嵌入的视频链接（YouTube、Vimeo 等）
              </label>
              <input
                type="text"
                value={linkInput}
                onChange={(e) => setLinkInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLinkSubmit()}
                placeholder="https://..."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50"
              />
            </div>
          )}
        </div>

        {/* Footer：仅链接类 tab 需要「插入」按钮（上传/媒体库点击即插入） */}
        {(tab === "bilibili" || tab === "iframe") && (
          <div className="flex items-center justify-end gap-2 border-t border-border/50 px-5 py-3">
            <button
              type="button"
              onClick={close}
              className="rounded-md px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleLinkSubmit}
              disabled={!linkInput.trim()}
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              插入
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
