/**
 * 人机验证统一入口（服务端）。
 *
 * Hono 中间件与 TanStack Server Function 中间件共用这里的分发逻辑，
 * 保证两条链路对「当前用哪家、校验是否通过」的判断完全一致。
 */

import type { CaptchaProvider } from "@/lib/env/server.env";
import { serverEnv } from "@/lib/env/server.env";
import { parseGeetestToken, verifyGeetestToken } from "@/lib/geetest";
import { verifyTurnstileToken } from "@/lib/turnstile";

/** 统一的验证码请求头 */
export const CAPTCHA_TOKEN_HEADER = "X-Captcha-Token";
/** 历史请求头，Turnstile 时期沿用至今，继续兼容 */
export const LEGACY_CAPTCHA_TOKEN_HEADER = "X-Turnstile-Token";

export type CaptchaVerdict =
  /** 未启用验证（未配置服务商或缺少对应密钥），直接放行 */
  | { status: "skip" }
  | { status: "ok" }
  | { status: "missing-token" }
  | { status: "failed" };

/**
 * 解析实际生效的服务商。
 *
 * 规则（安全兜底，和历史行为一致）：
 * - 只有「切换变量明确指向某家」且「该家密钥齐全」时才启用对应验证；
 * - 切换变量、两家密钥全都没填 → 视为 none（不启用，直接放行）；
 * - 切换变量未填但有 TURNSTILE_SECRET_KEY（历史遗留）→ 仍按 turnstile 启用，保证老部署不回退；
 * - 选了某家但缺密钥 → 降级为 none，不会把用户挡在门外。
 */
export function resolveCaptchaProvider(env: Env): CaptchaProvider {
  const config = serverEnv(env);

  switch (config.CAPTCHA_PROVIDER) {
    case "turnstile":
      return config.TURNSTILE_SECRET_KEY ? "turnstile" : "none";
    case "geetest":
      // 极验需要 secret key 与 captcha_id 两者齐全，缺一视为未启用
      return config.GEETEST_CAPTCHA_KEY && config.VITE_GEETEST_CAPTCHA_ID
        ? "geetest"
        : "none";
    default:
      // CAPTCHA_PROVIDER 未配置：保持历史行为，有 TURNSTILE_SECRET_KEY 才启用
      return config.TURNSTILE_SECRET_KEY ? "turnstile" : "none";
  }
}

/**
 * 校验一次人机验证。token 由请求头携带，具体格式取决于服务商：
 * - turnstile：Cloudflare 下发的不透明字符串
 * - geetest：4 个字段 JSON 序列化后的字符串
 */
export async function verifyCaptcha({
  env,
  token,
}: {
  env: Env;
  token: string | undefined | null;
}): Promise<CaptchaVerdict> {
  const provider = resolveCaptchaProvider(env);
  if (provider === "none") return { status: "skip" };

  if (!token) return { status: "missing-token" };

  const config = serverEnv(env);

  if (provider === "turnstile") {
    const secretKey = config.TURNSTILE_SECRET_KEY;
    if (!secretKey) return { status: "skip" };

    const result = await verifyTurnstileToken({ secretKey, token });
    return result.success ? { status: "ok" } : { status: "failed" };
  }

  const secretKey = config.GEETEST_CAPTCHA_KEY;
  if (!secretKey) return { status: "skip" };

  const payload = parseGeetestToken(token);
  if (!payload) return { status: "failed" };

  const result = await verifyGeetestToken({
    secretKey,
    captchaId: config.VITE_GEETEST_CAPTCHA_ID,
    payload,
  });

  return result.success ? { status: "ok" } : { status: "failed" };
}
