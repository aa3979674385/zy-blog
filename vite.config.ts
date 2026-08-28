import path from "node:path";
import { cloudflare } from "@cloudflare/vite-plugin";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { z } from "zod";
import packageJson from "./package.json";

import { themeNames, themes } from "./src/features/theme/registry";

const buildEnvSchema = z.object({
  THEME: z.enum(themeNames).catch("mytheme"),
});

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const buildEnv = buildEnvSchema.parse(env);
  return {
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
      // 每次构建唯一的构建 ID：部署新版本后，Worker Cache API 中缓存的旧
      // HTML 会因版本头不匹配而自动作废，避免「旧 HTML 引用已变更的 chunk → 404
      // → 水合失败 → 导航等交互全部失效」（导航不可用问题的根因之一）。
      __BUILD_ID__: JSON.stringify(`${packageJson.version}-${Date.now().toString(36)}`),
      __THEME_NAME__: JSON.stringify(buildEnv.THEME),
      __THEME_CONFIG__: JSON.stringify(themes[buildEnv.THEME]),
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
        "@theme": path.resolve(
          __dirname,
          `src/features/theme/themes/${buildEnv.THEME}`,
        ),
      },
    },
    ssr: {
      noExternal: true,
    },
    plugins: [
      // Fix: Cloudflare vite-plugin overrides optimizeDeps for the SSR environment,
      // so root-level optimizeDeps.esbuildOptions don't apply. This plugin injects
      // esbuild options into the SSR environment via the config hook to mark
      // TanStack Start's virtual modules as external during dep scanning.
      {
        name: "fix-tanstack-virtual-in-ssr",
        config() {
          return {
            environments: {
              ssr: {
                optimizeDeps: {
                  esbuildOptions: {
                    external: [
                      "#tanstack-router-entry",
                      "#tanstack-start-entry",
                      "#tanstack-start-plugin-adapters",
                      "tanstack-start-manifest:v",
                      "tanstack-start-injected-head-scripts:v",
                    ],
                    plugins: [
                      {
                        name: "tanstack-virtual-external",
                        setup(build: { onResolve: (a: unknown, b: (args: { path: string }) => unknown) => void }) {
                          build.onResolve(
                            { filter: /^#tanstack-|^tanstack-start-/ },
                            (args: { path: string }) => ({ path: args.path, external: true }),
                          );
                        },
                      },
                    ],
                  },
                },
              },
            },
          };
        },
      },
      paraglideVitePlugin({
        project: "./project.inlang",
        outdir: "./src/paraglide",
        strategy: ["cookie", "preferredLanguage", "baseLocale"],
        cookieName: "LOCALE",
      }),
      cloudflare({
        viteEnvironment: {
          name: "ssr",
        },
        remoteBindings: false,
      }),
      viteTsConfigPaths({
        projects: ["./tsconfig.json"],
      }),
      tailwindcss(),
      // DevTools 仅在开发环境加载，避免生产包增大
      mode === "development" && devtools(),
      tanstackStart({
        importProtection: {
          enabled: false,
        },
      }),
      viteReact(),
    ].filter(Boolean),
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            // 将大型第三方库拆分为独立 chunk，避免全部打入入口 JS
            "vendor-react": ["react", "react-dom", "react/jsx-runtime"],
            "vendor-router": [
              "@tanstack/react-router",
              "@tanstack/react-start",
              "@tanstack/react-query",
            ],
            "vendor-auth": ["better-auth"],
            "vendor-icons": ["lucide-react", "simple-icons"],
          },
        },
      },
    },
  };
});

export default config;
