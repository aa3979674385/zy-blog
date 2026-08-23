import { queryOptions } from "@tanstack/react-query";
import {
  getAuthSettingsFn,
  getIsEmailConfiguredFn,
  getSessionFn,
} from "../api/auth.api";

export const AUTH_KEYS = {
  all: ["auth"] as const,

  // Leaf keys (static arrays - no child queries)
  session: ["auth", "session"] as const,
  emailConfig: ["auth", "email-config"] as const,
  authSettings: ["auth", "auth-settings"] as const,

  // Child keys (functions for specific queries)
  hasPassword: (userId?: string) => ["auth", "has-password", userId] as const,
};

export const sessionQuery = queryOptions({
  queryKey: AUTH_KEYS.session,
  queryFn: async () => {
    const session = await getSessionFn();
    return session;
  },
  // session 是用户登录状态，1 分钟内不需要重复查询
  staleTime: 60 * 1000,
});

export const emailConfiguredQuery = queryOptions({
  queryKey: AUTH_KEYS.emailConfig,
  queryFn: async () => {
    const isEmailConfigured = await getIsEmailConfiguredFn();
    return isEmailConfigured;
  },
  // 邮箱配置很少变，10 分钟缓存
  staleTime: 10 * 60 * 1000,
});

export const authSettingsQuery = queryOptions({
  queryKey: AUTH_KEYS.authSettings,
  queryFn: async () => {
    const settings = await getAuthSettingsFn();
    return settings;
  },
  // 登录方式设置很少变，10 分钟缓存
  staleTime: 10 * 60 * 1000,
});
