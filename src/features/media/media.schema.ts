import { z } from "zod";
import type { Messages } from "@/lib/i18n";


export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 图片 10MB
export const MAX_VIDEO_FILE_SIZE = 100 * 1024 * 1024; // 视频 100MB（Workers 请求体上限）
export const MAX_DOC_FILE_SIZE = 50 * 1024 * 1024; // 文档/压缩包等附件 50MB
export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
];
export const ACCEPTED_VIDEO_TYPES = ["video/mp4"];
// 媒体库额外支持的"其他文件"（文档/表格/压缩包等附件），不走图片水印
// 同时列出浏览器可能报告的标准 MIME 及 Windows 常见变体
export const ACCEPTED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/vnd.ms-excel", // Windows 下部分浏览器/系统把 .csv 报成此类型
  "application/zip",
  "application/x-zip-compressed", // Windows 浏览器对 .zip 常见报告
  "application/vnd.rar",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "application/x-tar",
  "application/gzip",
  "application/x-gzip",
];
// 当 file.type 为空或不可信时，用扩展名兜底（必须同步上面的 MIME 集合语义）
export const ACCEPTED_DOCUMENT_EXTENSIONS = [
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".csv",
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
  ".tgz",
];
// 图片扩展名兜底（覆盖浏览器未上报 MIME 的场景）
export const ACCEPTED_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
];

export type MediaFileKind = "image" | "video" | "doc" | "unknown";

// 统一分类：去掉 MIME 参数（如 ;charset=utf-8）、扩展名兜底，避免各类误判
export function classifyUploadFile(file: File): {
  kind: MediaFileKind;
  maxSize: number;
} {
  const mime = (file.type || "").split(";")[0].trim().toLowerCase();
  const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();

  if (
    mime.startsWith("image/") ||
    ACCEPTED_IMAGE_TYPES.includes(mime) ||
    ACCEPTED_IMAGE_EXTENSIONS.includes(ext)
  ) {
    return { kind: "image", maxSize: MAX_FILE_SIZE };
  }
  if (mime.startsWith("video/") || ext === ".mp4" || ext === ".m4v") {
    return { kind: "video", maxSize: MAX_VIDEO_FILE_SIZE };
  }
  if (
    ACCEPTED_DOCUMENT_TYPES.includes(mime) ||
    ACCEPTED_DOCUMENT_EXTENSIONS.includes(ext)
  ) {
    return { kind: "doc", maxSize: MAX_DOC_FILE_SIZE };
  }
  return { kind: "unknown", maxSize: 0 };
}

export const UploadMediaInputSchema = z.instanceof(FormData);

export function parseUploadMediaInput(formData: FormData, messages: Messages) {
  const file = formData.get("image");
  if (!(file instanceof File)) {
    throw new Error(messages.media_validation_file_required());
  }
  const { kind, maxSize } = classifyUploadFile(file);
  if (kind === "unknown") {
    throw new Error(messages.media_validation_file_invalid_type());
  }
  if (file.size > maxSize) {
    throw new Error(messages.media_validation_file_too_large());
  }

  return { file };
}

export const MediaKeyInputSchema = z.object({
  key: z.string(),
});

export function assertMediaKey(key: string, messages: Messages) {
  const trimmedKey = key.trim();
  if (trimmedKey.length === 0) {
    throw new Error(messages.media_validation_key_required());
  }

  return trimmedKey;
}

export const UpdateMediaNameInputSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
});

export const GetMediaListInputSchema = z.object({
  cursor: z.number().optional(),
  limit: z.number().optional(),
  search: z.string().optional(),
  unusedOnly: z.boolean().optional(),
});

export type UpdateMediaNameInput = z.infer<typeof UpdateMediaNameInputSchema>;
export type GetMediaListInput = z.infer<typeof GetMediaListInputSchema>;
