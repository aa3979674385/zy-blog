import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware, sessionMiddleware } from "@/lib/middlewares";
import * as FreeResourceData from "../data/free-resource.data";
import * as PostResourcesData from "../data/post-resources.data";
import type { ResourceLink } from "@/lib/db/schema/post-resources.table";

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

/* ======================= 第一步：获取资源（扣配额） ======================= */

/**
 * 免费获取资源信息：扣减1次配额，返回资源内所有链接的元信息（名称、提取码），
 * 但不返回真实 URL，也不生成 token。
 *
 * 前端拿到返回值后渲染弹窗列表，用户点哪条链接的二维码按钮，
 * 再调 generateFreeTokenFn 为那一条按需生成 token。
 */
export const acquireFreeResourceFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      resourceId: z.string().min(1),
      postId: z.number().int().positive(),
    }),
  )
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

    // 3. 验证链接数组有效
    const links = resource.links;
    if (!Array.isArray(links) || links.length === 0) {
      throw new Error("该资源没有下载链接");
    }

    // 4. 检查并扣减配额（按资源算，扣1次）
    const quota = await FreeResourceData.getFreeQuota(context.db, userId);
    if (quota.limit > 0 && quota.remaining <= 0) {
      throw new Error("今日免费获取次数已耗尽，明日再试");
    }
    await FreeResourceData.consumeFreeQuota(context.db, userId);

    // 5. 返回链接元信息（不含真实 URL，只含名称、提取码）
    const linkInfos: Array<{
      idx: number;
      type: string;
      password: string | null;
    }> = links.map((l: ResourceLink, i: number) => ({
      idx: i,
      type: l.type,
      password: l.password ?? null,
    }));

    return {
      resourceId: resource.id,
      extractCode: resource.extractCode ?? null,
      links: linkInfos,
    };
  });

/* ======================= 第二步：按需生成 Token ======================= */

const generateTokenSchema = z.object({
  resourceId: z.string().min(1),
  linkIdx: z.number().int().min(0),
  postId: z.number().int().positive(),
});

/**
 * 为指定链接按需生成中转 token。
 * 不再扣减配额（配额在 acquireFreeResourceFn 时已扣）。
 *
 * 安全要点：
 *   - 真实网盘 URL 永不返回给前端
 *   - token 有时效（30 分钟），过期后无法使用
 *   - token 与用户绑定
 */
export const generateFreeTokenFn = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(generateTokenSchema)
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id;

    // 1. 验证资源存在且属于该文章
    const resource = await PostResourcesData.getResourceById(
      context.db,
      data.resourceId,
    );
    if (!resource || resource.postId !== data.postId) {
      throw new Error("资源不存在");
    }

    // 2. 验证链接索引有效
    const links = resource.links;
    if (!Array.isArray(links) || data.linkIdx >= links.length) {
      throw new Error("链接不存在");
    }

    // 3. 生成中转 token（不扣配额）
    const token = await FreeResourceData.createFreeToken(
      context.db,
      userId,
      data.resourceId,
      data.linkIdx,
    );

    return {
      token,
      downloadUrl: `/api/free-dl/${token}`,
    };
  });
