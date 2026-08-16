export const ADMIN_ITEMS_PER_PAGE = 12;

export const CACHE_CONTROL = {
  public: {
    "Cache-Control": "public, max-age=0, must-revalidate",
    // 公共页面 HTML 的 CDN 缓存：原来 s-maxage=31536000（1 年），部署新版本后
    // CDN 仍返回旧 HTML、引用已变更的 chunk → 404 → 水合失败 → 导航等交互全失效。
    // 改为 60 秒 + SWR 1 小时：内容快速可见更新，配合 x-blog-build-id 版本校验兜底。
    "CDN-Cache-Control": "public, s-maxage=60, stale-while-revalidate=3600",
  },
  swr: {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "CDN-Cache-Control": "public, s-maxage=1, stale-while-revalidate=604800",
  },
  immutable: {
    "Cache-Control": "public, max-age=31536000, immutable",
    "CDN-Cache-Control": "public, max-age=31536000, immutable",
  },
  forbidden: {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "CDN-Cache-Control": "public, s-maxage=3600",
  },
  notFound: {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "CDN-Cache-Control": "public, s-maxage=10",
  },
  serverError: {
    "Cache-Control": "public, max-age=0, must-revalidate",
    "CDN-Cache-Control": "public, s-maxage=10",
  },
  private: {
    "Cache-Control": "private, no-store, no-cache, must-revalidate",
    "CDN-Cache-Control": "private, no-store",
  },
} as const;

export const ADMIN_STATS = {
  totalViews: 45231,
  etherStability: 89.4,
  systemHealth: "STABLE",
  pendingComments: 12,
  databaseSize: "1.2 GB",
};
