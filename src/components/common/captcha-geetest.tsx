import type { RefObject } from "react";
import { useEffect, useId, useRef } from "react";
import type { CaptchaHandle } from "./captcha-types";

const GEETEST_SCRIPT_URL = "https://static.geetest.com/v4/gt4.js";

/** 前端验证通过后 getValidate() 返回的字段，需原样交给服务端二次校验 */
interface GeetestValidateResult {
  lot_number: string;
  captcha_output: string;
  pass_token: string;
  gen_time: string;
}

interface GeetestInstance {
  appendTo: (selector: string | HTMLElement) => void;
  getValidate: () => GeetestValidateResult | null;
  onSuccess: (handler: () => void) => void;
  onError: (handler: () => void) => void;
  onFail: (handler: () => void) => void;
  reset: () => void;
  destroy?: () => void;
}

declare global {
  interface Window {
    initGeetest4?: (
      config: Record<string, unknown>,
      callback: (instance: GeetestInstance) => void,
    ) => void;
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.initGeetest4) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = GEETEST_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadPromise = null;
      reject(new Error("Failed to load GeeTest script"));
    };
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

/** 极验语言码与站点语言的映射，取不到时按中文处理 */
function resolveLanguage(): string {
  if (typeof document === "undefined") return "zho";
  return document.documentElement.lang.toLowerCase().startsWith("en")
    ? "eng"
    : "zho";
}

export interface GeetestWidgetProps {
  captchaId: string;
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  handleRef?: RefObject<CaptchaHandle | null>;
}

/**
 * 极验 v4 行为验证组件。
 * 仅在客户端渲染 —— 由上层 <Captcha> 统一做 mounted / provider 守卫。
 *
 * 验证通过后把 4 个字段序列化成一个字符串交给上层，
 * 这样与 Turnstile 一样只需在请求头里带一个 token，服务端再按服务商解析。
 */
export function GeetestWidget({
  captchaId,
  onVerify,
  onError,
  onExpire,
  handleRef,
}: GeetestWidgetProps) {
  // appendTo 走 CSS 选择器，useId 生成的 ":" 在选择器里非法，需要剔除
  const rawId = useId();
  const containerId = `geetest-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const instanceRef = useRef<GeetestInstance | null>(null);

  useEffect(() => {
    let isMounted = true;

    loadScript()
      .then(() => {
        if (!isMounted || !window.initGeetest4) return;

        window.initGeetest4(
          {
            captchaId,
            product: "float",
            language: resolveLanguage(),
          },
          (instance) => {
            if (!isMounted) {
              instance.destroy?.();
              return;
            }

            instanceRef.current = instance;
            instance.appendTo(`#${containerId}`);

            instance.onSuccess(() => {
              const result = instance.getValidate();
              if (!result) return;
              onVerify(JSON.stringify(result));
            });

            // 用户挑战失败：清空已有 token，等待重新验证
            instance.onFail(() => {
              onExpire?.();
            });

            instance.onError(() => {
              onError?.();
            });

            if (handleRef) {
              handleRef.current = {
                reset: () => instance.reset(),
              };
            }
          },
        );
      })
      .catch(() => {
        // GeeTest script failed to load — skip silently
      });

    return () => {
      isMounted = false;
      instanceRef.current?.destroy?.();
      instanceRef.current = null;
      if (handleRef) {
        handleRef.current = null;
      }
    };
  }, [captchaId, containerId, onVerify, onError, onExpire, handleRef]);

  return <div id={containerId} />;
}
