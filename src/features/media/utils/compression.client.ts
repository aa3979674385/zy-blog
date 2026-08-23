/**
 * 前端图片压缩（client-only）。
 *
 * 用 Canvas 把图片缩小尺寸 + 转换格式（WebP/JPEG/PNG），减少文件体积。
 * 与水印功能完全独立，可单独开启/关闭。若两者同时开启，先压缩再加水印，
 * 这样水印画在压缩后的图上，保证清晰度。
 *
 * 安全原则：动图（GIF/APNG/动图WebP）一律跳过——Canvas 只能取首帧，
 * 压缩会把动图压成静态首帧，丢失动画。任何异常都返回原文件。
 */
import type { CompressionConfig } from "./media.utils";

/** 加载图片为 HTMLImageElement */
function loadImageEl(src: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    if (typeof src === "string") {
      img.src = src;
    } else {
      img.src = URL.createObjectURL(src);
    }
  });
}

/** 读取文件前 n 字节 */
async function peek(file: File, n: number): Promise<Uint8Array> {
  const buf = await file.slice(0, n).arrayBuffer();
  return new Uint8Array(buf);
}

/** 通过文件魔数判断真实格式 */
function detectFormat(head: Uint8Array): "gif" | "png" | "webp" | "other" {
  if (head.length >= 6 && head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46)
    return "gif";
  if (
    head.length >= 8 &&
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
    head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
  )
    return "png";
  if (
    head.length >= 12 &&
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50
  )
    return "webp";
  return "other";
}

const SCAN_LIMIT = 4 * 1024 * 1024;

/** APNG：在 chunk 结构里找 acTL */
function pngIsAnimated(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  let off = 8;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (off + 8 <= bytes.length) {
    const len = dv.getUint32(off, false);
    const type = String.fromCharCode(
      bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7],
    );
    if (type === "acTL" && len === 8) return true;
    if (type === "IDAT") return false;
    if (len + 12 > bytes.length - off) break;
    off += 8 + len + 4;
  }
  return false;
}

/** 动图 WebP：找 ANIM 或 ANMF */
function webpIsAnimated(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  let off = 12;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (off + 8 <= bytes.length) {
    const fourcc = String.fromCharCode(
      bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3],
    );
    const size = dv.getUint32(off + 4, true);
    if (fourcc === "ANIM" || fourcc === "ANMF") return true;
    if (size + 8 > bytes.length - off) break;
    off += 8 + size + (size & 1);
  }
  return false;
}

/** GIF 是否动画 */
function gifIsAnimated(bytes: Uint8Array): boolean {
  if (bytes.length < 13) return false;
  let off = 6;
  const packed = bytes[off + 4];
  const gct = packed & 0x80 ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
  off += 7 + gct;
  let frames = 0;
  let netscape = false;
  try {
    while (off < bytes.length) {
      const b = bytes[off];
      if (b === 0x3b) break;
      if (b === 0x21) {
        off += 2;
        while (off < bytes.length) {
          const len = bytes[off];
          if (len === 0) { off += 1; break; }
          if (len + 1 > bytes.length - off) break;
          const chunk = String.fromCharCode(
            bytes[off + 1], bytes[off + 2], bytes[off + 3],
            bytes[off + 4], bytes[off + 5], bytes[off + 6],
            bytes[off + 7], bytes[off + 8], bytes[off + 9],
            bytes[off + 10], bytes[off + 11],
          );
          if (chunk === "NETSCAPE2.0") netscape = true;
          off += 1 + len;
        }
      } else if (b === 0x2c) {
        frames += 1;
        off += 1;
        off += 9;
        const ipacked = bytes[off - 1];
        const lct = ipacked & 0x80 ? 3 * (1 << ((ipacked & 0x07) + 1)) : 0;
        off += lct;
        while (off < bytes.length) {
          const len = bytes[off];
          if (len === 0) { off += 1; break; }
          if (len + 1 > bytes.length - off) break;
          off += 1 + len;
        }
      } else {
        break;
      }
    }
  } catch {
    /* 解析异常则按已有信息判断 */
  }
  return frames >= 2 || netscape;
}

/** 判断是否为动图（与 watermark.client.ts 逻辑一致） */
async function isAnimated(file: File): Promise<boolean> {
  const head = await peek(file, Math.min(file.size || SCAN_LIMIT, SCAN_LIMIT));
  const fmt = detectFormat(head);
  if (fmt === "other") return false;
  try {
    if (fmt === "png") return pngIsAnimated(head);
    if (fmt === "webp") return webpIsAnimated(head);
    return gifIsAnimated(head);
  } catch {
    return false;
  }
}

/**
 * 压缩图片。返回压缩后的新 File；任何失败都安全地返回原文件。
 *
 * 处理流程：
 * 1. 非图片 / 动图 → 原样返回
 * 2. 加载图片获取原始尺寸
 * 3. 若宽度 > maxWidth，按比例缩小（高度等比缩放）
 * 4. 按配置的 outputFormat 输出（auto = 保持原格式）
 */
export async function compressImage(
  file: File,
  cfg: CompressionConfig,
): Promise<File> {
  if (!cfg?.enabled) return file;
  if (!file.type.startsWith("image/")) return file;
  // 动图：原样返回，保留动画
  if (await isAnimated(file)) return file;

  let img: HTMLImageElement;
  try {
    img = await loadImageEl(file);
  } catch {
    return file;
  }

  const origW = img.naturalWidth;
  const origH = img.naturalHeight;
  if (!origW || !origH) return file;

  // 计算目标尺寸
  const maxWidth = cfg.maxWidth ?? 1200;
  let targetW = origW;
  let targetH = origH;
  if (origW > maxWidth) {
    targetW = maxWidth;
    targetH = Math.round((origH * maxWidth) / origW);
  }

  // 如果不需要缩小尺寸且格式是 auto，无需处理
  const needResize = targetW !== origW;
  const format = cfg.outputFormat ?? "webp";
  if (format === "auto" && !needResize) return file;

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  // 绘制（高质量缩放）
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, targetW, targetH);

  // 确定输出格式
  let outType: string;
  let outExt: string;
  if (format === "auto") {
    // 保持原格式
    if (file.type === "image/png") {
      outType = "image/png";
      outExt = ".png";
    } else if (file.type === "image/webp") {
      outType = "image/webp";
      outExt = ".webp";
    } else {
      outType = "image/jpeg";
      outExt = ".jpg";
    }
  } else if (format === "webp") {
    outType = "image/webp";
    outExt = ".webp";
  } else if (format === "png") {
    outType = "image/png";
    outExt = ".png";
  } else {
    outType = "image/jpeg";
    outExt = ".jpg";
  }

  // PNG 无损，quality 参数无效；其他格式用配置的 quality
  const quality = outType === "image/png" ? undefined : (cfg.quality ?? 0.85);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outType, quality),
  );
  if (!blob) return file;

  // 保留原始文件名前缀，替换扩展名
  const baseName = file.name.replace(/\.(png|jpe?g|webp|gif|avif|bmp)$/i, "");
  const newName = baseName + outExt;
  return new File([blob], newName, { type: outType });
}
