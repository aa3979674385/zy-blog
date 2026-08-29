import { useEffect, useState, type ComponentType } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { CommentEditorProps } from "./comment-editor";

/**
 * 评论编辑器的异步挂载包装。
 *
 * 背景：comment-editor.tsx 引用了 TipTap / ProseMirror / KaTeX 等富文本编辑器
 * 全家桶，若被静态 import，Vite 会把它们全部打进全站共享的入口 chunk
 * （线上实测入口 JS 达 1.98MB / br 585KB），导致首页/列表页等不需要编辑器的
 * 页面也要下载这份代码 —— 弱网下首屏 JS 加载 10+ 秒，期间 React 未水合，
 * 导航等所有交互无响应（CS1 线上「首次打开导航要等十几秒」的根因）。
 *
 * 这里把编辑器改为「水合完成后按需加载」：
 * - SSR 与客户端首帧都渲染骨架（两端一致，不会水合 mismatch）；
 * - useEffect 之后再动态 import 编辑器 chunk，TipTap 从首屏依赖图中移除；
 * - 只在登录用户看到评论框 / 点击回复时才真正下载编辑器代码。
 */
export function AsyncCommentEditor(props: CommentEditorProps) {
  const [Editor, setEditor] = useState<ComponentType<CommentEditorProps> | null>(
    null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    import("./comment-editor")
      .then((mod) => {
        if (!cancelled) setEditor(() => mod.FuwariCommentEditor);
      })
      .catch((error) => {
        // 编辑器 chunk 加载失败：不阻塞页面，给出重试入口
        console.error("[AsyncCommentEditor] 评论编辑器加载失败", error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (Editor) {
    return <Editor {...props} />;
  }

  if (failed) {
    return (
      <div className="flex h-32 items-center justify-center rounded-(--fuwari-radius-large) border border-(--fuwari-input-border) fuwari-text-50 text-sm">
        编辑器加载失败
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setEditor(null);
            import("./comment-editor")
              .then((mod) => setEditor(() => mod.FuwariCommentEditor))
              .catch(() => setFailed(true));
          }}
          className="ml-3 text-(--fuwari-primary) hover:underline"
        >
          重试
        </button>
      </div>
    );
  }

  return <Skeleton className="h-40 w-full rounded-(--fuwari-radius-large)" />;
}
