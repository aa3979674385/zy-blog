import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware, sessionMiddleware } from "@/lib/middlewares";
import * as FreeResourceData from "../data/free-resource.data";
import * as PostResourcesData from "../data/post-resources.data";

/* ======================= 查询配额 ======================= */

/**
 * 前台：查询当前登录用户今日免费获取剩余次数。
 * 同时返回全局开关和文章级开关状态，前端据此决定是否显示「免费获取」按钮。
 */
export const getFreeResourceStatusFn = createServerFn()
  .middleware([sessionMiddleware])
  .inputValidator(z.object({ postId: z.number().int().positive() }))
  .handler(async ({ data, context }) => {
    // 1. 检查全局总开关 + 文章级开关
    const enabled = await FreeResourceData.isFreeResourceEnabledForPost(
      context.db,
      data.postId,
    );

    if (!enabled) {
      return {
        enabled: false,
        used: 0,
        limit: 0,
        remaining: 0,
        loggedIn: false,
      };
    }

    // 2. 未登录：返回 enabled=true 但 loggedIn=false，前端弹登录提示
    const sessionUser = context.session?.user;
    if (!sessionUser) {
      return {
        enabled: true,
        used: 0,
        limit: 0,
        remaining: 0,
        loggedIn: false,
      };
    }

    // 3. 已登录：查询今日配额
    const quota = await FreeResourceData.getFreeQuota(
      context.db,
      sessionUser.id,
    );
    return {
      enabled: true,
      used: quota.used,
      limit: quota.limit,
      remaining: quota.remaining,
      loggedIn: true,
    };
  });

/* ======================= 免费获取链接 ======================= */

const freeAcquireSchema = z.object({
  resourceId: z.string().min(1),
  linkIdx: z.number().int().min(0),
  postId: z.number().int().positive(),
});

/**
 * 前台：免费获取一条网盘链接。
 *
 * 流程：
 *   1. 必须登录（authMiddleware）
 *   2. 检查全局总开关 + 文章级开关
 *   3. 检查今日剩余次数
 *   4. 扣减一次配额
 *   5. 生成中转 token，返回 /api/free-dl/{token} 路径
 *
 * 安全要点：
 *   - 真实网盘 URL 永不返回给前端
 *   - PC 端拿到的是中转路径，由 Hono 路由在服务端 302 跳转
 *   - token 有时效（30 分钟），过期后无法使用
 *   - 每次获取消耗一次配额，刷新页面后 token 仍有效但配额已扣
 */
export const acquireFreeResourceFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(freeAcquireSchema)
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;

    // 1. 检查全局总开关 + 文章级开关
    const enabled = await FreeResourceData.isFreeResourceEnabledForPost(
      context.db,
      data.postId,
    );
    if (!enabled) {
      throw new Error("免费获取功能未开启");
    }

    // 2. 验证资源存在且属于该文章
    const resource = await PostResourcesData.getResourceById(
      context.db,
      data.resourceId,
    );
    if (!resource || resource.postId !== data.postId) {
      throw new Error("资源不存在");
    }

    // 3. 验证链接索引有效
    const links = resource.links;
    if (!Array.isArray(links) || data.linkIdx >= links.length) {
      throw new Error("链接不存在");
    }

    // 4. 检查并扣减配额
    const quota = await FreeResourceData.getFreeQuota(context.db, userId);
    if (quota.limit > 0 && quota.remaining <= 0) {
      throw new Error("今日免费获取次数已耗尽，明日再试");
    }
    await FreeResourceData.consumeFreeQuota(context.db, userId);

    // 5. 生成中转 token
    const token = await FreeResourceData.createFreeToken(
      context.db,
      userId,
      data.resourceId,
      data.linkIdx,
    );

    // 返回中转路径，前端用它构造二维码（PC）或直接点击（手机）
    return {
      token,
      downloadUrl: `/api/free-dl/${token}`,
    };
  });
