import { queryOptions, useQuery } from "@tanstack/react-query";
import { getNavMenuFn, getNavigationFn } from "@/features/navigation/api/navigation.api";

export const NAV_KEYS = {
  navMenu: ["navMenu"] as const,
  admin: ["navigation", "admin"] as const,
};

export const navMenuQuery = queryOptions({
  queryKey: NAV_KEYS.navMenu,
  queryFn: () => getNavMenuFn(),
  // 导航菜单几乎不变：拉长生效时间，避免每次客户端跳转都重打 serverFn
  // （serverFn 偶发失败/超时会让整次导航卡在 pending 转圈、最终不跳转）。
  staleTime: 5 * 60 * 1000,
});

export const navigationAdminQuery = queryOptions({
  queryKey: NAV_KEYS.admin,
  queryFn: () => getNavigationFn(),
});

export function useNavMenu() {
  return useQuery(navMenuQuery);
}
