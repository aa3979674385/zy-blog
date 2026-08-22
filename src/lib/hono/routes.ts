import handler from "@/lib/worker/ssr-stream-handler";
import type { Context } from "hono";
import { Hono } from "hono";
import { proxy } from "hono/proxy";
import { handleImageRequest } from "@/features/media/service/media.service";
import postsDetailRoute from "@/features/posts/api/hono/posts.detail.route";
import postsDetailByIdRoute from "@/features/posts/api/hono/posts.detail-by-id.route";
import postsListRoute from "@/features/posts/api/hono/posts.list.route";
import postsPagedRoute from "@/features/posts/api/hono/posts.paged.route";
import postsPopularRoute from "@/features/posts/api/hono/posts.popular.route";
import postsRelatedRoute from "@/features/posts/api/hono/posts.related.route";
import searchRoute from "@/features/search/api/hono/search.route";
import siteDocumentsRoute from "@/features/site-documents/api/hono/site-documents.route";
import tagsRoute from "@/features/tags/api/hono/tags.list.route";
import categoriesRoute from "@/features/categories/api/hono/categories.list.route";
import { serverEnv } from "@/lib/env/server.env";
import { resourceDownloadRedirectRoute } from "@/features/post-resources/api/hono/redirect.route";
import captchaConfigRoute from "./captcha-config.route";
import { securityHeadersMiddleware } from "./security-headers";
import { createRateLimiterIdentifier, getExecutionContext } from "./helper";
import {
  baseMiddleware,
  cacheMiddleware,
  maintenanceMiddleware,
  rateLimitMiddleware,
  shieldMiddleware,
  turnstileMiddleware,
} from "./middlewares";

export const app = new Hono<{ Bindings: Env }>();

// 站点维护模式：最先检查（在缓存之前），维护期间除后台/登录/静态资源外全部返回维护页
app.all("*", maintenanceMiddleware);

// 安全响应头：所有响应统一附加 CSP / X-Frame-Options / HSTS 等（见 security-headers.ts 说明）
app.use("*", securityHeadersMiddleware);

app.get("*", cacheMiddleware);

async function forwardAuthRequest(c: Context<{ Bindings: Env }>) {
  const auth = c.get("auth");
  return auth.handler(c.req.raw);
}

/* ================================ Public API ================================ */

// Public API routes with RPC support - 链式调用保留类型推断
// 注意：by-id 必须挂在 slug 详情路由（/:slug）之前，否则 /api/post/by-id 会被 /:slug 抢先匹配成 slug="by-id"
const publicApi = new Hono<{ Bindings: Env }>()
  .route("/posts", postsListRoute)
  .route("/posts/paged", postsPagedRoute)
  .route("/posts/popular", postsPopularRoute)
  .route("/post/by-id", postsDetailByIdRoute)
  .route("/post", postsDetailRoute)
  .route("/post", postsRelatedRoute)
  .route("/tags", tagsRoute)
  .route("/categories", categoriesRoute)
  .route("/search", searchRoute)
  // 人机验证服务商探测（公开）。挂在 shieldMiddleware 之前，因此天然放行。
  .route("/captcha-config", captchaConfigRoute);

// Mount public API
app.route("/api", publicApi);

app.route("/", siteDocumentsRoute);

// Export type for RPC client
export type PublicApiType = typeof publicApi;

/* ================================ 路由开始 ================================ */
app.get("/stats.js", async (c) => {
  const env = serverEnv(c.env);
  const umamiSrc = env.UMAMI_SRC;
  if (!umamiSrc) {
    return c.text("Not Found", 404);
  }
  const scriptUrl = new URL("/script.js", umamiSrc).toString();
  const response = await proxy(scriptUrl);
  response.headers.set(
    "Cache-Control",
    "public, max-age=3600, stale-while-revalidate=86400",
  );
  return response;
});

app.all("/api/send", async (c) => {
  const env = serverEnv(c.env);
  const umamiSrc = env.UMAMI_SRC;
  if (!umamiSrc) {
    return c.text("Not Found", 404);
  }
  const sendUrl = new URL("/api/send", umamiSrc).toString();
  return proxy(sendUrl, c.req);
});

app.get("/images/:key{.+}", async (c) => {
  const key = c.req.param("key");

  if (!key) return c.text("Image key is required", 400);

  // 资源附件专用前缀 ra/（resource-attachment）：仅允许经 /dl/ 受控下载路由取流，
  // 此处一律拒绝公开直链访问——即使附件 URL 泄露，未登录/无权限者也无法直接拉取。
  if (key.startsWith("ra/")) {
    return c.text("Forbidden", 403);
  }

  try {
    return await handleImageRequest(c.env, key);
  } catch (error) {
    console.error(
      JSON.stringify({
        message: "r2 image fetch failed",
        key,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return c.text("Internal server error", 500);
  }
});

app.get("/api/auth/*", baseMiddleware, forwardAuthRequest);

const protectedAuthPaths = [
  "/api/auth/sign-in/email",
  "/api/auth/sign-up/email",
  "/api/auth/request-password-reset",
  "/api/auth/send-verification-email",
] as const;

protectedAuthPaths.forEach((path) => {
  app.post(
    path,
    baseMiddleware,
    turnstileMiddleware,
    rateLimitMiddleware({
      capacity: 5,
      interval: "1m",
      identifier: createRateLimiterIdentifier,
    }),
    rateLimitMiddleware({
      capacity: 10,
      interval: "1h",
      identifier: (c) => `hourly:${createRateLimiterIdentifier(c)}`,
    }),
    forwardAuthRequest,
  );
});

app.post(
  "/api/auth/*",
  baseMiddleware,
  rateLimitMiddleware({
    capacity: 5,
    interval: "1m",
    identifier: createRateLimiterIdentifier,
  }),
  forwardAuthRequest,
);

// 下载中转：外链（网盘等）点击后由后台校验权限并 302 跳真实地址，真实链接不进前端
app.route("/dl", resourceDownloadRedirectRoute);

// Router之前的防护
app.all("*", shieldMiddleware);

app.all("*", (c) => {
  return handler.fetch(c.req.raw, {
    context: {
      env: c.env,
      executionCtx: getExecutionContext(c),
    },
  });
});
