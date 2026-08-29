import { z } from "zod";

const domainRegex = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const localeSchema = z.enum(["zh", "en"]);
const captchaProviderSchema = z.enum(["turnstile", "geetest", "none"]);
const domainSchema = z
  .string()
  .regex(domainRegex, "Must be a valid domain (e.g., www.example.com)");

const serverEnvSchema = z.object({
  BETTER_AUTH_SECRET: z.string(),
  BETTER_AUTH_URL: z.url(),
  /**
   * 管理员邮箱（运行时 secret 或 var）。
   * 未配置时使用默认值 admin@example.com，可登录后修改。
   */
  ADMIN_EMAIL: z.email().catch("admin@example.com"),
  /**
   * 管理员初始密码（运行时 secret，改完无需重新构建）。
   * 未配置时使用默认值 admin123456，可登录后在后台修改。
   * 用 `wrangler secret put ADMIN_PASSWORD` 注入，切勿写进 wrangler.jsonc。
   */
  ADMIN_PASSWORD: z.string().catch("admin123456"),
  LOCALE: localeSchema.catch("zh"),
  GITHUB_CLIENT_ID: z.string(),
  GITHUB_CLIENT_SECRET: z.string(),
  CLOUDFLARE_ZONE_ID: z.string(),
  CLOUDFLARE_PURGE_API_TOKEN: z.string(),
  DOMAIN: domainSchema,
  CDN_DOMAIN: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined)
    .refine(
      (v) => v === undefined || domainRegex.test(v),
      "Must be a valid domain (e.g., cdn.example.com)",
    ),
  ENVIRONMENT: z.enum(["dev", "prod", "test"]).optional(),
  VITE_UMAMI_WEBSITE_ID: z.string().optional(),
  UMAMI_SRC: z.string().optional(),
  PAGEVIEW_SALT: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  /**
   * 人机验证服务商切换开关，运行时 secret，改完无需重新构建。
   * 未配置或取值非法时回落到 turnstile，保持与历史部署一致的行为。
   */
  CAPTCHA_PROVIDER: captchaProviderSchema.catch("turnstile"),
  /** 极验 v4 服务端私钥（对应极验后台的 captcha_key），仅服务端可见 */
  GEETEST_CAPTCHA_KEY: z.string().optional(),
  /**
   * 极验 v4 验证 ID。本身是公开值（前端也会用到），
   * 二次校验请求需要带上它，因此运行时同样注入一份。
   */
  VITE_GEETEST_CAPTCHA_ID: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
});

export type CaptchaProvider = z.infer<typeof captchaProviderSchema>;

export function serverEnv(env: Env) {
  const result = serverEnvSchema.safeParse(env);

  if (!result.success) {
    console.error(
      JSON.stringify({
        message: "Invalid environment variables",
        error: z.treeifyError(result.error),
      }),
    );
    throw new Error("Invalid environment variables");
  }

  return result.data;
}

export const isNotInProduction = (env: Env) =>
  serverEnv(env).ENVIRONMENT === "test" || serverEnv(env).ENVIRONMENT === "dev";
