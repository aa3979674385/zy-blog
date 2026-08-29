import type { RefObject } from "react";

/** 各家验证组件对外暴露的统一控制句柄 */
export interface CaptchaHandle {
  /** 重置验证框以获取新 token（token 均为一次性） */
  reset: () => void;
  /**
   * 主动触发验证（"点击按钮才弹验证码"模式）：
   * - 极验（float 弹窗）：调用后弹出验证码浮层，验证通过走 onVerify。
   * - Turnstile（常驻 managed）：验证框已常驻展示，此处为空操作，保持原行为。
   * 未实现时（老组件/降级）可为 undefined，调用方用可选调用。
   */
  showCaptcha?: () => void;
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
