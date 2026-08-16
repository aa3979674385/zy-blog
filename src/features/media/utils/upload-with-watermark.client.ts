/**
 * 统一的上传封装（client-only）。
 *
 * 把「读取后台水印配置 → 前端 Canvas 烧录 → 调用上传」三步收敛到一处，
 * 供所有上传入口复用，保证水印行为一致：
 *   - 媒体库上传原本各自实现，现已统一走这里
 *   - 文章封面 / 正文插图 / 打赏码 / 视频封面（uploadImageFn）
 *   - 站点资产（uploadSiteAssetFn，字段名不同，用 processFileWithWatermark 预处理后自行组装）
 *
 * 设计原则：任何一步失败都安全地回退到「原图上传」，绝不阻断上传流程。
 */
import { uploadImageFn } from "@/features/media/api/media.api";
import { getSystemConfigFn } from "@/features/config/api/config.api";
import { applyWatermark } from "./watermark.client";
import type { WatermarkConfig } from "./media.utils";

// 模块级缓存，避免每张图片都重新拉取系统配置
let cachedWm: WatermarkConfig | undefined | null;

/** 读取（并缓存）当前水印配置；失败返回 undefined（代表不烧录） */
export async function getWatermarkConfig(): Promise<WatermarkConfig | undefined> {
  if (cachedWm !== undefined) return cachedWm ?? undefined;
  try {
    const cfg = await getSystemConfigFn();
    cachedWm = cfg?.watermark ?? null;
  } catch {
    cachedWm = null;
  }
  return cachedWm ?? undefined;
}

/**
 * 取文件、按后台水印配置烧录后返回处理后的文件。
 * - 动图 / 视频 / 非图片：原样返回（applyWatermark 内部已 guard）
 * - 任何失败：返回原文件，保证上传可用
 */
export async function processFileWithWatermark(file: File): Promise<File> {
  try {
    const wm = await getWatermarkConfig();
    if (wm?.enabled) {
      return await applyWatermark(file, wm);
    }
  } catch {
    // 配置读取或烧录异常 → 回退原图
  }
  return file;
}

/**
 * 统一的图片上传：先按水印配置烧录，再走 uploadImageFn（字段名 image）。
 * 返回 uploadImageFn 的原始结果（含 error / data），调用方逻辑无需改动。
 */
export async function uploadImageWithWatermark(file: File) {
  const toUpload = await processFileWithWatermark(file);
  const formData = new FormData();
  formData.append("image", toUpload);
  return uploadImageFn({ data: formData });
}
