import {
  createFileRoute,
  redirect,
  useRouteContext,
} from "@tanstack/react-router";
import theme from "@theme";
import { Turnstile, useTurnstile } from "@/components/common/turnstile";
import { useRegisterForm } from "@/features/auth/hooks";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/_auth/register")({
  beforeLoad: ({ context }) => {
    if (!context.enableEmail) {
      throw redirect({ to: "/login" });
    }
  },
  component: RouteComponent,
  head: () => ({
    meta: [
      {
        title: m.register_title(),
      },
    ],
  }),
});

function RouteComponent() {
  const { isEmailConfigured, requireEmailVerification } = useRouteContext({ from: "/_auth" });
  const {
    reset: resetTurnstile,
    ensureVerified,
    turnstileProps,
  } = useTurnstile("register");

  const registerForm = useRegisterForm({
    // 弹窗触发模式：验证码不因"未验证"禁用提交按钮，点击提交时由 ensureVerified() 触发
    turnstilePending: false,
    resetTurnstile,
    isEmailConfigured,
    requireEmailVerification,
  });

  // 提交前先确保人机验证通过（点击提交按钮才弹出验证码），通过后再真正提交
  const rawSubmit = registerForm.handleSubmit;
  registerForm.handleSubmit = async (e?: React.BaseSyntheticEvent) => {
    e?.preventDefault?.();
    const ok = await ensureVerified();
    if (ok) await rawSubmit(e);
  };

  // 发送验证码前也先确保人机验证通过
  const rawSendCode = registerForm.sendCode;
  registerForm.sendCode = async () => {
    const ok = await ensureVerified();
    if (ok) await rawSendCode();
  };

  const turnstileElement = (
    <div className="flex justify-center">
      <Turnstile {...turnstileProps} />
    </div>
  );

  return (
    <theme.RegisterPage
      isEmailConfigured={isEmailConfigured}
      requireEmailVerification={requireEmailVerification}
      registerForm={{ ...registerForm, turnstileProps } as never}
      turnstileElement={turnstileElement}
    />
  );
}
