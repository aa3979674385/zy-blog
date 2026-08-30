import { Hono } from "hono";
import { getAuth } from "@/lib/auth/auth.server";
import { getDb } from "@/lib/db";
import * as FreeResourceData from "@/features/post-resources/data/free-resource.data";
import * as Storage from "@/features/media/data/media.storage";

/**
 * 免费获取中转路由：/api/free-dl/:token
 *
 * 用户通过「免费获取」功能拿到一个中转 token 后，
 * 浏览器请求此路由，服务端：
 *   1. 验证 token 有效性和时效
 *   2. 校验用户身份（token 必须属于当前登录用户）
 *   3. 获取关联的网盘链接
 *   4. 302 跳转到真实网盘地址（或流式返回本地附件）
 *
 * 安全要点：
 *   - token 有 30 分钟时效，过期作废
 *   - token 与用户绑定，A 用户的 token 不能被 B 用户使用
 *   - 真实网盘 URL 不进入前端 / 审查元素
 *   - PC 端用此 URL 生成二维码，手机端扫码后由手机浏览器访问此路由
 */
export const freeResourceDownloadRoute = new Hono<{ Bindings: Env }>();

freeResourceDownloadRoute.get("/:token", async (c) => {
  const db = getDb(c.env);
  const auth = await getAuth({ db, env: c.env });
  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  // 未登录：不允许使用免费获取 token
  if (!session?.user) {
    return c.redirect("/login", 302);
  }

  const token = c.req.param("token");
  if (!token) {
    return c.text("Bad Request", 400);
  }

  // 验证 token
  const tokenData = await FreeResourceData.validateFreeToken(db, token);
  if (!tokenData) {
    return c.text("链接已失效或不存在，请重新获取", 410);
  }

  // 校验 token 归属：必须属于当前登录用户
  if (tokenData.userId !== session.user.id) {
    return c.text("Forbidden", 403);
  }

  const { resource, link } = tokenData;
  if (!resource || !link) {
    return c.text("Not Found", 404);
  }

  const target = link.url;

  // 本地附件（/images/...，含 ra/ 私有前缀）：由 Worker 直接从 R2 读字节流式返回
  if (target.startsWith("/images/")) {
    const raKey = target.replace(/^\/images\//, "");
    try {
      const obj = await Storage.getFromR2(c.env, raKey);
      if (!obj) return c.text("Not Found", 404);
      const buf = await obj.arrayBuffer();
      const contentType =
        (obj.httpMetadata && obj.httpMetadata.contentType) ||
        "application/octet-stream";
      const fileName = raKey.split("/").pop() || raKey;
      c.header("Content-Type", contentType);
      c.header(
        "Content-Disposition",
        `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      );
      c.header("Cache-Control", "no-store, private");
      return c.body(buf, 200);
    } catch (error) {
      console.error(
        JSON.stringify({
          message: "free resource attachment stream failed",
          token,
          raKey,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      return c.text("Internal server error", 500);
    }
  }

  // 外链：仅允许 http(s)，避免开放重定向
  const isSafe = /^https?:\/\//i.test(target);
  if (!isSafe) {
    return c.text("Forbidden", 403);
  }

  // 不缓存这个重定向，避免跨用户串号 / 缓存真实地址
  c.header("Cache-Control", "no-store, private");
  return c.redirect(target, 302);
});

export default freeResourceDownloadRoute;
