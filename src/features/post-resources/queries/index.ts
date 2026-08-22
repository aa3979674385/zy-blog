import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  clearPurchaseOrdersFn,
  clearResourceDownloadsFn,
  createPostResourceFn,
  deletePostResourceFn,
  deletePurchaseOrdersFn,
  deleteResourceDownloadsFn,
  listPostResourcesFn,
  listPurchaseOrdersFn,
  listResourceDownloadsFn,
  reorderPostResourcesFn,
  updatePostResourceFn,
} from "../api/post-resources.admin.api";
import {
  getMyDailyDownloadQuotaFn,
  listMyPurchaseOrdersFn,
  listPublicPostResourcesFn,
  unlockPostResourceFn,
  type PublicResourceView,
} from "../api/post-resources.public.api";

/* ======================= 后台管理 ======================= */

export function postResourcesQueryOptions(postId: number) {
  return queryOptions({
    queryKey: ["postResources", postId] as const,
    queryFn: ({ signal }) => listPostResourcesFn({ data: { postId }, signal }),
  });
}

export function usePostResources(postId: number) {
  return useQuery(postResourcesQueryOptions(postId));
}

export function useCreatePostResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof createPostResourceFn>[0]) =>
      createPostResourceFn(input),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({
        queryKey: ["postResources", vars.data.postId],
      }),
  });
}

export function useUpdatePostResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof updatePostResourceFn>[0]) =>
      updatePostResourceFn(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["postResources"] }),
  });
}

export function useDeletePostResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof deletePostResourceFn>[0]) =>
      deletePostResourceFn(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["postResources"] }),
  });
}

export function useReorderPostResources() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof reorderPostResourcesFn>[0]) =>
      reorderPostResourcesFn(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["postResources"] }),
  });
}

/* ======================= 前台公开 ======================= */

/** 下载模块浏览器本地缓存 TTL：24 小时（用户要求：本机缓存 1 天，过期后重新查询） */
const DL_LOCAL_CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * 下载资源查询（纯客户端使用，SSR 不预取——详情页 HTML 走 CDN 公共缓存，
 * 嵌入权限数据会被 CDN 串给其他访客，属越权面，见 $slug.tsx loader 注释）。
 *
 * 缓存策略（用户设计意图）：
 * - 权限确认结果只缓存在【当前浏览器 localStorage】——不进 CDN、不进 KV；
 * - 24 小时内再次打开同一详情页：直接读本地缓存，不发请求（不查库）；
 * - 超过 24 小时：清除缓存，重新实时查询（带 session，按当前登录者身份计算）。
 */
function readDlLocalCache(postId: number): PublicResourceView[] | null {
  try {
    const raw = localStorage.getItem(`dl-res:${postId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: PublicResourceView[] };
    if (!parsed || typeof parsed.ts !== "number" || !Array.isArray(parsed.data)) {
      return null;
    }
    if (Date.now() - parsed.ts > DL_LOCAL_CACHE_TTL) {
      localStorage.removeItem(`dl-res:${postId}`);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

function writeDlLocalCache(postId: number, data: PublicResourceView[]) {
  try {
    localStorage.setItem(
      `dl-res:${postId}`,
      JSON.stringify({ ts: Date.now(), data }),
    );
  } catch {
    // 隐私模式 / 存储满：忽略，下次实时查即可
  }
}

export function publicPostResourcesQuery(postId: number) {
  return queryOptions({
    queryKey: ["publicPostResources", postId] as const,
    queryFn: async ({ signal }) => {
      // 1) 本机缓存命中（24h 内）→ 直接返回，不发请求
      if (typeof window !== "undefined") {
        const cached = readDlLocalCache(postId);
        if (cached) return cached;
      }
      // 2) 未命中 / 已过期 → 实时查询（带 session，按当前登录者权限计算）
      const data = await listPublicPostResourcesFn({ data: { postId }, signal });
      // 3) 写回本机缓存（仅当有资源时；无资源没必要缓存）
      if (typeof window !== "undefined" && data.length > 0) {
        writeDlLocalCache(postId, data);
      }
      return data;
    },
  });
}

export function usePublicPostResources(postId: number) {
  return useQuery(publicPostResourcesQuery(postId));
}

export function useUnlockPostResource(postId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof unlockPostResourceFn>[0]) =>
      unlockPostResourceFn(input),
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["publicPostResources", postId],
      }),
  });
}

/* ======================= 后台审计 ======================= */

export function usePurchaseOrders(filters: {
  offset: number;
  limit: number;
  orderNo?: string;
  userId?: string;
  keyword?: string;
}) {
  return useQuery({
    queryKey: ["purchaseOrders", filters],
    queryFn: () => listPurchaseOrdersFn({ data: filters }),
  });
}

export function useResourceDownloads(filters: {
  offset: number;
  limit: number;
  keyword?: string;
}) {
  return useQuery({
    queryKey: ["resourceDownloads", filters],
    queryFn: () => listResourceDownloadsFn({ data: filters }),
  });
}

/** 当前登录用户自己的购买记录（会员中心「积分余额」页用）。 */
export function useMyPurchaseOrders(offset = 0, limit = 20) {
  return useQuery({
    queryKey: ["myPurchaseOrders", offset, limit],
    queryFn: () => listMyPurchaseOrdersFn({ data: { offset, limit } }),
  });
}

/* ======================= 每日下载配额 ======================= */

export const myDailyDownloadQuotaQuery = queryOptions({
  queryKey: ["myDailyDownloadQuota"] as const,
  queryFn: () => getMyDailyDownloadQuotaFn(),
});

/** 当前登录用户今日下载配额（已下篇数 / 上限 / 剩余）。未登录时不启用。 */
export function useMyDailyDownloadQuota() {
  return useQuery(myDailyDownloadQuotaQuery);
}

/* ======================= 后台审计：删除 / 清空 ======================= */

export function useDeletePurchaseOrders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => deletePurchaseOrdersFn({ data: { ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchaseOrders"] }),
  });
}

export function useClearPurchaseOrders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => clearPurchaseOrdersFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["purchaseOrders"] }),
  });
}

export function useDeleteResourceDownloads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => deleteResourceDownloadsFn({ data: { ids } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resourceDownloads"] }),
  });
}

export function useClearResourceDownloads() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => clearResourceDownloadsFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["resourceDownloads"] }),
  });
}
