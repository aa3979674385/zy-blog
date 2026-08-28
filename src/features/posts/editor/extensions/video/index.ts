import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { VideoBlock, IframeBlock } from "./blocks";

/**
 * 上传视频节点（MP4）：编辑器内渲染 <video controls> 预览，
 * 前台渲染为自适应宽度的原生播放器（横竖屏自动适配）。
 */
export const VideoNode = Node.create({
  name: "video",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "video" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      mergeAttributes(HTMLAttributes, {
        controls: "true",
        preload: "metadata",
        class: "w-full h-auto rounded-lg",
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoBlock);
  },

  addCommands() {
    return {
      insertVideo:
        (src: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { src },
          });
        },
    };
  },
});

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    video: {
      insertVideo: (src: string) => ReturnType;
    };
    iframe: {
      insertIframe: (src: string) => ReturnType;
    };
  }
}

/**
 * 嵌入节点（B 站 / 外链）：渲染 16:9 自适应 iframe 容器。
 */
export const IframeNode = Node.create({
  name: "iframe",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "iframe" }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      { class: "aspect-video w-full rounded-lg overflow-hidden" },
      [
        "iframe",
        mergeAttributes(HTMLAttributes, {
          class: "w-full h-full",
          frameborder: "0",
          allowfullscreen: "true",
          loading: "lazy",
        }),
      ],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(IframeBlock);
  },

  addCommands() {
    return {
      insertIframe:
        (src: string) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: { src },
          });
        },
    };
  },
});
