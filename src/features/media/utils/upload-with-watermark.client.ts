/**
 * 统一的上传封装（client-only）。
 *
 * 把「读取后台配置 → 前端 Canvas 压缩+水印 → 调用上传」收敛到一处，
 * 供所有上传入口复用，保证图片处理行为一致：
 *   - 媒体库上传原本各自实现，现已统一走这里
 *   - 文章封面 / 正文插图 / 打赏码 / 视频封面（uploadImageFn）
 *   - 站点资产（uploadSiteAssetFn，字段名不同，用 processFileWithWatermark 预处理后自行组装）
 *
 * 压缩和水印是两个独立功能，各自有开关：
 *   - 只开压缩：图片缩小尺寸+转格式后上传
 *   - 只开水印：图片烧录水印后上传
 *   - 两者都开：先压缩（缩小尺寸+转格式）再加水印（保证水印清晰）后上传
 *   - 两者都关：原图直接上传
 *
 * 设计原则：任何一步失败都安全地回退到「原图上传」，绝不阻断上传流程。
 */
import { uploadImageFn } from "@/features/media/api/media.api";
import { getSystemConfigFn } from "@/features/config/api/config.api";
import { applyWatermark } from "./watermark.client";
import { compressImage } from "./compression.client";
import type { WatermarkConfig, CompressionConfig } from "./media.utils";

// 模块级缓存，避免每张图片都重新拉取系统配置
let cachedWm: WatermarkConfig | undefined | null;
let cachedComp: CompressionConfig | undefined | null;

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

/** 读取（并缓存）当前压缩配置；失败返回 undefined（代表不压缩） */
export async function getCompressionConfig(): Promise<CompressionConfig | undefined> {
  if (cachedComp !== undefined) return cachedComp ?? undefined;
  try {
    const cfg = await getSystemConfigFn();
    cachedComp = cfg?.compression ?? null;
  } catch {
    cachedComp = null;
  }
  return cachedComp ?? undefined;
}

/**
 * 取文件、按后台配置先压缩再加水印，返回处理后的文件。
 * - 动图 / 视频 / 非图片：原样返回（compressImage / applyWatermark 内部已 guard）
 * - 压缩和水印独立开关，互不影响
 * - 处理顺序：先压缩（缩小尺寸+转格式）→ 再加水印（保证水印画在最终尺寸的图上）
 * - 任何失败：返回上一步的结果，保证上传可用
 */
export async function processFileWithWatermark(file: File): Promise<File> {
  let result = file;
  try {
    // 第一步：压缩（如果开启）
    const comp = await getCompressionConfig();
    if (comp?.enabled) {
      result = await compressImage(result, comp);
    }
  } catch {
    // 压缩异常 → 用原文件继续
  }
  try {
    // 第二步：水印（如果开启）
    const wm = await getWatermarkConfig();
    if (wm?.enabled) {
      result = await applyWatermark(result, wm);
    }
  } catch {
    // 水印异常 → 用上一步的结果
  }
  return result;
}

/**
 * 统一的图片上传：先按配置压缩+水印，再走 uploadImageFn（字段名 image）。
 * 返回 uploadImageFn 的原始结果（含 error / data），调用方逻辑无需改动。
 */
export async function uploadImageWithWatermark(file: File) {
  const toUpload = await processFileWithWatermark(file);
  const formData = new FormData();
  formData.append("image", toUpload);
  return uploadImageFn({ data: formData });
}
