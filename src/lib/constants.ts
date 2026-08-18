export const ADMIN_ITEMS_PER_PAGE = 12;

export const CACHE_CONTROL = {
  public: {
    "Cache-Control": "public, max-age=0, must-revalidate",
    // 公共页面 HTML 的 CDN 缓存：对齐上游 flare-stack-blog / dukda（s-maxage=31536000，缓存 1 年）。
    // 之所以能安全用 1 年（而非之前的 60 秒）：静态资源是内容哈希 + immutable 长缓存，
    // 旧 HTML 引用的旧 chunk 文件在 CDN 中始终存在、不会 404；且本 fork 自带 x-blog-build-id
    // 版本校验，会在构建一变时作废 Worker 内层缓存。代价：部署后需主动 purge CDN 缓存，
    // 否则用户最多要等 1 年才自然看到新页面（详见 README「部署指南」）。
    "CDN-Cache-Control": "public, s-maxage=31536000",
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
