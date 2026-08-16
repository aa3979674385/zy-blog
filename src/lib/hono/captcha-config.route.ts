import { Hono } from "hono";
import { resolveCaptchaProvider } from "@/lib/captcha";
import { CACHE_CONTROL } from "@/lib/constants";

/**
 * 人机验证配置探测接口（公开、无需鉴权）。
 *
 * 客户端在运行时读取当前启用的验证服务商，据此决定渲染 Turnstile 还是极验。
 * 之所以走接口而不是构建期变量：切换服务商只需改运行时 secret，
 * 无需重新构建和部署，Turnstile 被墙/抖动时可以立刻切到极验。
 *
 * 刻意不挂 baseMiddleware —— 不初始化 DB / Auth，保持极低开销；
 * 同时用 no-store 关闭 CDN 与 Workers 缓存，确保切换即时生效。
 */
const app = new Hono<{ Bindings: Env }>();

const route = app.get("/", (c) => {
  // 复用中间件同一套解析逻辑：选了服务商却没配密钥时同样返回 none，
  // 避免前端渲染出一个服务端根本不会校验的验证框。
  const provider = resolveCaptchaProvider(c.env);

  Object.entries(CACHE_CONTROL.private).forEach(([k, v]) => {
    c.res.headers.set(k, v);
  });

  return c.json({ provider });
});

export default route;
