import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import type { CaptchaHandle } from "./captcha-types";

const TURNSTILE_SCRIPT_URL =
  "https://challenges.cloudflare.com/turnstile/v0/api.js";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: Record<string, unknown>,
      ) => string;
      reset: (widgetId: string) => void;
      remove: (widgetId: string) => void;
    };
  }
}

let scriptLoadPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptLoadPromise = null;
      reject(new Error("Failed to load Turnstile script"));
    };
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

export interface TurnstileWidgetProps {
  siteKey: string;
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  action?: string;
  handleRef?: RefObject<CaptchaHandle | null>;
}

/**
 * Cloudflare Turnstile 验证组件。
 * 仅在客户端渲染 —— 由上层 <Captcha> 统一做 mounted / provider 守卫。
 */
export function TurnstileWidget({
  siteKey,
  onVerify,
  onError,
  onExpire,
  action,
  handleRef,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    let isMounted = true;

    loadScript()
      .then(() => {
        if (!isMounted || !containerRef.current || !window.turnstile) return;

        const id = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          callback: onVerify,
          "error-callback": onError,
          "expired-callback": onExpire,
          action,
          appearance: "always",
        });
        widgetIdRef.current = id;

        if (handleRef) {
          handleRef.current = {
            reset: () => {
              if (widgetIdRef.current && window.turnstile) {
                window.turnstile.reset(widgetIdRef.current);
              }
            },
          };
        }
      })
      .catch(() => {
        // Turnstile script failed to load — skip silently
      });

    return () => {
      isMounted = false;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
      if (handleRef) {
        handleRef.current = null;
      }
    };
  }, [siteKey, onVerify, onError, onExpire, action, handleRef]);

  return <div ref={containerRef} />;
}
