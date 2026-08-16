export function getContentTypeFromKey(key: string): string | undefined {
  const extension = key.split(".").pop()?.toLowerCase();
  const contentTypes: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    svg: "image/svg+xml",
    avif: "image/avif",
    mp4: "video/mp4",
  };
  return contentTypes[extension || ""];
}

export function generateKey(fileName: string): string {
  const uuid = crypto.randomUUID();
  const extension = fileName.split(".").pop()?.toLowerCase() || "bin";

  return `${uuid}.${extension}`;
}

/**
 * 从图片 URL 中提取 R2 key
 * 支持格式：
 * - /images/${key}
 * - /images/${key}?quality=80&format=webp
 * - https://domain.com/images/${key}?quality=80
 */
export function extractImageKey(src: string): string | undefined {
  if (!src) return undefined;

  const prefix = "/images/";
  let pathname = "";

  try {
    // 尝试解析为 URL
    const url = new URL(src, "http://dummy.com"); // 传入 base 确保相对路径也能被解析
    pathname = url.pathname;
  } catch {
    // 极少数情况解析失败，手动截断 query
    pathname = src.split("?")[0];
  }

  if (pathname.startsWith(prefix)) {
    return pathname.replace(prefix, "");
  }
  return undefined;
}

/**
 * 生成优化后的图片 URL
 * @param key - R2 key
 * @param width - 可选的宽度限制
 */
export function getOptimizedImageUrl(key: string, width?: number) {
  return `/images/${key}?quality=80${width ? `&width=${width}` : ""}`;
}

export function buildTransformOptions(
  searchParams: URLSearchParams,
  accept: string,
) {
  const transformOptions: Record<string, unknown> = { quality: 80 };

  if (searchParams.has("width")) {
    const width = Number.parseInt(searchParams.get("width")!, 10);
    if (!Number.isNaN(width) && width > 0) transformOptions.width = width;
  }
  if (searchParams.has("height")) {
    const height = Number.parseInt(searchParams.get("height")!, 10);
    if (!Number.isNaN(height) && height > 0) transformOptions.height = height;
  }
  if (searchParams.has("quality")) {
    const quality = Number.parseInt(searchParams.get("quality")!, 10);
    if (!Number.isNaN(quality) && quality > 0 && quality <= 100)
      transformOptions.quality = quality;
  }
  if (searchParams.has("fit")) transformOptions.fit = searchParams.get("fit");

  if (/image\/avif/.test(accept)) {
    transformOptions.format = "avif";
  } else if (/image\/webp/.test(accept)) {
    transformOptions.format = "webp";
  }

  return transformOptions;
}

export interface WatermarkConfig {
  enabled: boolean;
  type: "text" | "image";
  text?: string | null;
  textColor?: string | null;
  textSize?: number | null;
  imageUrl?: string | null;
  opacity?: number | null;
  scale?: number | null;
  position?: string | null;
}

/** 文字水印 SVG：转义 XML 特殊字符，防止注入非法 SVG */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** 文字水印 SVG 对外暴露的固定路径（必须是可公开访问的绝对 URL，Cloudflare 才能取到） */
export const WATERMARK_SVG_PATH = "/watermark.svg";

/**
 * 生成文字水印的 SVG 源码。
 * 尺寸按文字长度与字号推算，保证宽高比正确（Cloudflare 不缩放 SVG，
 * 所以内在尺寸要直接可用）。
 */
export function buildWatermarkSvg(
  watermark: WatermarkConfig | null | undefined,
): string | undefined {
  const raw = watermark?.text?.trim();
  if (!raw) return undefined;

  const text = escapeXml(raw);
  const color = watermark?.textColor ?? "rgba(255,255,255,0.6)";
  const fontSize = watermark?.textSize ?? 36;

  // 中文字符约占 1 个字宽，西文约 0.6，取加权估算避免文字被裁切
  const cjkCount = (raw.match(/[\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/g) || [])
    .length;
  const asciiCount = raw.length - cjkCount;
  const textWidth = Math.ceil(cjkCount * fontSize + asciiCount * fontSize * 0.6);

  const padding = Math.ceil(fontSize * 0.5);
  const width = textWidth + padding * 2;
  const height = Math.ceil(fontSize * 1.5);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><text x="50%" y="50%" fill="${color}" font-size="${fontSize}" font-weight="bold" text-anchor="middle" dominant-baseline="central" font-family="sans-serif">${text}</text></svg>`;
}

/**
 * 把后台的 position 枚举翻译成 Cloudflare draw 的边距偏移。
 * 注意：Cloudflare 的 draw **没有** position 参数，只认 top/left/bottom/right；
 * 且不能同时设置 left+right 或 top+bottom（会直接报错）。不设偏移即为居中。
 */
function positionToOffsets(
  position: string,
  pad: number,
): Record<string, number> {
  switch (position) {
    case "center":
      return {};
    case "north":
      return { top: pad };
    case "south":
      return { bottom: pad };
    case "east":
      return { right: pad };
    case "west":
      return { left: pad };
    case "northeast":
      return { top: pad, right: pad };
    case "northwest":
      return { top: pad, left: pad };
    case "southwest":
      return { bottom: pad, left: pad };
    default:
      return { bottom: pad, right: pad };
  }
}

/**
 * 根据后台水印配置生成 Cloudflare Image Resizing 的 draw 参数。
 * - 文字水印：指向本站 /watermark.svg（必须是绝对 URL，data: URI 不被支持）
 * - 图片水印：引用水印图 URL（R2 asset 或外链），推荐 PNG/WebP
 * 返回 undefined 表示无需加水印。
 *
 * Cloudflare draw 支持的参数只有：url / width / height / repeat /
 * top / left / bottom / right / opacity / composite / fit / gravity。
 * 传入非法参数会导致整个变换请求失败（进而降级成无水印原图）。
 */
export function buildWatermarkDraw(
  watermark: WatermarkConfig | null | undefined,
  origin: string,
): Array<Record<string, unknown>> | undefined {
  if (!watermark?.enabled) return undefined;

  // scale 语义 = 相对底图宽度的比例，对应 Cloudflare draw 的 width 小数值（0-1）
  const width = watermark.scale ?? 0.2;
  const base: Record<string, unknown> = {
    opacity: watermark.opacity ?? 0.5,
    width,
    fit: "contain",
    ...positionToOffsets(watermark.position ?? "southeast", 16),
  };

  // 图片水印
  if (watermark.type === "image" && watermark.imageUrl) {
    const url = watermark.imageUrl.startsWith("/")
      ? `${origin}${watermark.imageUrl}`
      : watermark.imageUrl;
    return [{ ...base, url }];
  }

  // 文字水印：走本站公开的 SVG 路由（带 v 参数，配置变更后可击穿 CDN 缓存）
  if (watermark.type === "text" && watermark.text?.trim()) {
    const version = watermarkVersion(watermark);
    return [{ ...base, url: `${origin}${WATERMARK_SVG_PATH}?v=${version}` }];
  }

  return undefined;
}

/** 水印文字配置的短哈希，用于给 /watermark.svg 加版本号击穿缓存 */
export function watermarkVersion(
  watermark: WatermarkConfig | null | undefined,
): string {
  const seed = [
    watermark?.text ?? "",
    watermark?.textColor ?? "",
    String(watermark?.textSize ?? ""),
  ].join("|");

  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}
