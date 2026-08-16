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
  /** float（浮动弹窗）模式下调用，弹出验证码浮层 */
  showCaptcha: () => void;
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
 * 极验 v4 行为验证组件（float 弹窗模式）。
 * 仅在客户端渲染 —— 由上层 <Captcha> 统一做 mounted / provider 守卫。
 *
 * 与 Turnstile（常驻）不同，极验采用 float 弹窗：**页面不常驻验证框**，
 * 由调用方在提交按钮上触发 handleRef.showCaptcha() 弹出浮层；
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
  // float 弹窗模式：需要一个隐藏的挂载锚点（极验浮层依赖 appendTo 的容器才能弹出）。
  // 容器本身 display:none 常驻隐藏，验证码仅在 showCaptcha() 弹出时可见。
  const rawId = useId();
  const anchorId = `geetest-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`;
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
            // float 模式必须 appendTo 到挂载点（隐藏锚点），showCaptcha() 才会正常弹出浮层
            instance.appendTo(`#${anchorId}`);

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
                showCaptcha: () => instance.showCaptcha(),
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
  }, [captchaId, onVerify, onError, onExpire, handleRef]);

  // float 弹窗模式：渲染一个"移出屏幕"的锚点容器（极验浮层挂载点）。
  // 不能用 display:none（会把弹出后的浮层一并隐藏），
  // 而是绝对定位移出可视区：页面不可见，showCaptcha() 弹出浮层时（浮层 fixed 定位到视口）可见。
  return (
    <div
      id={anchorId}
      style={{ position: "fixed", top: "-9999px", left: "-9999px" }}
    />
  );
}
