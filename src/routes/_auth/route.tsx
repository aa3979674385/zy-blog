import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import theme from "@theme";
import {
  authSettingsQuery,
  emailConfiguredQuery,
  sessionQuery,
} from "@/features/auth/queries";
import { useNavigateBack } from "@/hooks/use-navigate-back";
import { CACHE_CONTROL } from "@/lib/constants";

export const Route = createFileRoute("/_auth")({
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    // 并行查询：session / email配置 / 登录方式设置 同时发起，不再串行等待
    const [sessionResult, isEmailConfigured, authSettings] = await Promise.all([
      context.queryClient.fetchQuery(sessionQuery).catch(() => null),
      context.queryClient.fetchQuery(emailConfiguredQuery),
      context.queryClient.fetchQuery(authSettingsQuery),
    ]);
    const session = sessionResult;
    const authMethod = authSettings.methods; // "email" | "oauth" | "both"

    // 邮箱表单显隐只由「登录方式」开关决定，不再依赖 SMTP 是否已配置
    // （SMTP 未配置时注册会在服务端报错，但表单应当照常出现）。
    const enableEmail = authMethod === "email" || authMethod === "both";
    const enableGithub = authMethod === "oauth" || authMethod === "both";

    if (session && !location.pathname.includes("verify-email")) {
      throw redirect({ to: "/" });
    }

    return {
      session,
      isEmailConfigured,
      authMethod,
      enableEmail,
      enableGithub,
    };
  },
  component: RouteComponent,
  headers: () => {
    return CACHE_CONTROL.private;
  },
});

function RouteComponent() {
  const navigateBack = useNavigateBack();
  return (
    <>
      <theme.AuthLayout onBack={navigateBack}>
        <Outlet />
      </theme.AuthLayout>
      <theme.Toaster />
    </>
  );
}
