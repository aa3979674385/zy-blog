import { createFileRoute, redirect } from "@tanstack/react-router";
import theme from "@theme";
import { Turnstile, useTurnstile } from "@/components/common/turnstile";
import { useForgotPasswordForm } from "@/features/auth/hooks";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_auth/forgot-password")({
  beforeLoad: ({ context }) => {
    if (!context.enableEmail) {
      throw redirect({ to: "/login" });
    }
  },
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: m.forgot_password_title(),
      },
    ],
  }),
});

function RouteComponent() {
  const {
    reset: resetTurnstile,
    ensureVerified,
    turnstileProps,
  } = useTurnstile("forgot-password");

  const forgotPasswordForm = useForgotPasswordForm({
    // 弹窗触发模式：验证码不因"未验证"禁用提交按钮，点击提交时由 ensureVerified() 触发
    turnstilePending: false,
    resetTurnstile,
  });

  // 提交前先确保人机验证通过（点击提交按钮才弹出验证码），通过后再真正提交
  const rawSubmit = forgotPasswordForm.handleSubmit;
  forgotPasswordForm.handleSubmit = async (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault?.();
    const ok = await ensureVerified();
    if (ok) await rawSubmit(e);
  };

  const turnstileElement = (
    <div className="flex justify-center">
      <Turnstile {...turnstileProps} />
    </div>
  );

  return (
    <theme.ForgotPasswordPage
      forgotPasswordForm={{
        ...forgotPasswordForm,
        turnstileProps,
        turnstilePending: false,
      }}
      turnstileElement={turnstileElement}
    />
  );
}
