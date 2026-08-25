import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { TurnstileProps } from "@/components/common/turnstile";

export interface RegisterSchema {
  name: string;
  email: string;
  verificationCode: string;
  password: string;
  confirmPassword: string;
}

export interface RegisterFormData {
  register: UseFormRegister<RegisterSchema>;
  errors: FieldErrors<RegisterSchema>;
  handleSubmit: (e?: React.BaseSyntheticEvent) => Promise<void>;
  isSubmitting: boolean;
  isSuccess: boolean;
  turnstileProps: TurnstileProps;
  turnstilePending: boolean;
  /** Send verification code to the email address */
  sendCode: () => Promise<void>;
  /** Whether a verification code is currently being sent */
  isSendingCode: boolean;
  /** Countdown seconds remaining before code can be resent (0 = can send) */
  codeCountdown: number;
}

export interface RegisterPageProps {
  isEmailConfigured: boolean;
  registerForm: RegisterFormData;
  turnstileElement: React.ReactNode;
}
