import type { MiddlewareHandler } from "hono";

/**
 * 安全响应头中间件（Security Headers）
 * =====================================
 *
 * 为本站所有 HTTP 响应统一附加安全响应头。**部署即生效，无需在 Cloudflare 控制台额外配置。**
 *
 * ⚠️ 部署者必读：如果你在 Cloudflare 上部署本仓库，请确认此中间件已启用（默认启用），
 * 或在 Cloudflare 控制台 → Rules → Transform Rules 配置等价的响应头（二选一，避免重复添加）。
 *
 * 每个头的用途（安全测试实测本站此前全部缺失，见下文"缺失风险"）：
 *
 * 1. Content-Security-Policy（CSP）
 *    - 防 XSS / 注入：限制页面只能加载白名单内的脚本、样式、图片、连接等资源。
 *    - 本站资源均为同源（/assets、/images），故默认只放行 'self'。
 *    - ⚠️ 必须保留 `script-src 'unsafe-inline'`：TanStack Start SSR 会注入内联数据脚本，
 *      去掉会导致**首页白屏**。若想收紧到最高防护，需配合 nonce（见 docs/security-headers.md）。
 *    - ⚠️ 已放行 `static.cloudflareinsights.com`：Cloudflare Web Analytics 统计脚本
 *      （beacon.min.js）。如果关闭了 CF 统计或改用其它统计（如 umami），需相应调整。
 *    - ⚠️ 如果以后接入第三方统计（如 umami），需把统计域名加入 script-src / connect-src。
 *
 * 2. X-Frame-Options: DENY
 *    - 防点击劫持：禁止本页面被任何第三方页面以 iframe 嵌入。
 *
 * 3. X-Content-Type-Options: nosniff
 *    - 防 MIME 嗅探：禁止浏览器猜测响应类型（防止上传文件被当脚本执行）。
 *
 * 4. Strict-Transport-Security（HSTS）
 *    - 防 SSL 剥离：强制浏览器通过 HTTPS 访问本站。
 *    - ⚠️ `includeSubDomains` 会连带所有子域；若子域存在 HTTP 内容请去掉该项。
 *
 * 5. Referrer-Policy: strict-origin-when-cross-origin
 *    - 防 URL 泄露：同源请求携带完整来源，跨源只携带域名，不泄露路径/查询串。
 *
 * 6. Permissions-Policy
 *    - 限制浏览器 API：关闭本站用不到的摄像头/麦克风/定位/支付等能力，减少被滥用面。
 *
 * 【实测背景】安全测试发现改造前本站 6 个安全头全部缺失，存在点击劫持、MIME 嗅探、
 * SSL 剥离等风险。此中间件即针对该问题的一次性收口。
 *
 * 修改方式：直接改下方各头的取值即可，无需改动其它代码。
 */
export const securityHeadersMiddleware: MiddlewareHandler = async (c, next) => {
  await next();

  const CSP = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' blob:",
    "connect-src 'self' https://static.cloudflareinsights.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  c.header("Content-Security-Policy", CSP);
  c.header("X-Frame-Options", "DENY");
  c.header("X-Content-Type-Options", "nosniff");
  c.header(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains",
  );
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
  c.header(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
};
