import { TanStackDevtools } from "@tanstack/react-devtools";
import { useEffect, useRef } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  HeadContent,
  isRedirect,
  redirect,
  Scripts,
  useRouteContext,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import theme from "@theme";
import { ThemeProvider } from "@/components/common/theme-provider";
import { siteConfigQuery } from "@/features/config/queries";
import { setPostUrlSuffix } from "@/lib/post-url";
import { bannedStatusQuery } from "@/features/users/queries";
import TanStackQueryDevtools from "@/integrations/tanstack-query/devtools";
import { clientEnv } from "@/lib/env/client.env";
import { getLocale } from "@/paraglide/runtime";
import { authClient } from "@/lib/auth/auth.client";
import { clearAllDlLocalCache } from "@/features/post-resources/queries/dl-local-cache";
import { ClickEffect } from "@/components/common/click-effect";
import appCss from "@/styles.css?url";

interface MyRouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  beforeLoad: async ({ context, location }) => {
    // 站点配置：单个 serverFn 偶发失败/超时不应阻断整次导航（否则全站跳转卡在
    // pending 转圈、最终不跳转）。失败时回退到已有缓存，组件层 useQuery 会自愈。
    const siteConfig =
      await context.queryClient
        .ensureQueryData(siteConfigQuery)
        .catch(() =>
          context.queryClient.getQueryData(siteConfigQuery.queryKey) ?? null,
        );

    // 文章 URL 格式开关：在渲染任何子路由（含文章详情页 <Link>）之前写入，
    // 保证链接生成与路由解析都能同步读到当前模式。
    setPostUrlSuffix(siteConfig?.postUrlSuffix ?? "html");

    // 全站封禁拦截：已登录但被封禁的用户访问任何页面都跳转到 /banned
    if (location.pathname !== "/banned") {
      try {
        const ban = await context.queryClient.fetchQuery(bannedStatusQuery());
        if (ban?.banned) {
          throw redirect({ to: "/banned", search: { email: undefined } });
        }
      } catch (e) {
        // 让 redirect 正常传播；其它错误（如 RPC 失败）忽略，避免整站崩溃
        if (isRedirect(e)) throw e;
      }
    }

    return { siteConfig };
  },
  loader: async ({ context }) => {
    return { siteConfig: context.siteConfig };
  },
  head: ({ loaderData }) => {
    const env = clientEnv();

    return {
      meta: [
        {
          charSet: "utf-8",
        },
        {
          name: "viewport",
          content: "width=device-width, initial-scale=1",
        },
        {
          title: loaderData?.siteConfig?.title,
        },
        {
          name: "description",
          content: loaderData?.siteConfig?.description,
        },
      ],
      links: [
        {
          rel: "icon",
          type: "image/svg+xml",
          href: loaderData?.siteConfig?.icons.faviconSvg,
        },
        {
          rel: "icon",
          type: "image/png",
          href: loaderData?.siteConfig?.icons.favicon96,
          sizes: "96x96",
        },
        {
          rel: "shortcut icon",
          href: loaderData?.siteConfig?.icons.faviconIco,
        },
        {
          rel: "apple-touch-icon",
          type: "image/png",
          href: loaderData?.siteConfig?.icons.appleTouchIcon,
          sizes: "180x180",
        },
        {
          rel: "manifest",
          href: "/site.webmanifest",
        },
        {
          rel: "stylesheet",
          href: appCss,
        },
        {
          rel: "alternate",
          type: "application/rss+xml",
          title: "RSS Feed",
          href: "/rss.xml",
        },
        {
          rel: "alternate",
          type: "application/atom+xml",
          title: "Atom Feed",
          href: "/atom.xml",
        },
        {
          rel: "alternate",
          type: "application/feed+json",
          title: "JSON Feed",
          href: "/feed.json",
        },
      ],
      scripts: env.VITE_UMAMI_WEBSITE_ID
        ? [
            {
              src: "/stats.js",
              defer: true,
              "data-website-id": env.VITE_UMAMI_WEBSITE_ID,
            },
          ]
        : [],
    };
  },
  shellComponent: RootDocument,
});

/**
 * 下载模块本机缓存的「登录态失效器」：权限结果随登录身份变化，
 * 但缓存按 postId 存、且 queryFn 命中即返回（绕开 react-query 重查），
 * 所以必须在身份变化时主动清缓存 + 让挂载中的模块重查，否则会出现：
 *   未登录缓存「登录可见」→ 登录后仍显示「登录可见」
 *   未购买缓存「需购买」→ 购买后仍显示「需购买」
 * 登录 / 登出 / 切换账号都会触发；首次会话解析不计为变化（避免每次加载清空）。
 */
const DL_AUTH_BASELINE = Symbol("dl-auth-baseline");
function DlAuthCacheInvalidator() {
  const { data: session, isPending } = authClient.useSession();
  const qc = useQueryClient();
  const baseline = useRef<unknown>(DL_AUTH_BASELINE);
  useEffect(() => {
    if (isPending) return; // 会话尚未解析完成，不动
    const id = session?.user?.id ?? null;
    if (baseline.current === DL_AUTH_BASELINE) {
      baseline.current = id; // 首次解析：记基线，不清除
      return;
    }
    if (id !== baseline.current) {
      baseline.current = id;
      clearAllDlLocalCache();
      qc.invalidateQueries({ queryKey: ["publicPostResources"] });
    }
  }, [session?.user?.id, isPending, qc]);
  return null;
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const locale = getLocale();
  const { siteConfig } = useRouteContext({ from: "__root__" });

  // 客户端自愈：siteConfig 就绪 / 刷新后重新套用文章 URL 模式。
  // 根 beforeLoad 只在首次加载跑一次，若首屏那一刻配置未到（或匿名用户拿到的是 CDN 缓存的旧 HTML，
  // 脱水写入的是旧模式），模式会锁死在默认 html，导致「登录态显示 id、匿名态显示标题」这类不一致。
  // 这里只要 siteConfig 数据变化就重新 setPostUrlSuffix，<Link> 生成 href 时会重渲染到正确模式。
  const { data: liveConfig } = useQuery(siteConfigQuery);
  useEffect(() => {
    setPostUrlSuffix((liveConfig ?? siteConfig)?.postUrlSuffix ?? "html");
  }, [liveConfig, siteConfig]);

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      style={siteConfig ? theme.getDocumentStyle?.(siteConfig as never) : undefined}
    >
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <DlAuthCacheInvalidator />
        <ClickEffect />
        {import.meta.env.DEV && (
          <TanStackDevtools
            config={{
              position: "bottom-right",
            }}
            plugins={[
              {
                name: "Tanstack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
              TanStackQueryDevtools,
            ]}
          />
        )}
        <Scripts />
      </body>
    </html>
  );
}
