import * as MediaRepo from "@/features/media/data/media.data";
import * as Storage from "@/features/media/data/media.storage";
import type {
  GetMediaListInput,
  UpdateMediaNameInput,
} from "@/features/media/media.schema";
import { getImageDimensions } from "@/features/media/utils/image-dimensions";
import {
  buildTransformOptions,
  buildWatermarkDraw,
  getContentTypeFromKey,
  type WatermarkConfig,
} from "@/features/media/utils/media.utils";
import * as PostMediaRepo from "@/features/posts/data/post-media.data";
import { CACHE_CONTROL } from "@/lib/constants";
import { err, ok } from "@/lib/errors";

export async function upload(
  context: DbContext & { executionCtx: ExecutionContext },
  input: { file: File },
) {
  const { file } = input;

  // 仅对图片解析尺寸；视频/文档不解析（大文件 arrayBuffer 内存开销大）
  const isVideo = file.type.startsWith("video/");
  const isImage = file.type.startsWith("image/");
  const dimensions = isVideo || !isImage
    ? null
    : getImageDimensions(await file.arrayBuffer());
  const width = dimensions?.width;
  const height = dimensions?.height;

  const uploaded = await Storage.putToR2(context.env, file);

  try {
    const mediaRecord = await MediaRepo.insertMedia(context.db, {
      key: uploaded.key,
      url: uploaded.url,
      fileName: uploaded.fileName,
      mimeType: uploaded.mimeType,
      sizeInBytes: uploaded.sizeInBytes,
      width,
      height,
    });
    return ok(mediaRecord);
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "media db insert failed, rolling back r2 upload",
        key: uploaded.key,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    context.executionCtx.waitUntil(
      Storage.deleteFromR2(context.env, uploaded.key).catch((rollbackError) =>
        console.error(
          JSON.stringify({
            message: "r2 rollback delete failed",
            key: uploaded.key,
            error:
              rollbackError instanceof Error
                ? rollbackError.message
                : String(rollbackError),
          }),
        ),
      ),
    );
    return err({ reason: "MEDIA_RECORD_CREATE_FAILED" });
  }
}

export async function deleteImage(
  context: DbContext & { executionCtx: ExecutionContext },
  key: string,
) {
  // 后端兜底检查：防止删除正在被引用的媒体
  const inUse = await PostMediaRepo.isMediaInUse(context.db, key);
  if (inUse) {
    return err({ reason: "MEDIA_IN_USE" });
  }

  await MediaRepo.deleteMedia(context.db, key);
  context.executionCtx.waitUntil(
    Storage.deleteFromR2(context.env, key).catch((deleteError) =>
      console.error(
        JSON.stringify({
          message: "r2 delete failed",
          key,
          error:
            deleteError instanceof Error
              ? deleteError.message
              : String(deleteError),
        }),
      ),
    ),
  );

  return ok({ success: true });
}

export async function getMediaList(
  context: DbContext,
  data: GetMediaListInput,
) {
  return await MediaRepo.getMediaList(context.db, data);
}

export async function isMediaInUse(context: DbContext, key: string) {
  return await PostMediaRepo.isMediaInUse(context.db, key);
}

export async function getLinkedPosts(context: DbContext, key: string) {
  return await PostMediaRepo.getPostsByMediaKey(context.db, key);
}

export async function getLinkedMediaKeys(
  context: DbContext,
  keys: Array<string>,
) {
  return await PostMediaRepo.getLinkedMediaKeys(context.db, keys);
}

export async function getTotalMediaSize(context: DbContext) {
  return await MediaRepo.getTotalMediaSize(context.db);
}

export async function updateMediaName(
  context: DbContext,
  data: UpdateMediaNameInput,
) {
  return await MediaRepo.updateMediaName(context.db, data.key, data.name);
}

export async function handleImageRequest(
  env: Env,
  key: string,
  request: Request,
  watermark?: WatermarkConfig | null,
) {
  const url = new URL(request.url);
  const searchParams = url.searchParams;

  const serveOriginal = async () => {
    const object = await env.R2.get(key);
    if (!object) {
      return new Response("Image not found", { status: 404 });
    }

    const contentType =
      object.httpMetadata?.contentType ||
      getContentTypeFromKey(key) ||
      "application/octet-stream";

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", contentType);
    headers.set("ETag", object.httpEtag);
    // 原图（UUID key 天然版本化）下发长期边缘缓存，避免每次回源 R2
    Object.entries(CACHE_CONTROL.immutable).forEach(([k, v]) => {
      headers.set(k, v);
    });

    return new Response(object.body, { headers });
  };

  // 1. 防止循环调用 & 显式请求原图
  const viaHeader = request.headers.get("via");
  const isLoop = viaHeader && /image-resizing/.test(viaHeader);
  const wantsOriginal = searchParams.get("original") === "true";
  // 站点资产（favicon、水印图等，key 以 asset/ 开头）不参与水印，允许取原图
  const isAsset = key.startsWith("asset/");

  // 内部 Image Resizing 回源请求：必须放行原图，否则变换会失败
  if (isLoop) {
    return await serveOriginal();
  }

  // 站点资产（favicon、水印图等 asset/ 路径）：一律直接返回原图。
  // 不参与变换，避免水印图自身被 Image Resizing 递归处理/叠加水印。
  if (isAsset) {
    return await serveOriginal();
  }

  // 用户媒体图：
  // - 水印关闭：保留原有「?original=true 查看原图」能力（放大查看/后台预览）
  // - 水印开启：忽略 original 参数，继续走变换流程 —— 访问者拿到的永远是带水印图，
  //   无法通过拼 ?original=true 绕过水印（放大图同样带水印）
  if (wantsOriginal && !watermark?.enabled) {
    return await serveOriginal();
  }

  // 2. 非图片（如视频）不参与图片变换，直接返回原文件
  const probe = await env.R2.head(key);
  const contentType =
    probe?.httpMetadata?.contentType ||
    getContentTypeFromKey(key) ||
    "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    return await serveOriginal();
  }

  // 2. 构建 Cloudflare Image Resizing 参数
  const transformOptions = buildTransformOptions(
    searchParams,
    request.headers.get("Accept") || "",
  );

  // 3. 叠加水印（后台配置开启时；站点资产 asset/ 路径不加水印，避免水印图自身被递归处理）
  const draw = isAsset ? undefined : buildWatermarkDraw(watermark, url.origin);
  if (draw) {
    transformOptions.draw = draw;
  }

  // 3. 尝试进行图片处理
  try {
    const origin = url.origin;
    const sourceImageUrl = `${origin}/images/${key}?original=true`;

    const subRequestHeaders = new Headers();

    const headersToKeep = ["user-agent", "accept"];
    for (const [k, v] of request.headers.entries()) {
      if (headersToKeep.includes(k.toLowerCase())) {
        subRequestHeaders.set(k, v);
      }
    }

    const imageRequest = new Request(sourceImageUrl, {
      headers: subRequestHeaders,
    });

    // 调用 Cloudflare Images 变换
    const response = await fetch(imageRequest, {
      cf: { image: transformOptions },
    });

    // 如果变换失败 (如格式不支持 / 参数非法 / zone 未开启 Transformations)，降级回原图。
    // Cloudflare 会把具体原因写在响应体里，必须读出来，否则线上只能看到「没水印」这一个现象。
    if (!response.ok) {
      let detail = "";
      try {
        detail = (await response.clone().text()).slice(0, 300);
      } catch {
        detail = "<unreadable body>";
      }
      console.error(
        JSON.stringify({
          message: "image transform failed",
          key,
          status: response.status,
          statusText: response.statusText,
          watermarkEnabled: Boolean(watermark?.enabled),
          hasDraw: Boolean(draw),
          cfError: response.headers.get("cf-images-error") || undefined,
          detail,
        }),
      );
      return await serveOriginal();
    }

    // 4. 返回处理后的图片
    // 使用 new Response(response.body, response) 保持状态码和其它优化头信息
    const newResponse = new Response(response.body, response);

    // 覆盖/补充必要的缓存头
    newResponse.headers.set("Vary", "Accept");
    Object.entries(CACHE_CONTROL.immutable).forEach(([k, v]) => {
      newResponse.headers.set(k, v);
    });

    return newResponse;
  } catch (e) {
    console.error(
      JSON.stringify({
        message: "image transform error",
        key,
        error: e instanceof Error ? e.message : String(e),
      }),
    );
    return await serveOriginal();
  }
}
