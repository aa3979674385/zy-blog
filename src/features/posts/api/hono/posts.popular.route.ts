import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import * as PageviewService from "@/features/pageview/service/pageview.service";
import { getServiceContext, setCacheHeaders } from "@/lib/hono/helper";
import { baseMiddleware } from "@/lib/hono/middlewares";

const app = new Hono<{ Bindings: Env }>();

app.use("*", baseMiddleware);

/**
 * 热门文章 API：详情页侧边栏「本周热榜」用。
 * CDN 短缓存 1 小时（s-maxage=3600）——周榜会随浏览量变化，不宜长缓存；
 * 同时服务端仍走 KV（posts:list 版本化缓存），CDN miss 时 KV 兜底，KV miss 才查 D1。
 */
const route = app.get(
  "/",
  zValidator("query", z.object({ limit: z.coerce.number().optional() })),
  async (c) => {
    const { limit } = c.req.valid("query");
    const result = await PageviewService.getPopularPosts(
      getServiceContext(c),
      limit,
    );
    setCacheHeaders(c.res.headers, "short");
    return c.json(result);
  },
);

export default route;
