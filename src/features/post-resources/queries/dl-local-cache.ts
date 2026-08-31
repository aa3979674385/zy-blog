import type { PublicResourceView } from "../api/post-resources.public.api";

/**
 * 下载模块「浏览器本机缓存」纯逻辑（与 React Query 解耦，便于单测）。
 *
 * 设计意图（用户要求）：
 * - 权限结果只缓存在【当前浏览器 localStorage】，不进 CDN、不进 KV；
 * - 24h 内同一篇文章再打开 → 直接读缓存，不发请求（不查库）；
 * - 超过 24h → 清除并重查（带 session，按当前登录者身份计算）。
 * - 每篇文章 + 身份 独立 key（dl-res:<postId>:<identity>），互不干扰。
 *   identity: guest（未登录/普通用户）| member（有效会员）
 *   区分身份是必需的：非会员看过后缓存 locked=true，开通会员后必须重新查才能拿到 unlocked。
 */

/** 24 小时 TTL（毫秒） */
export const DL_LOCAL_CACHE_TTL = 24 * 60 * 60 * 1000;

/** 存储键：每篇文章 + 身份 一个，避免「不同身份权限混用」。 */
export function dlLocalCacheKey(postId: number, isMember: boolean): string {
  return `dl-res:${postId}:${isMember ? "member" : "guest"}`;
}

/**
 * 读取本机缓存。命中且在 TTL 内返回数据；过期/损坏/不可用返回 null。
 * 非浏览器环境（SSR / node）localStorage 不存在，try 兜底返回 null。
 */
export function readDlLocalCache(
  postId: number,
  isMember: boolean,
): PublicResourceView[] | null {
  try {
    const key = dlLocalCacheKey(postId, isMember);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ts: number; data: PublicResourceView[] };
    if (!parsed || typeof parsed.ts !== "number" || !Array.isArray(parsed.data)) {
      return null;
    }
    if (Date.now() - parsed.ts > DL_LOCAL_CACHE_TTL) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

/** 写入本机缓存。隐私模式 / 存储满：忽略，下次实时查即可。 */
export function writeDlLocalCache(
  postId: number,
  isMember: boolean,
  data: PublicResourceView[],
): void {
  try {
    localStorage.setItem(
      dlLocalCacheKey(postId, isMember),
      JSON.stringify({ ts: Date.now(), data }),
    );
  } catch {
    // ignore
  }
}

/** 清除单篇文章的下载缓存（购买 / 解锁成功后调用，强制下次重查出新权限）。 */
export function clearDlLocalCache(postId: number, isMember?: boolean): void {
  try {
    if (isMember !== undefined) {
      // 清除特定身份
      localStorage.removeItem(dlLocalCacheKey(postId, isMember));
    } else {
      // 清除该文章的所有身份缓存
      localStorage.removeItem(dlLocalCacheKey(postId, false));
      localStorage.removeItem(dlLocalCacheKey(postId, true));
    }
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
