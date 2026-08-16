import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 编辑器内视频块：显示原生播放器预览 + 左上角删除按钮。
 */
export function VideoBlock(props: NodeViewProps) {
  const { node, selected, deleteNode } = props;
  const src = (node.attrs.src as string) || "";

  return (
    <NodeViewWrapper
      className={cn(
        "group/video relative my-3 rounded-lg border border-transparent",
        selected && "border-primary",
      )}
      contentEditable={false}
    >
      <video
        src={src}
        controls
        preload="metadata"
        className="w-full h-auto rounded-lg"
      />
      {selected && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            deleteNode();
          }}
          aria-label="删除视频"
          className="absolute -top-2.5 -left-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:bg-red-600"
        >
          <X size={14} />
        </button>
      )}
    </NodeViewWrapper>
  );
}

/**
 * 编辑器内 iframe 块（B 站/外链）：16:9 预览 + 左上角删除按钮。
 */
export function IframeBlock(props: NodeViewProps) {
  const { node, selected, deleteNode } = props;
  const src = (node.attrs.src as string) || "";

  return (
    <NodeViewWrapper
      className={cn(
        "group/iframe relative my-3 rounded-lg border border-transparent",
        selected && "border-primary",
      )}
      contentEditable={false}
    >
      <div className="aspect-video w-full overflow-hidden rounded-lg bg-black/5">
        <iframe
          src={src}
          title="嵌入式内容"
          className="h-full w-full"
          frameBorder="0"
          allowFullScreen
          loading="lazy"
        />
      </div>
      {selected && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            deleteNode();
          }}
          aria-label="删除嵌入"
          className="absolute -top-2.5 -left-2.5 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-red-500 text-white shadow-md hover:bg-red-600"
        >
          <X size={14} />
        </button>
      )}
    </NodeViewWrapper>
  );
}
