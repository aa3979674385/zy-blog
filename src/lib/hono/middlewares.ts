import type { Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getAuth } from "@/lib/auth/auth.server";
import * as ConfigRepo from "@/features/config/data/config.data";
import {
  DEFAULT_MAINTENANCE_MESSAGE,
  getMaintenanceStatus,
  renderMaintenanceHtml,
} from "@/features/maintenance/maintenance.service";
import {
  CAPTCHA_TOKEN_HEADER,
  LEGACY_CAPTCHA_TOKEN_HEADER,
  verifyCaptcha,
} from "@/lib/captcha";
import { CACHE_CONTROL } from "@/lib/constants";
import { getDb } from "@/lib/db";
import type { Duration } from "@/lib/duration";
import { serverEnv } from "@/lib/env/server.env";
import { getExecutionContext } from "./helper";
import { isPathValid } from "./path-manifest.generated";

declare module "hono" {
  interface ContextVariableMap {
    db: ReturnType<typeof getDb>;
    auth: Awaited<ReturnType<typeof getAuth>>;
  }
}

export const baseMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const db = getDb(c.env);
    // 传入 executionCtx：登录方式配置走 7 天 KV 缓存，避免每次请求直查数据库
    const auth = await getAuth({
      db,
      env: c.env,
      executionCtx: getExecutionContext(c),
    });
    c.set("db", db);
    c.set("auth", auth);
    return next();
  },
);

/** 缓存版本头：命中缓存时校验，构建 ID 不匹配的旧缓存一律作废重新生成 */
const CACHE_VERSION_HEADER = "x-blog-build-id";
/** 带内容 hash 的静态资源路径前缀（可安全永久缓存到浏览器） */
const IMMUTABLE_ASSET_PREFIXES = ["/assets/", "/favicon", "/apple-touch-icon", "/web-app-manifest"];

const tryCacheResponse = (c: Context, cache: Cache) => {
  let strategy:
    | typeof CACHE_CONTROL.notFound
    | typeof CACHE_CONTROL.serverError
    | typeof CACHE_CONTROL.forbidden
    | null = null;
  if (c.res.status === 404) {
    strategy = CACHE_CONTROL.notFound;
  } else if (c.res.status >= 500) {
    strategy = CACHE_CONTROL.serverError;
  }
  if (strategy) {
    Object.entries(strategy).forEach(([k, v]) => {
      c.res.headers.set(k, v);
    });
  }

  // 注入构建版本头：部署新版本后旧缓存自动失效（避免旧 HTML 引用已变更的 chunk）
  c.res.headers.set(CACHE_VERSION_HEADER, __BUILD_ID__);

  const resCacheControl = c.res.headers.get("Cache-Control");
  const hasSetCookie = c.res.headers.has("Set-Cookie");

  const isStatusCacheable =
    c.res.status === 200 || c.res.status === 404 || c.res.status >= 500;

  const isCacheable =
    isStatusCacheable &&
    !hasSetCookie &&
    resCacheControl &&
    !resCacheControl.includes("no-store") &&
    !resCacheControl.includes("no-cache") &&
    !resCacheControl.includes("private");

  if (!isCacheable) return;

  const responseToCache = c.res.clone();
  c.executionCtx.waitUntil(
    cache.put(c.req.raw, responseToCache).catch(() => {}),
  );
};

export const cacheMiddleware = createMiddleware(async (c, next) => {
  if (c.req.method !== "GET") {
    return next();
  }

  const path = c.req.path;

  // 排除需要 session 的 API（如 /api/auth, /api/send）
  // 但包含 public API（/api/posts, /api/post, /api/tags, /api/search）
  const EXCLUDED_PREFIXES = ["/api/auth", "/api/send"];
  if (EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return next();
  }

  // 缓存响应逻辑
  const cache = (caches as unknown as { default: Cache }).default;

  const cachedResponse = await cache.match(c.req.raw);
  if (cachedResponse) {
    // 版本校验：构建 ID 一致才返回缓存；否则作废旧缓存并重新生成，
    // 解决「部署后 CDN purge 清不掉 Worker 内层缓存 → 旧 HTML 一直返回」的问题。
    if (cachedResponse.headers.get(CACHE_VERSION_HEADER) === __BUILD_ID__) {
      return cachedResponse;
    }
    c.executionCtx.waitUntil(cache.delete(c.req.raw).catch(() => {}));
  }

  await next();

  // 带内容 hash 的静态资源：允许浏览器永久缓存，避免每次首开都重新下载
  // 入口 JS（1.9MB / br 585KB），这是「每次首次打开导航要等十几秒」的直接诱因。
  if (IMMUTABLE_ASSET_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    c.res.headers.set("Cache-Control", "public, max-age=31536000, immutable");
  }

  tryCacheResponse(c, cache);
});

const SHIELD_ALLOWED_PATHS = new Set([
  "/atom.xml",
  "/feed.json",
  "/robots.txt",
  "/rss.xml",
  "/site.webmanifest",
  "/sitemap.xml",
]);

interface RateLimitOptions {
  capacity: number;
  interval: Duration;
  identifier: string | ((c: Context) => string | undefined);
}

export const rateLimitMiddleware = (options: RateLimitOptions) =>
  createMiddleware<{ Bindings: Env }>(async (c, next) => {
    const identifier =
      typeof options.identifier === "function"
        ? options.identifier(c)
        : options.identifier;
    const id = c.env.RATE_LIMITER.idFromName(identifier ?? "unknown");
    const rateLimiter = c.env.RATE_LIMITER.get(id);

    const result = await rateLimiter.checkLimit({
      capacity: options.capacity,
      interval: options.interval,
    });

    if (!result.allowed) {
      c.res.headers.set("Retry-After", result.retryAfterMs.toString());
      return c.json(
        {
          code: "RATE_LIMITED",
          message: "Too Many Requests",
          retryAfterMs: result.retryAfterMs,
        },
        429,
      );
    }

    return next();
  });

export const shieldMiddleware = createMiddleware(async (c, next) => {
  if (serverEnv(c.env).ENVIRONMENT === "dev") return next();

  const path = c.req.path;

  if (
    // 静态资源
    path.startsWith("/assets/") ||
    path.startsWith("/favicon") ||
    SHIELD_ALLOWED_PATHS.has(path) ||
    path.startsWith("/apple-touch-icon") ||
    path.startsWith("/web-app-manifest") ||
    // Server Function
    path.startsWith("/_serverFn/")
  ) {
    return next();
  }

  if (isPathValid(path)) {
    return next();
  }
  const response = c.text("Not Found", 404);
  // 只缓存 Shield 拦截的 404，保护正常 404
  Object.entries(CACHE_CONTROL.notFound).forEach(([k, v]) => {
    response.headers.set(k, v);
  });
  return response;
});

/* ======================= 站点维护模式 ====================== */
/**
 * 维护期间拦截非白名单请求，返回维护页（503）。
 * 白名单：后台 /admin、登录 /api/auth、静态资源 /assets、Server Functions /_serverFn。
 * 到结束时间后惰性自动恢复（getMaintenanceStatus 内部把 enabled 置回 false）。
 */
const MAINTENANCE_ALLOWED_PREFIXES = [
  "/admin",
  // 登录 / 找回密码 / 重置密码：管理员退出账号或忘记密码时能进入后台自救，
  // 否则维护模式下 /admin 重定向到 /login 会被拦截 → 永远进不了后台（死锁）
  "/login",
  "/forgot-password",
  "/reset-password",
  "/api/auth",
  "/assets/",
  "/favicon",
  "/apple-touch-icon",
  "/web-app-manifest",
  "/_serverFn/",
];

export const maintenanceMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    if (serverEnv(c.env).ENVIRONMENT === "dev") return next();

    const path = c.req.path;
    if (MAINTENANCE_ALLOWED_PREFIXES.some((p) => path.startsWith(p))) {
      return next();
    }

    const db = getDb(c.env);
    const status = await getMaintenanceStatus({
      db,
      env: c.env,
      executionCtx: getExecutionContext(c),
    });
    if (!status.active) return next();

    const config = await ConfigRepo.getSystemConfig(db);
    const siteTitle = config?.site?.title || "站点";

    return c.html(
      renderMaintenanceHtml({
        title: siteTitle,
        message: status.message || DEFAULT_MAINTENANCE_MESSAGE,
        endsAt: status.endsAt,
      }),
      503,
    );
  },
);

/* ======================= 人机验证 ====================== */
/**
 * 按 CAPTCHA_PROVIDER 分发到 Turnstile 或极验。
 *
 * 导出名保留 turnstileMiddleware，避免各 .api.ts / routes.ts 消费点改动；
 * 响应里的错误码同样沿用 TURNSTILE_* 以兼容既有前端处理。
 */
export const turnstileMiddleware = createMiddleware<{ Bindings: Env }>(
  async (c, next) => {
    const token =
      c.req.header(CAPTCHA_TOKEN_HEADER) ??
      c.req.header(LEGACY_CAPTCHA_TOKEN_HEADER);

    const verdict = await verifyCaptcha({ env: c.env, token });

    if (verdict.status === "missing-token") {
      return c.json(
        {
          code: "TURNSTILE_MISSING_TOKEN",
          message: "Missing captcha token",
        },
        400,
      );
    }

    if (verdict.status === "failed") {
      return c.json(
        {
          code: "TURNSTILE_VERIFICATION_FAILED",
          message: "Captcha verification failed",
        },
        403,
      );
    }

    return next();
  },
);
