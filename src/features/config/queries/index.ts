import { queryOptions, useQuery } from "@tanstack/react-query";
import { getSystemConfigFn } from "../api/config.api";
import { getPointConfigFn } from "../api/config.api";
import { getSiteConfigFn, getSiteDomainFn } from "../api/site.api";

export const CONFIG_KEYS = {
  all: ["config"] as const,

  // Leaf keys (static arrays - no child queries)
  system: ["config", "system"] as const,
  site: ["config", "site"] as const,
  siteDomain: ["config", "siteDomain"] as const,
  points: ["config", "points"] as const,
};

export const systemConfigQuery = queryOptions({
  queryKey: CONFIG_KEYS.system,
  queryFn: () => getSystemConfigFn(),
});

export const siteConfigQuery = queryOptions({
  queryKey: CONFIG_KEYS.site,
  queryFn: () => getSiteConfigFn(),
  // 站点配置几乎不变：拉长生效时间，避免每次客户端跳转都重打 serverFn
  // （serverFn 偶发失败/超时会让整次导航卡在 pending 转圈、最终不跳转）。
  staleTime: 5 * 60 * 1000,
});

export const siteDomainQuery = queryOptions({
  queryKey: CONFIG_KEYS.siteDomain,
  queryFn: () => getSiteDomainFn(),
  staleTime: 5 * 60 * 1000,
});

export const pointConfigQuery = queryOptions({
  queryKey: CONFIG_KEYS.points,
  queryFn: () => getPointConfigFn(),
});

/** 读取双积分显示名称（普通积分 / 会员积分），前台后台通用 */
export function usePointConfig() {
  return useQuery(pointConfigQuery);
}
