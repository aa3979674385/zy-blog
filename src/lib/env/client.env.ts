import z from "zod";

const clientEnvSchema = z.object({
  VITE_UMAMI_WEBSITE_ID: z.string().optional(),
  /** Cloudflare Turnstile 客户端站点密钥（构建期打包进前端） */
  VITE_TURNSTILE_SITE_KEY: z.string().optional(),
  /** 极验 v4 验证 ID（构建期打包进前端，对应极验后台的 captcha_id） */
  VITE_GEETEST_CAPTCHA_ID: z.string().optional(),
});

export function clientEnv() {
  return clientEnvSchema.parse(import.meta.env);
}
