import type { PublicResourceView } from "../api/post-resources.public.api";

/**
 * 下载模块「浏览器本机缓存」纯逻辑（与 React Query 解耦，便于单测）。
 *
 * 设计意图（用户要求）：
 * - 权限结果只缓存在【当前浏览器 localStorage】，不进 CDN、不进 KV；
 * - 24h 内同一篇文章再打开 → 直接读缓存，不发请求（不查库）；
 * - 超过 24h → 清除并重查（带 session，按当前登录者身份计算）。
 * - 每篇文章独立 key（dl-res:<postId>），互不干扰。
 */

/** 24 小时 TTL（毫秒） */
export const DL_LOCAL_CACHE_TTL = 24 * 60 * 60 * 1000;

/** 存储键：每篇文章一个，避免「所有文章缓存成一样」 */
export function dlLocalCacheKey(postId: number): string {
  return `dl-res:${postId}`;
}

/**
 * 读取本机缓存。命中且在 TTL 内返回数据；过期/损坏/不可用返回 null。
 * 非浏览器环境（SSR / node）localStorage 不存在，try 兜底返回 null。
 */
export function readDlLocalCache(postId: number): PublicResourceView[] | null {
  try {
    const raw = localStorage.getItem(dlLocalCacheKey(postId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: PublicResourceView[] };
    if (!parsed || typeof parsed.ts !== "number" || !Array.isArray(parsed.data)) {
      return null;
    }
    if (Date.now() - parsed.ts > DL_LOCAL_CACHE_TTL) {
      localStorage.removeItem(dlLocalCacheKey(postId));
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

/** 写入本机缓存。隐私模式 / 存储满：忽略，下次实时查即可。 */
export function writeDlLocalCache(postId: number, data: PublicResourceView[]): void {
  try {
    localStorage.setItem(dlLocalCacheKey(postId), JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // ignore
  }
}

/** 清除单篇文章的下载缓存（购买 / 解锁成功后调用，强制下次重查出新权限）。 */
export function clearDlLocalCache(postId: number): void {
  try {
    localStorage.removeItem(dlLocalCacheKey(postId));
  } catch {
    // ignore
  }
}

/** 清空全部下载缓存（登录态变化：登录 / 登出 / 切换账号时调用，权限随身份变）。 */
export function clearAllDlLocalCache(): void {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("dl-res:")) toRemove.push(k);
    }
    for (const k of toRemove) localStorage.removeItem(k);
  } catch {
    // ignore
  }
}
