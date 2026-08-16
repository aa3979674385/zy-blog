import type { JSONContent } from "@tiptap/react";
import { renderToReactElement } from "@tiptap/static-renderer/pm/react";
import { MathFormula } from "@/components/content/math-formula";
import { extensions } from "@/features/posts/editor/config";
import { CodeBlock } from "@theme/components/content/code-block";
import { ImageDisplay } from "@theme/components/content/image-display";

export function renderReact(content: JSONContent) {
  return renderToReactElement({
    extensions,
    content,
    options: {
      nodeMapping: {
        image: ({ node }) => {
          const attrs = node.attrs as {
            src: string;
            alt?: string | null;
            width?: number | string;
            height?: number | string;
          };

          const alt =
            (attrs.alt && attrs.alt !== "null" ? attrs.alt : null) ||
            "blog image";

          const width =
            typeof attrs.width === "string"
              ? parseInt(attrs.width)
              : attrs.width;
          const height =
            typeof attrs.height === "string"
              ? parseInt(attrs.height)
              : attrs.height;

          return (
            <ImageDisplay
              src={attrs.src}
              alt={alt}
              width={width || undefined}
              height={height || undefined}
            />
          );
        },
        codeBlock: ({ node }) => {
          const code = node.textContent || "";
          const attrs = node.attrs as {
            language?: string | null;
            highlightedHtml?: string;
          };

          return (
            <CodeBlock
              code={code}
              language={attrs.language || null}
              highlightedHtml={attrs.highlightedHtml}
            />
          );
        },
        tableCell: ({ node, children }) => {
          const attrs = node.attrs as {
            colspan?: number;
            rowspan?: number;
            colwidth?: Array<number>;
            style?: string;
          };
          return (
            <td
              colSpan={attrs.colspan}
              rowSpan={attrs.rowspan}
              style={attrs.style ? { width: attrs.style } : undefined}
            >
              {children}
            </td>
          );
        },
        tableHeader: ({ node, children }) => {
          const attrs = node.attrs as {
            colspan?: number;
            rowspan?: number;
            colwidth?: Array<number>;
            style?: string;
          };
          return (
            <th
              colSpan={attrs.colspan}
              rowSpan={attrs.rowspan}
              style={attrs.style ? { width: attrs.style } : undefined}
            >
              {children}
            </th>
          );
        },
        inlineMath: ({ node }) => {
          const latex = (node.attrs as { latex?: string }).latex ?? "";
          return <MathFormula latex={latex} mode="inline" />;
        },
        blockMath: ({ node }) => {
          const latex = (node.attrs as { latex?: string }).latex ?? "";
          return <MathFormula latex={latex} mode="block" />;
        },
        // 上传视频（MP4）：原生播放器，宽度自适应、高度按视频比例（横竖屏均无黑边）
        video: ({ node }) => {
          const src = (node.attrs as { src?: string }).src ?? "";
          if (!src) return null;
          return (
            <video
              src={src}
              controls
              preload="metadata"
              className="w-full h-auto rounded-lg"
            />
          );
        },
        // B 站 / 外链嵌入：16:9 自适应容器
        iframe: ({ node }) => {
          const src = (node.attrs as { src?: string }).src ?? "";
          if (!src) return null;
          return (
            <div className="my-4 aspect-video w-full overflow-hidden rounded-lg">
              <iframe
                src={src}
                title="嵌入式视频"
                className="h-full w-full"
                frameBorder="0"
                allowFullScreen
                loading="lazy"
              />
            </div>
          );
        },
      },
    },
  });
}
