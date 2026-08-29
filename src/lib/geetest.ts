/**
 * 极验（GeeTest）v4 行为验证 —— 服务端二次校验。
 *
 * 官方文档：https://docs.geetest.com/gt4/apirefer/api/server/
 * 流程：前端验证通过后拿到 4 个参数，业务请求带上它们，
 *      服务端用私钥对 lot_number 做 HMAC-SHA256 生成 sign_token，
 *      再连同其余参数 POST 到极验二次校验接口确认本次验证有效。
 */

const GEETEST_VALIDATE_URL = "https://gcaptcha4.geetest.com/validate";

/** 极验接口超时时间。超时按放行处理，避免第三方抖动阻断业务。 */
const GEETEST_TIMEOUT_MS = 5000;

/** 前端 `captcha.getValidate()` 返回的 4 个字段 */
export interface GeetestPayload {
  lot_number: string;
  captcha_output: string;
  pass_token: string;
  gen_time: string;
}

export interface GeetestResult {
  success: boolean;
  /** 极验返回的失败原因，或本地判定的失败/放行原因 */
  reason?: string;
}

interface GeetestValidateResponse {
  result?: string;
  reason?: string;
  status?: string;
  msg?: string;
}

/**
 * 解析请求头里携带的极验 token。
 * 前端把 4 个字段 JSON 序列化后放进单个请求头，这里还原并做字段校验。
 */
export function parseGeetestToken(raw: string): GeetestPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  const { lot_number, captcha_output, pass_token, gen_time } =
    parsed as Record<string, unknown>;

  if (
    typeof lot_number !== "string" ||
    typeof captcha_output !== "string" ||
    typeof pass_token !== "string" ||
    typeof gen_time !== "string" ||
    !lot_number ||
    !captcha_output ||
    !pass_token ||
    !gen_time
  ) {
    return null;
  }

  return { lot_number, captcha_output, pass_token, gen_time };
}

/**
 * 标准 HMAC-SHA256：以私钥为 key、lot_number 为 message，输出十六进制字符串。
 * Workers 运行时用 Web Crypto，无需额外依赖。
 */
async function hmacSha256Hex(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    encoder.encode(message),
  );

  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyGeetestToken({
  secretKey,
  captchaId,
  payload,
}: {
  /** 极验后台的 captcha_key（私钥） */
  secretKey: string;
  /** 极验后台的 captcha_id（验证 ID） */
  captchaId?: string;
  payload: GeetestPayload;
}): Promise<GeetestResult> {
  const signToken = await hmacSha256Hex(secretKey, payload.lot_number);

  const body = new URLSearchParams({
    lot_number: payload.lot_number,
    captcha_output: payload.captcha_output,
    pass_token: payload.pass_token,
    gen_time: payload.gen_time,
    sign_token: signToken,
  });

  // captcha_id 放在 query 上，便于极验侧日志按 id 定位异常请求
  const url = captchaId
    ? `${GEETEST_VALIDATE_URL}?captcha_id=${encodeURIComponent(captchaId)}`
    : GEETEST_VALIDATE_URL;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(GEETEST_TIMEOUT_MS),
    });

    if (!res.ok) {
      // 按极验官方建议：接口异常时放行，避免第三方故障拖垮登录/评论等主流程
      return { success: true, reason: "geetest api unavailable" };
    }

    const data = (await res.json()) as GeetestValidateResponse;

    // 请求异常形态：{ status: "error", code, msg }
    if (data.status === "error") {
      return { success: true, reason: data.msg ?? "geetest api error" };
    }

    return {
      success: data.result === "success",
      reason: data.reason,
    };
  } catch {
    return { success: true, reason: "request geetest api fail" };
  }
}
