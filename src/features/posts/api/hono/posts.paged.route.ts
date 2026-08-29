import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { GetPostsPagedInputSchema } from "@/features/posts/schema/posts.schema";
import * as PostService from "@/features/posts/services/posts.service";
import { getServiceContext, setCacheHeaders } from "@/lib/hono/helper";
import { baseMiddleware } from "@/lib/hono/middlewares";

const app = new Hono<{ Bindings: Env }>();

app.use("*", baseMiddleware);

/**
 * 分页文章列表 API：首页「最新发布」与分类页共用。
 * 走 CDN 边缘缓存（setCacheHeaders "public" → 1 年），发文章时 purgePostCDNCache
 * 会按 /api/posts 前缀清除，保证新文章发布后列表即时刷新。
 */
const route = app.get(
  "/",
  zValidator(
    "query",
    GetPostsPagedInputSchema.extend({
      excludePinned: z
        .enum(["true", "false"])
        .optional()
        .transform((v) => (v === undefined ? undefined : v === "true")),
    }),
  ),
  async (c) => {
    const data = c.req.valid("query");
    const result = await PostService.getPostsPaged(getServiceContext(c), data);
    setCacheHeaders(c.res.headers, "public");
    return c.json(result);
  },
);

export default route;
