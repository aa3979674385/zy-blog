import type { RefObject } from "react";

/** 各家验证组件对外暴露的统一控制句柄 */
export interface CaptchaHandle {
  /** 重置验证框以获取新 token（token 均为一次性） */
  reset: () => void;
}

/**
 * 验证组件的公共 props。
 * 字段名与历史 TurnstileProps 保持一致，主题契约与各调用点无需改动。
 */
export interface CaptchaProps {
  onVerify: (token: string) => void;
  onError?: () => void;
  onExpire?: () => void;
  action?: string;
  /** 历史命名，实际承载的是统一控制句柄 */
  widgetIdRef?: RefObject<CaptchaHandle | null>;
  /**
   * 懒加载激活开关（仅 useCaptcha({ lazy: true }) 时使用）。
   * - 省略或 true：立即渲染验证框（默认行为，兼容既有调用点）。
   * - false：未激活，不发起探测、不渲染验证框，需调用 activate()/ensureVerified() 才激活。
   */
  activated?: boolean;
}

export type CaptchaProviderName = "turnstile" | "geetest" | "none";
