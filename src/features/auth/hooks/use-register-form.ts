import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AUTH_KEYS } from "@/features/auth/queries";
import { usePreviousLocation } from "@/hooks/use-previous-location";
import { getCaptchaToken } from "@/components/common/captcha";
import { authClient } from "@/lib/auth/auth.client";
import { getRegisterAuthErrorMessage } from "@/lib/auth/auth-errors";
import type { Messages } from "@/lib/i18n";
import { m } from "@/paraglide/messages";

const createRegisterSchema = (messages: Messages) =>
  z
    .object({
      name: z
        .string()
        .min(2, messages.register_validation_name_min())
        .max(20, messages.register_validation_name_max()),
      email: z.email(messages.register_validation_email_invalid()),
      verificationCode: z
        .string()
        .min(6, messages.register_validation_code_min())
        .max(6, messages.register_validation_code_max()),
      password: z.string().min(8, messages.register_validation_password_min()),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: messages.register_validation_password_mismatch(),
      path: ["confirmPassword"],
    });

type RegisterSchema = z.infer<ReturnType<typeof createRegisterSchema>>;

export interface UseRegisterFormOptions {
  turnstilePending: boolean;
  resetTurnstile: () => void;
  isEmailConfigured: boolean;
}

export function useRegisterForm(options: UseRegisterFormOptions) {
  const {
    turnstilePending,
    resetTurnstile,
    isEmailConfigured,
  } = options;

  const [isSuccess, setIsSuccess] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [codeCountdown, setCodeCountdown] = useState(0);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const navigate = useNavigate();
  const previousLocation = usePreviousLocation();
  const queryClient = useQueryClient();
  const registerSchema = createRegisterSchema(m);

  const form = useForm<RegisterSchema>({
    resolver: standardSchemaResolver(registerSchema),
  });

  // Cleanup countdown timer on unmount
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  const startCountdown = useCallback(() => {
    setCodeCountdown(60);
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }
    countdownTimerRef.current = setInterval(() => {
      setCodeCountdown((prev) => {
        if (prev <= 1) {
          if (countdownTimerRef.current) {
            clearInterval(countdownTimerRef.current);
            countdownTimerRef.current = null;
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  const sendCode = useCallback(async () => {
    const email = form.getValues("email");
    if (!email) {
      toast.error(m.register_toast_email_required());
      return;
    }

    // Validate email format before sending
    const emailResult = registerSchema.shape.email.safeParse(email);
    if (!emailResult.success) {
      toast.error(m.register_validation_email_invalid());
      return;
    }

    setIsSendingCode(true);
    try {
      const response = await fetch("/api/auth/send-verification-code", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Turnstile-Token": getCaptchaToken() ?? "",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (data.code === "EMAIL_ALREADY_REGISTERED") {
          toast.error(m.register_toast_email_registered());
        } else if (data.code === "RATE_LIMITED") {
          toast.error(m.register_toast_rate_limited());
        } else {
          toast.error(m.register_toast_code_send_failed(), {
            description: data.message ?? m.register_error_default(),
          });
        }
        return;
      }

      toast.success(m.register_toast_code_sent());
      startCountdown();
    } catch {
      toast.error(m.register_toast_code_send_failed());
    } finally {
      setIsSendingCode(false);
    }
  }, [form, registerSchema, startCountdown]);

  const onSubmit = async (data: RegisterSchema) => {
    const { error } = await authClient.signUp.email({
      email: data.email,
      password: data.password,
      name: data.name,
      callbackURL: `${window.location.origin}/verify-email`,
      fetchOptions: {
        headers: {
          "X-Turnstile-Token": getCaptchaToken() ?? "",
          "X-Email-Verification-Code": data.verificationCode,
        },
      },
    });

    resetTurnstile();

    if (error) {
      toast.error(m.register_toast_failed(), {
        description:
          getRegisterAuthErrorMessage(error, m) ?? m.register_error_default(),
      });
      return;
    }

    queryClient.removeQueries({ queryKey: AUTH_KEYS.session });

    // With verification code flow, email is already verified at registration.
    // User can log in directly — no need to wait for verification email.
    toast.success(m.register_toast_success(), {
      description: m.register_toast_activated(),
    });
    navigate({ to: previousLocation });
  };

  return {
    register: form.register,
    errors: form.formState.errors,
    handleSubmit: form.handleSubmit(onSubmit),
    isSubmitting: form.formState.isSubmitting,
    isSuccess,
    turnstilePending,
    sendCode,
    isSendingCode,
    codeCountdown,
  };
}

export type UseRegisterFormReturn = ReturnType<typeof useRegisterForm>;
