import { eq } from "drizzle-orm";
import { createAuthMiddleware } from "@better-auth/core/api";
import { APIError } from "@better-auth/core/error";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthEmail } from "@/features/email/templates/AuthEmail";
import { createAuthConfig } from "@/lib/auth/auth.config";
import * as authSchema from "@/lib/db/schema/auth.table";
import * as ConfigRepo from "@/features/config/data/config.data";
import { getSystemConfig as getCachedSystemConfig } from "@/features/config/service/config.service";
import { DEFAULT_CONFIG } from "@/features/config/config.schema";
import { serverEnv } from "@/lib/env/server.env";
import type { Locale } from "@/lib/i18n";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

/** 从 better-auth hook 上下文中提取客户端 IP（Cloudflare cf-connecting-ip 优先）。 */
function extractIpFromContext(ctx: unknown): string {
  try {
    const headers = (ctx as { request?: { headers?: Headers } })?.request
      ?.headers;
    if (headers instanceof Headers) {
      return (
        headers.get("cf-connecting-ip") ||
        headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        "127.0.0.1"
      );
    }
  } catch {
    // ignore
  }
  return "127.0.0.1";
}

async function checkEmailRateLimit(
  env: Env,
  scope: string,
  email: string,
): Promise<boolean> {
  const identifier = `${scope}:${email.toLowerCase().trim()}`;
  const id = env.RATE_LIMITER.idFromName(identifier);
  const rateLimiter = env.RATE_LIMITER.get(id);
  const result = await rateLimiter.checkLimit({
    capacity: 3,
    interval: "1h",
  });
  return result.allowed;
}

export async function getAuth({
  db,
  env,
  executionCtx,
}: {
  db: DB;
  env: Env;
  /** 传入 executionCtx 时，登录方式配置走 7 天 KV 缓存（避免每个请求直查数据库） */
  executionCtx?: ExecutionContext;
}) {
  const {
    BETTER_AUTH_SECRET,
    BETTER_AUTH_URL,
    ADMIN_EMAIL,
    LOCALE,
    GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET,
  } = serverEnv(env);

  // 读取登录方式配置：默认"仅邮箱注册"，且默认【不】要求邮箱验证
  // （保证首次安装、SMTP 未配置时也能注册管理员并直接登录）
  const systemConfig = executionCtx
    ? await getCachedSystemConfig({ db, env, executionCtx })
    : await ConfigRepo.getSystemConfig(db);
  const authMethod = systemConfig?.auth?.methods ?? "email";
  const requireEmailVerification =
    systemConfig?.auth?.requireEmailVerification ??
    DEFAULT_CONFIG.auth!.requireEmailVerification;
  const enableEmail = authMethod === "email" || authMethod === "both";
  const enableGithub =
    (authMethod === "oauth" || authMethod === "both") &&
    !!GITHUB_CLIENT_ID &&
    !!GITHUB_CLIENT_SECRET;

  const { getPasswordHasher } = await import("@/lib/auth/utils");
  const hasher = getPasswordHasher(env);

  function getAuthEmailLocale(): Locale {
    try {
      return getLocale();
    } catch {
      return LOCALE;
    }
  }

  return betterAuth({
    ...createAuthConfig(),
    socialProviders: enableGithub
      ? {
          github: {
            clientId: GITHUB_CLIENT_ID,
            clientSecret: GITHUB_CLIENT_SECRET,
          },
        }
      : {},
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== "/sign-up/email") return;

        const email =
          typeof ctx.body?.email === "string" ? ctx.body.email.trim() : "";
        if (!email) return;

        const allowed = await checkEmailRateLimit(env, "email-signup", email);
        if (allowed) return;

        throw APIError.from("BAD_REQUEST", {
          code: "RATE_LIMITED",
          message: "Too many sign up attempts",
        });
      }),
    },
    emailAndPassword: {
      enabled: enableEmail,
      requireEmailVerification,
      password: {
        hash: (password: string) => hasher.hash(password),
        verify: (params: { hash: string; password: string }) =>
          hasher.verify(params),
      },
      sendResetPassword: async ({ user, url }) => {
        // Per-email rate limit: 3 per hour — silently skip if exceeded
        const allowed = await checkEmailRateLimit(
          env,
          "email-reset",
          user.email,
        );
        if (!allowed) return;

        const locale = getAuthEmailLocale();
        const emailHtml = renderToStaticMarkup(
          AuthEmail({ locale, type: "reset-password", url }),
        );

        await env.QUEUE.send({
          type: "EMAIL",
          data: {
            to: user.email,
            subject: m.email_auth_reset_subject({}, { locale }),
            html: emailHtml,
          },
        });
      },
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        // Per-email rate limit: 3 per hour — silently skip if exceeded
        const allowed = await checkEmailRateLimit(
          env,
          "email-verify",
          user.email,
        );
        if (!allowed) return;

        const locale = getAuthEmailLocale();
        const emailHtml = renderToStaticMarkup(
          AuthEmail({ locale, type: "verification", url }),
        );

        await env.QUEUE.send({
          type: "EMAIL",
          data: {
            to: user.email,
            subject: m.email_auth_verification_subject({}, { locale }),
            html: emailHtml,
          },
        });
      },
      autoSignInAfterVerification: true,
    },
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: authSchema,
    }),
    databaseHooks: {
      user: {
        create: {
          before: async (user, ctx) => {
            const ip = extractIpFromContext(ctx);
            if (user.email === ADMIN_EMAIL) {
              return { data: { ...user, role: "admin", registeredIp: ip } };
            }
            return { data: { ...user, registeredIp: ip } };
          },
        },
      },
      session: {
        create: {
          before: async (session, ctx) => {
            const ip = extractIpFromContext(ctx);
            // 更新用户最后登录 IP
            if (session.userId) {
              await db
                .update(authSchema.user)
                .set({ lastLoginIp: ip })
                .where(eq(authSchema.user.id, session.userId));
            }
            return { data: session };
          },
        },
      },
    },
    secret: BETTER_AUTH_SECRET,
    baseURL: BETTER_AUTH_URL,
  });
}

export type Auth = Awaited<ReturnType<typeof getAuth>>;
export type Session = Auth["$Infer"]["Session"];
