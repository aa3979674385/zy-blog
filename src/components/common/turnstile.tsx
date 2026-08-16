/**
 * 兼容层。
 *
 * 人机验证已支持 Turnstile / 极验多服务商切换，实现迁到 ./captcha。
 * 这里保留历史导出名，使既有调用点、主题契约（TurnstileProps）无需改动；
 * 新代码请直接引用 @/components/common/captcha。
 */

export {
  Captcha as Turnstile,
  getCaptchaToken as getTurnstileToken,
  useCaptcha as useTurnstile,
} from "./captcha";
export type { CaptchaProps as TurnstileProps } from "./captcha-types";
