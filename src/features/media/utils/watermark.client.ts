/**
 * 前端图片水印烧录（client-only）。
 *
 * 为什么不用 Cloudflare 服务端水印：免费版 Image Resizing 的 `draw` 叠加在该
 * 账户上被整体忽略，且 Worker 内部 `cf.image` 子请求因 self-fetch（Worker 调自己
 * 域名）完全不生效，无法对图片做变换。因此改为在浏览器端用 Canvas 把水印直接
 * 烧录进图片像素，上传成品图——任何设备访问/下载都带水印，零外部依赖。
 */
import type { WatermarkConfig } from "./media.utils";

type Pos =
  | "southeast"
  | "southwest"
  | "northeast"
  | "northwest"
  | "center"
  | "north"
  | "south"
  | "east"
  | "west";

function loadImage(src: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    if (typeof src === "string") {
      const url = src.startsWith("http")
        ? src
        : `${location.origin}${src.startsWith("/") ? "" : "/"}${src}`;
      img.src = url;
    } else {
      img.src = URL.createObjectURL(src);
    }
  });
}

function posXY(
  pos: string,
  W: number,
  H: number,
  wmW: number,
  wmH: number,
): { x: number; y: number } {
  const pad = Math.round(Math.min(W, H) * 0.03);
  const horizontal = (left: number) => left;
  const cx = (W - wmW) / 2;
  const cy = (H - wmH) / 2;
  switch (pos as Pos) {
    case "southwest":
      return { x: pad, y: H - wmH - pad };
    case "northeast":
      return { x: W - wmW - pad, y: pad };
    case "northwest":
      return { x: pad, y: pad };
    case "center":
      return { x: horizontal(cx), y: cy };
    case "north":
      return { x: cx, y: pad };
    case "south":
      return { x: cx, y: H - wmH - pad };
    case "east":
      return { x: W - wmW - pad, y: cy };
    case "west":
      return { x: pad, y: cy };
    case "southeast":
    default:
      return { x: W - wmW - pad, y: H - wmH - pad };
  }
}

/**
 * 判断图片是否为动图。
 *
 * 关键设计：不能把整段二进制当字符串做 includes() 盲搜——高熵压缩数据里
 * 随机命中 "acTL"/"ANMF" 这类 4 字节标记的概率约 1/3500，会造成「静图被误判为
 * 动图而漏打水印」(风险2)。这里改为「按格式结构解析」：
 *   - PNG/APNG：在合法 chunk 边界匹配 acTL（必须是 chunk 类型字段）
 *   - WebP    ：在 RIFF chunk 边界匹配 ANIM/ANMF
 *   - GIF     ：GIF89a + (Netscape 循环块 或 帧数>=2)，覆盖「不循环的动画 GIF」
 * 这样误判率≈0。仅扫描前 4MB（动图控制信息都在头部附近），开销极小。
 *
 * 为什么必须尽量准确：一旦把真实动图误判为静图，就会进入 Canvas 逻辑，
 * 而 <img>+Canvas 只取首帧，toBlob 会永久压成静态图、丢失动画 (风险3)。
 * 因此检测偏「宁可把静图当动图跳过水印，也不压扁真动图」是安全的默认。
 */
const SCAN_LIMIT = 4 * 1024 * 1024;

async function peek(file: File, n: number): Promise<Uint8Array> {
  const buf = await file.slice(0, n).arrayBuffer();
  return new Uint8Array(buf);
}

/** 通过文件魔数判断真实格式，避免 MIME 错误/缺失导致误判 */
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
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 && // RIFF
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50 // WEBP
  )
    return "webp";
  return "other";
}

/** APNG：在 chunk 结构里找 acTL（动画控制块）。命中 IDAT 前未出现 acTL 即静图 */
function pngIsAnimated(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  let off = 8; // 跳过 8 字节签名
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (off + 8 <= bytes.length) {
    const len = dv.getUint32(off, false); // 大端长度
    const type = String.fromCharCode(
      bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7],
    );
    if (type === "acTL" && len === 8) return true; // acTL 数据恒为 8 字节
    if (type === "IDAT") return false; // 像素数据已开始，说明无动画块
    if (len + 12 > bytes.length - off) break; // 防越界/畸形
    off += 8 + len + 4; // 长度+类型+数据+CRC
  }
  return false;
}

/** 动图 WebP：在 RIFF chunk 边界找 ANIM 或 ANMF */
function webpIsAnimated(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  let off = 12; // 跳过 RIFF/size/WEBP
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (off + 8 <= bytes.length) {
    const fourcc = String.fromCharCode(
      bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3],
    );
    const size = dv.getUint32(off + 4, true); // 小端
    if (fourcc === "ANIM" || fourcc === "ANMF") return true;
    if (size + 8 > bytes.length - off) break;
    off += 8 + size + (size & 1); // chunk 按偶数字节对齐
  }
  return false;
}

/** GIF 是否动画：帧数>=2（含不循环的 GIF）或含 Netscape 循环块。带结构解析与越界保护 */
function gifIsAnimated(bytes: Uint8Array): boolean {
  if (bytes.length < 13) return false;
  let off = 6; // 跳过 "GIF87a"/"GIF89a"
  const packed = bytes[off + 4];
  const gct = packed & 0x80 ? 3 * (1 << ((packed & 0x07) + 1)) : 0;
  off += 7 + gct;
  let frames = 0;
  let netscape = false;
  try {
    while (off < bytes.length) {
      const b = bytes[off];
      if (b === 0x3b) break; // trailer
      if (b === 0x21) {
        off += 2; // 0x21 + 扩展标签
        // 跳过子块：每块首字节为长度，0 结束
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
        off += 9; // 图像描述符(左/上/宽/高/打包)
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
        break; // 无法识别的字节，停止以防死循环
      }
    }
  } catch {
    /* 解析异常则按已有信息判断 */
  }
  return frames >= 2 || netscape;
}

async function isAnimated(file: File): Promise<boolean> {
  const head = await peek(file, Math.min(file.size || SCAN_LIMIT, SCAN_LIMIT));
  const fmt = detectFormat(head);
  if (fmt === "other") return false; // jpeg/bmp 等无动画能力
  try {
    if (fmt === "png") return pngIsAnimated(head);
    if (fmt === "webp") return webpIsAnimated(head);
    return gifIsAnimated(head); // gif
  } catch {
    return false;
  }
}

/**
 * 把水印烧录进图片。返回带水印的新 File；任何失败都安全地返回原图。
 * 动图一律原样保留——Canvas 只能取首帧，烧录会把动图压成静态首帧，
 * 故先按字节签名判定是否动图（与扩展名无关：GIF/WebP/PNG 都可能有动/静两态）。
 */
export async function applyWatermark(
  file: File,
  wm: WatermarkConfig,
): Promise<File> {
  if (!wm?.enabled) return file;
  if (!file.type.startsWith("image/")) return file;
  // 动图：原样上传，保留动画（不烧水印）
  if (await isAnimated(file)) return file;

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return file;
  }

  const W = img.naturalWidth;
  const H = img.naturalHeight;
  if (!W || !H) return file;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.drawImage(img, 0, 0);

  const opacity = typeof wm.opacity === "number" ? wm.opacity : 0.5;
  const scale = typeof wm.scale === "number" ? wm.scale : 0.2;
  const pos = wm.position ?? "southeast";

  try {
    if (wm.type === "image" && wm.imageUrl) {
      const wmImg = await loadImage(wm.imageUrl);
      if (wmImg.naturalWidth && wmImg.naturalHeight) {
        const wmW = Math.max(20, Math.round(W * scale));
        const ratio = wmImg.naturalWidth / wmImg.naturalHeight;
        const wmH = Math.round(wmW / ratio);
        const { x, y } = posXY(pos, W, H, wmW, wmH);
        ctx.globalAlpha = opacity;
        ctx.drawImage(wmImg, x, y, wmW, wmH);
      }
    } else if (wm.type === "text" && wm.text?.trim()) {
      // 字号随图宽自适应，但不小于后台设置的 textSize
      const adaptive = Math.round(W * scale * 0.15);
      const fontSize = Math.max(wm.textSize ?? 36, adaptive, 12);
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = wm.textColor ?? "rgba(255,255,255,0.6)";
      ctx.globalAlpha = opacity;
      const wmW = ctx.measureText(wm.text).width;
      const wmH = fontSize;
      const { x, y } = posXY(pos, W, H, wmW, wmH);
      ctx.fillText(wm.text, x, y + fontSize);
    }
  } catch {
    return file;
  } finally {
    ctx.globalAlpha = 1;
  }

  // 保留透明通道：PNG / APNG / 静态 GIF 输出 PNG（无损+保透明）
  // WebP 保持 WebP（尊重压缩阶段选择的格式，不强制转 JPEG）
  // 其余输出 JPEG 以控体积
  const keepPng =
    file.type === "image/png" ||
    file.type === "image/apng" ||
    file.type === "image/gif";
  const keepWebp = file.type === "image/webp";
  const outType = keepPng ? "image/png" : keepWebp ? "image/webp" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, outType, 0.92),
  );
  if (!blob) return file;

  const ext = outType === "image/png" ? ".png" : outType === "image/webp" ? ".webp" : ".jpg";
  const name = file.name.replace(/\.(png|jpe?g|webp|gif)$/i, ext);
  return new File([blob], name, { type: outType });
}
