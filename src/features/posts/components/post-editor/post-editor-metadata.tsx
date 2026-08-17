import {
  useRef,
  useState,
  type ChangeEvent,
  type ReactNode,
} from "react";
import { Image as ImageIcon, Loader2, Pin, PinOff, Sparkles, Upload, X } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";
import { toast } from "sonner";
import { uploadImageWithWatermark } from "@/features/media/utils/upload-with-watermark.client";
import { MediaPickerModal } from "@/features/media/components/media-library/media-picker-modal";
import DatePicker from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { CategorySelector } from "@/features/categories/components/category-selector";
import { TagSelector } from "@/features/tags/components/tag-selector";
import { POST_STATUSES } from "@/lib/db/schema";
import { toLocalDateString } from "@/lib/utils";
import { m } from "@/paraglide/messages";
import type { PostEditorData } from "./types";

const STATUS_LABELS: Record<PostEditorData["status"], () => string> = {
  draft: m.editor_status_draft,
  published: m.editor_status_published,
};

interface PostEditorMetadataProps {
  post: PostEditorData;
  isGeneratingSlug: boolean;
  isCalculatingReadTime: boolean;
  isGeneratingSummary: boolean;
  isGeneratingTags: boolean;
  onPostChange: (updates: Partial<PostEditorData>) => void;
  onGenerateSlug: () => void;
  onCalculateReadTime: () => void;
  onGenerateSummary: () => void;
  onGenerateTags: () => void;
}

/** 文章标题：保留在编辑区正文上方，不进入侧边栏 */
export function PostEditorTitle({
  post,
  onPostChange,
}: {
  post: PostEditorData;
  onPostChange: (updates: Partial<PostEditorData>) => void;
}) {
  return (
    <div className="mb-6">
      <TextareaAutosize
        value={post.title}
        onChange={(e) => onPostChange({ title: e.target.value })}
        minRows={1}
        placeholder={m.editor_title_placeholder()}
        className="w-full resize-none overflow-hidden border-none bg-transparent p-0 text-xl font-medium leading-snug tracking-tight text-foreground transition-all placeholder:text-muted-foreground/30 focus:outline-none"
      />
    </div>
  );
}

/** 侧边栏模块卡片容器 */
function MetadataSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="border border-border/30 bg-background/40 p-4">
      <h3 className="mb-3 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
      {children}
    </label>
  );
}

export function PostEditorMetadata({
  post,
  isGeneratingSlug,
  isCalculatingReadTime,
  isGeneratingSummary,
  isGeneratingTags,
  onPostChange,
  onGenerateSlug,
  onCalculateReadTime,
  onGenerateSummary,
  onGenerateTags,
}: PostEditorMetadataProps) {
  const [isCoverUploading, setIsCoverUploading] = useState(false);
  const [coverPickerOpen, setCoverPickerOpen] = useState(false);
  const coverFileRef = useRef<HTMLInputElement>(null);

  const handleCoverFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCoverUploading(true);
    try {
      const res = await uploadImageWithWatermark(file);
      if (res.error) {
        throw new Error(typeof res.error === "string" ? res.error : "上传失败");
      }
      const url = res.data?.url;
      if (url) {
        onPostChange({ coverImage: url });
        toast.success("封面图已上传");
      } else {
        toast.error("上传失败，未返回图片地址");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "封面图上传失败，可重试或手动粘贴链接",
      );
    } finally {
      setIsCoverUploading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-6">
      {/* 模块 1：发布设置 */}
      <MetadataSection title="发布设置">
        <div className="space-y-2">
          <FieldLabel>{m.editor_meta_status()}</FieldLabel>
          <div className="flex items-center gap-4">
            {POST_STATUSES.map((status) => (
              <button
                key={status}
                onClick={() =>
                  onPostChange(
                    status === "published" && !post.publishedAt
                      ? { status, publishedAt: new Date() }
                      : { status },
                  )
                }
                className={`
                  text-[10px] font-mono uppercase tracking-wider transition-colors
                  ${
                    post.status === status
                      ? "border-b border-foreground font-bold text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }
                `}
              >
                {STATUS_LABELS[status]()}
              </button>
            ))}
          </div>
        </div>

        {post.status === "published" && (
          <div className="space-y-2">
            <FieldLabel>{m.editor_meta_pin()}</FieldLabel>
            <button
              onClick={() =>
                onPostChange({
                  pinnedAt: post.pinnedAt ? null : new Date(),
                })
              }
              className={`
                flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider transition-colors
                ${
                  post.pinnedAt
                    ? "border-b border-foreground font-bold text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }
              `}
            >
              {post.pinnedAt ? <Pin size={12} /> : <PinOff size={12} />}
              {post.pinnedAt ? m.editor_meta_pinned() : m.editor_meta_unpinned()}
            </button>
          </div>
        )}

        <div className="space-y-2">
          <FieldLabel>{m.editor_meta_published_at()}</FieldLabel>
          <div className="text-xs font-mono">
            <DatePicker
              value={
                post.publishedAt ? toLocalDateString(post.publishedAt) : ""
              }
              onChange={(dateStr) =>
                onPostChange({
                  publishedAt: dateStr ? new Date(`${dateStr}T12:00:00Z`) : null,
                })
              }
              className="h-auto! border-none! bg-transparent! p-0! text-xs text-foreground font-mono"
            />
          </div>
        </div>

        <div className="space-y-2">
          <FieldLabel>{m.editor_meta_read_time()}</FieldLabel>
          <div className="group flex items-center gap-2">
            <Input
              type="number"
              value={post.readTimeInMinutes}
              onChange={(e) =>
                onPostChange({
                  readTimeInMinutes: Number.parseInt(e.target.value) || 0,
                })
              }
              className="h-auto w-12 border-none bg-transparent p-0 px-0 text-xs font-mono text-foreground shadow-none focus-visible:ring-0"
            />
            <span className="text-[10px] font-mono text-muted-foreground">
              {m.editor_meta_minutes()}
            </span>
            <button
              onClick={onCalculateReadTime}
              disabled={isCalculatingReadTime}
              className="ml-2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
            >
              {isCalculatingReadTime ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <Sparkles size={10} />
              )}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <FieldLabel>亲自测试</FieldLabel>
          <div className="flex items-center gap-4">
            {([1, 0] as const).map((val) => (
              <button
                key={String(val)}
                type="button"
                onClick={() => onPostChange({ isTested: val })}
                className={`
                  text-[10px] font-mono uppercase tracking-wider transition-colors
                  ${
                    post.isTested === val
                      ? "border-b border-foreground font-bold text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }
                `}
              >
                {val === 1 ? "已测试" : "未测试"}
              </button>
            ))}
          </div>
        </div>
      </MetadataSection>

      {/* 模块 2：链接 · 分类 · 标签 */}
      <MetadataSection title="链接 · 分类 · 标签">
        <div className="space-y-2">
          <FieldLabel>{m.editor_meta_slug()}</FieldLabel>
          <div className="group flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">/post/</span>
            <Input
              type="text"
              value={post.slug || ""}
              onChange={(e) => onPostChange({ slug: e.target.value })}
              className="h-auto flex-1 border-none bg-transparent p-0 px-0 text-xs font-mono text-foreground shadow-none placeholder:text-muted-foreground/30 focus-visible:ring-0"
              placeholder="your-post-slug"
            />
            <button
              onClick={onGenerateSlug}
              disabled={isGeneratingSlug}
              className="ml-2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground"
            >
              {isGeneratingSlug ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <Sparkles size={10} />
              )}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <FieldLabel>{m.editor_meta_tags()}</FieldLabel>
            <button
              onClick={onGenerateTags}
              disabled={isGeneratingTags}
              className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground transition-colors hover:text-foreground"
            >
              {isGeneratingTags ? (
                <Loader2 size={8} className="animate-spin" />
              ) : (
                <Sparkles size={8} />
              )}
              {m.editor_meta_auto_generate()}
            </button>
          </div>
          <TagSelector value={post.tagIds} onChange={(tagIds) => onPostChange({ tagIds })} />
        </div>

        <div className="space-y-2">
          <FieldLabel>分类（独立，与标签解耦）</FieldLabel>
          <CategorySelector
            value={post.categoryIds}
            onChange={(categoryIds) => onPostChange({ categoryIds })}
          />
        </div>
      </MetadataSection>

      {/* 模块 3：摘要 · 封面 */}
      <MetadataSection title="摘要 · 封面">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <FieldLabel>{m.editor_meta_summary()}</FieldLabel>
            <button
              onClick={onGenerateSummary}
              disabled={isGeneratingSummary}
              className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground transition-colors hover:text-foreground"
            >
              {isGeneratingSummary ? (
                <Loader2 size={8} className="animate-spin" />
              ) : (
                <Sparkles size={8} />
              )}
              {m.editor_meta_auto_generate()}
            </button>
          </div>
          <TextareaAutosize
            value={post.summary || ""}
            onChange={(e) => onPostChange({ summary: e.target.value })}
            placeholder={m.editor_summary_placeholder()}
            className="w-full resize-none bg-transparent text-xs font-mono leading-relaxed text-foreground placeholder:text-muted-foreground/30 focus:outline-none"
          />
        </div>

        {/* 封面图：留空时由后端自动从正文第一张尺寸足够的图抓取 */}
        <div className="space-y-2">
          <FieldLabel>封面图（留空自动取正文首图）</FieldLabel>
          {post.coverImage ? (
            <div className="relative inline-block">
              <img
                src={post.coverImage}
                alt="封面预览"
                className="h-24 w-40 rounded object-cover"
              />
              <button
                type="button"
                onClick={() => onPostChange({ coverImage: null })}
                className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80"
                aria-label="清除封面"
              >
                <X size={12} />
              </button>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={post.coverImage ?? ""}
              onChange={(e) =>
                onPostChange({ coverImage: e.target.value.trim() || null })
              }
              placeholder="粘贴图片链接（支持外链）"
              className="h-auto flex-1 border-none bg-transparent p-0 px-0 text-xs font-mono text-foreground shadow-none placeholder:text-muted-foreground/30 focus-visible:ring-0"
            />
            <input
              ref={coverFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCoverFileChange}
            />
            <button
              type="button"
              onClick={() => coverFileRef.current?.click()}
              disabled={isCoverUploading}
              className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              {isCoverUploading ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <Upload size={10} />
              )}
              上传
            </button>
            <button
              type="button"
              onClick={() => setCoverPickerOpen(true)}
              className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              <ImageIcon size={10} />
              媒体库
            </button>
          </div>
        </div>
      </MetadataSection>

      {/* 从媒体库选择封面图 */}
      <MediaPickerModal
        open={coverPickerOpen}
        types="image"
        onClose={() => setCoverPickerOpen(false)}
        onSelect={(media) => {
          onPostChange({ coverImage: media.url });
          toast.success(`已设置封面图「${media.fileName}」`);
        }}
      />
    </div>
  );
}
