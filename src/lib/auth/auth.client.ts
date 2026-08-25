import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [],
});

export type BetterAuthErrorCode = keyof typeof authClient.$ERROR_CODES;
