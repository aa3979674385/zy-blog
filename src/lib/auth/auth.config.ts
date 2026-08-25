import type { BetterAuthOptions } from "better-auth";

export function createAuthConfig() {
  return {
    emailAndPassword: {
      enabled: true,
    },
    session: {
      storeSessionInDatabase: true,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    plugins: [],
  } satisfies BetterAuthOptions;
}
