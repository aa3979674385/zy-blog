import { useCallback, useEffect, useRef, useState } from "react";
import { clientEnv } from "@/lib/env/client.env";
import { GeetestWidget } from "./captcha-geetest";
import { TurnstileWidget } from "./captcha-turnstile";
import type {
  CaptchaHandle,
  CaptchaProps,
  CaptchaProviderName,
} from "./captcha-types";

export type { CaptchaHandle, CaptchaProps, CaptchaProviderName };

declare global {
  interface Window {
    __captchaToken?: string | null;
  }
}

/**
 * 读取当前全局验证 token，供 TanStack Server Function 的客户端中间件注入请求头。
 */
export function getCaptchaToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.__captchaToken || null;
}

function setCaptchaToken(token: string | null): void {
  if (typeof window !== "undefined") {
    window.__captchaToken = token;
  }
}

const CAPTCHA_CONFIG_URL = "/api/captcha-config";
const CONFIG_TIMEOUT_MS = 5000;

/**
 * 探测结果按页面生命周期缓存：整页只请求一次，
 * 切换服务商后用户刷新页面即可生效。
 */
let providerPromise: Promise<CaptchaProviderName> | null = null;

/**
 * 探测失败时的兜底：按构建期是否烤入 Turnstile 站点密钥判断，
 * 与接入极验之前的行为保持一致，不会因为接口异常把用户挡在门外。
 */
function fallbackProvider(): CaptchaProviderName {
  return clientEnv().VITE_TURNSTILE_SITE_KEY ? "turnstile" : "none";
}

function fetchProvider(): Promise<CaptchaProviderName> {
  if (providerPromise) return providerPromise;

  providerPromise = (async () => {
    try {
      const res = await fetch(CAPTCHA_CONFIG_URL, {
        signal: AbortSignal.timeout(CONFIG_TIMEOUT_MS),
      });
      if (!res.ok) return fallbackProvider();

      const data = (await res.json()) as { provider?: string };
      if (
        data.provider === "turnstile" ||
        data.provider === "geetest" ||
        data.provider === "none"
      ) {
        return data.provider;
      }
      return fallbackProvider();
    } catch {
      return fallbackProvider();
    }
  })();

  return providerPromise;
}

/**
 * 把服务端下发的 provider 结合构建期公钥解析为真正要渲染的服务商。
 * 服务端说用某家但构建期没烤进对应公钥时降级为 none —— 否则验证框渲染不出来，
 * isPending 会永远为真，把提交按钮永久禁用。
 */
function resolveProviderValue(
  provider: CaptchaProviderName | null,
  env: ReturnType<typeof clientEnv>,
): CaptchaProviderName | null {
  if (provider === "turnstile") {
    return env.VITE_TURNSTILE_SITE_KEY ? "turnstile" : "none";
  }
  if (provider === "geetest") {
    return env.VITE_GEETEST_CAPTCHA_ID ? "geetest" : "none";
  }
  return provider;
}

/**
 * 解析真正要渲染的服务商。
 * enabled=false 时不发起探测（懒加载：未激活前不发 captcha-config 请求）。
 */
function useResolvedProvider(enabled = true): {
  mounted: boolean;
  provider: CaptchaProviderName | null;
} {
  const [mounted, setMounted] = useState(false);
  const [provider, setProvider] = useState<CaptchaProviderName | null>(null);

  // 服务端渲染时拿不到 window，也读不到 import.meta.env 的 VITE_* 值。
  // 首屏两端统一按未挂载处理，挂载后再探测，避免结构不一致触发 #419。
  // enabled 变为 true 时必须重新发起探测（懒加载激活）。
  useEffect(() => {
    if (!enabled) return;
    setMounted(true);
    let alive = true;
    fetchProvider().then((value) => {
      if (alive) setProvider(value);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  const env = clientEnv();
  return { mounted, provider: resolveProviderValue(provider, env) };
}

/**
 * 人机验证组件，按运行时配置渲染 Turnstile 或极验。
 * 未启用验证或尚未激活（懒加载）时渲染 null，调用方无需关心当前用的是哪家。
 */
export function Captcha({
  onVerify,
  onError,
  onExpire,
  action,
  widgetIdRef,
  activated = true,
}: CaptchaProps) {
  const { mounted, provider } = useResolvedProvider(activated);
  const env = clientEnv();

  if (!activated || !mounted || !provider || provider === "none") return null;

  if (provider === "geetest") {
    const captchaId = env.VITE_GEETEST_CAPTCHA_ID;
    if (!captchaId) return null;

    return (
      <GeetestWidget
        captchaId={captchaId}
        onVerify={onVerify}
        onError={onError}
        onExpire={onExpire}
        handleRef={widgetIdRef}
      />
    );
  }

  const siteKey = env.VITE_TURNSTILE_SITE_KEY;
  if (!siteKey) return null;

  return (
    <TurnstileWidget
      siteKey={siteKey}
      onVerify={onVerify}
      onError={onError}
      onExpire={onExpire}
      action={action}
      handleRef={widgetIdRef}
    />
  );
}

export interface UseCaptchaOptions {
  /**
   * 懒加载：默认 false（立即激活并渲染验证框）。
   * 设为 true 后，未调用 activate()/ensureVerified() 前不发起探测、不渲染验证框，
   * 适用于「打开页面就弹验证太频繁」的场景（评论区、会员兑换等）。
   */
  lazy?: boolean;
}

interface UseCaptchaResult {
  /** 当前生效的服务商，探测完成前为 null */
  provider: CaptchaProviderName | null;
  /** 是否已激活（懒加载模式下需主动 activate / ensureVerified） */
  activated: boolean;
  /** 已启用验证但尚未完成（含探测中），此时应禁用提交 */
  isPending: boolean;
  token: string | null;
  reset: () => void;
  /** 懒加载激活：幂等，调用即启用验证（并预热探测请求） */
  activate: () => void;
  /** 确保已完成人机验证：已有 token 直接通过；否则激活并等待用户完成挑战，超时（默认 30s）未通过返回 false */
  ensureVerified: (timeoutMs?: number) => Promise<boolean>;
  captchaProps: CaptchaProps;
  /** 历史命名别名，保持既有调用点与主题契约不变 */
  turnstileProps: CaptchaProps;
}

/**
 * 表单里使用人机验证的 hook（仅客户端生效）。
 * 返回 { isPending, token, reset, activate, ensureVerified, captchaProps }，
 * 把 captchaProps 展开到 <Captcha /> 上。
 * 用 isPending 控制提交按钮禁用，token 由中间件注入请求头。
 */
export function useCaptcha(
  action?: string,
  options?: UseCaptchaOptions,
): UseCaptchaResult {
  const lazy = options?.lazy ?? false;
  const [activated, setActivated] = useState(!lazy);
  const { mounted, provider } = useResolvedProvider(activated);
  const [token, setToken] = useState<string | null>(null);
  const widgetIdRef = useRef<CaptchaHandle | null>(null);

  // 用 ref 保存最新 token，避免 ensureVerified 的异步闭包读到过期值
  const tokenRef = useRef<string | null>(null);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // 等待 onVerify 完成的 waiter 队列（确保 Promise 不会永久挂起）
  const waitersRef = useRef<Array<(ok: boolean) => void>>([]);

  const resolveWaiters = useCallback((ok: boolean) => {
    const waiters = waitersRef.current;
    waitersRef.current = [];
    for (const w of waiters) w(ok);
  }, []);

  // 卸载时 flush，避免 ensureVerified 的 Promise 永久挂起
  useEffect(() => {
    return () => resolveWaiters(false);
  }, [resolveWaiters]);

  const onVerify = useCallback(
    (value: string) => {
      setToken(value);
      setCaptchaToken(value); // 同步到全局，供 TanStack 中间件读取
      resolveWaiters(true);
    },
    [resolveWaiters],
  );

  const onExpire = useCallback(() => {
    setToken(null);
    setCaptchaToken(null);
    resolveWaiters(false);
  }, [resolveWaiters]);

  const onError = useCallback(() => {
    resolveWaiters(false);
  }, [resolveWaiters]);

  /** 重置验证框以获取新 token（token 均为一次性） */
  const reset = useCallback(() => {
    setToken(null);
    setCaptchaToken(null);
    widgetIdRef.current?.reset();
  }, []);

  /** 懒加载激活：幂等，调用即启用验证（并预热探测请求） */
  const activate = useCallback(() => {
    setActivated(true);
    void fetchProvider();
  }, []);

  /**
   * 确保已完成人机验证：
   * - 已有 token 直接返回 true；
   * - 否则激活并等待用户完成挑战，超时（默认 30s）未通过返回 false；
   * - provider 为 none/null（未启用验证）时直接返回 true。
   */
  const ensureVerified = useCallback(
    async (timeoutMs = 30000): Promise<boolean> => {
      if (tokenRef.current) return true;
      activate();
      const provider = await fetchProvider();
      if (provider === "none" || provider === null) return true;
      return new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), timeoutMs);
        waitersRef.current.push((ok) => {
          clearTimeout(timer);
          resolve(ok);
        });
      });
    },
    [activate],
  );

  const captchaProps: CaptchaProps = {
    onVerify,
    onExpire,
    onError,
    action,
    widgetIdRef,
    activated,
  };

  return {
    provider,
    activated,
    isPending:
      mounted && activated && (provider === null || (provider !== "none" && !token)),
    token,
    reset,
    activate,
    ensureVerified,
    captchaProps,
    /** 历史命名别名，保持既有调用点与主题契约不变 */
    turnstileProps: captchaProps,
  };
}
