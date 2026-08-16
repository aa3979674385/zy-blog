import { z } from "zod";
import * as CacheService from "@/features/cache/cache.service";
import * as ConfigRepo from "@/features/config/data/config.data";

/** 默认维护话术（未自定义时使用） */
export const DEFAULT_MAINTENANCE_MESSAGE =
  "站点正在维护升级中，请稍后再来访问，感谢您的理解与支持！";

export interface MaintenanceStatus {
  active: boolean;
  message?: string | null;
  endsAt?: string | null;
}

/** 维护状态缓存 key（10 分钟 TTL），避免每个请求都查数据库 */
export const MAINTENANCE_CACHE_KEY = ["maintenance", "status"] as const;

const MaintenanceStatusCacheSchema = z.object({
  active: z.boolean(),
  message: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
});

/**
 * 读取维护状态（带 10 分钟 KV 缓存，正常情况下 0 次数据库查询）：
 * - 未开启 → { active: false }
 * - 开启且 endsAt 已到 → 惰性自动恢复（把 enabled 置回 false），返回 { active: false }
 * - 开启且未到结束时间 → { active: true, message, endsAt }
 */
export async function getMaintenanceStatus(
  context: DbContext & { executionCtx: ExecutionContext },
): Promise<MaintenanceStatus> {
  return CacheService.get(
    context,
    MAINTENANCE_CACHE_KEY,
    MaintenanceStatusCacheSchema,
    async () => {
      const config = await ConfigRepo.getSystemConfig(context.db);
      const m = config?.maintenance;
      if (!m?.enabled) return { active: false, message: null, endsAt: null };

      if (m.endsAt && new Date(m.endsAt).getTime() <= Date.now()) {
        // 到点自动恢复
        await ConfigRepo.upsertSystemConfig(context.db, {
          ...config,
          maintenance: { ...m, enabled: false, endsAt: undefined },
        });
        return { active: false, message: null, endsAt: null };
      }

      return {
        active: true,
        message: m.message?.trim() || null,
        endsAt: m.endsAt ?? null,
      };
    },
    { ttl: "10m" },
  );
}

/** 生成维护页 HTML（内联样式，无外部依赖，后台/静态资源不拦截时展示） */
export function renderMaintenanceHtml(options: {
  title: string;
  message: string;
  endsAt?: string | null;
}): string {
  const { title, message, endsAt } = options;
  const endText = endsAt
    ? new Date(endsAt).toLocaleString("zh-CN", { hour12: false })
    : "";

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} - 维护中</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    min-height: 100vh;
    display: flex; align-items: center; justify-content: center;
    background: #f7f7f8; color: #333;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
      "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    padding: 24px;
  }
  .card {
    max-width: 460px; width: 100%; text-align: center;
    background: #fff; border-radius: 12px;
    padding: 48px 36px; box-shadow: 0 8px 32px rgba(0,0,0,0.08);
  }
  .icon {
    width: 64px; height: 64px; margin: 0 auto 24px;
    border-radius: 50%; background: #f0f0f2;
    display: flex; align-items: center; justify-content: center;
  }
  .icon svg { width: 32px; height: 32px; }
  h1 { font-size: 22px; font-weight: 600; margin-bottom: 8px; }
  p.desc { font-size: 14px; line-height: 1.8; color: #666; margin-bottom: 12px; }
  p.end { font-size: 12px; color: #999; }
  .dot {
    width: 8px; height: 8px; border-radius: 50%; background: #f59e0b;
    display: inline-block; margin-right: 6px;
    animation: pulse 1.6s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
</style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
      </svg>
    </div>
    <h1>${escapeHtml(title)}</h1>
    <p class="desc">${escapeHtml(message)}</p>
    ${endText ? `<p class="end"><span class="dot"></span>预计 ${escapeHtml(endText)} 恢复访问</p>` : ""}
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
