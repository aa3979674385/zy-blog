import { generateKey } from "@/features/media/utils/media.utils";

export async function putToR2(env: Env, image: File) {
  const key = generateKey(image.name);
  const contentType = image.type;
  const url = `/images/${key}`;

  await env.R2.put(key, image.stream(), {
    httpMetadata: {
      contentType,
    },
    customMetadata: {
      originalName: image.name,
    },
  });

  return {
    key,
    url,
    fileName: image.name,
    mimeType: contentType,
    sizeInBytes: image.size,
  };
}

/**
 * 上传「资源附件」到 R2 专用前缀 ra/（resource-attachment），与媒体库图片（putToR2，无前缀、公开可访问）区分。
 * 这样可在公开 /images/ 路由上对附件直链做「未登录拒绝」收口，下载统一走 /dl/ 受控中转（对齐子比主题私有存储）。
 */
export async function putResourceAttachment(
  env: Env,
  file: File,
): Promise<{
  key: string;
  url: string;
  fileName: string;
  mimeType: string;
  sizeInBytes: number;
}> {
  const key = `ra/${generateKey(file.name)}`;
  const contentType = file.type;
  const url = `/images/${key}`;

  await env.R2.put(key, file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { originalName: file.name },
  });

  return {
    key,
    url,
    fileName: file.name,
    mimeType: contentType,
    sizeInBytes: file.size,
  };
}

export async function deleteFromR2(env: Env, key: string) {
  await env.R2.delete(key);
}

export async function getFromR2(env: Env, key: string) {
  return await env.R2.get(key);
}

/**
 * Upload a site asset (favicon, theme images) to R2 with a fixed key.
 * No DB record; overwrites in place on re-upload.
 */
export async function putSiteAsset(
  env: Env,
  file: File,
  assetPath: string,
): Promise<{ key: string; url: string }> {
  const key = `asset/${assetPath}`;
  await env.R2.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type,
    },
  });
  return { key, url: `/images/${key}` };
}
