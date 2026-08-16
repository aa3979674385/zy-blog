import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as CacheService from "@/features/cache/cache.service";
import * as ConfigRepo from "@/features/config/data/config.data";
import { REWARD_CACHE_KEY } from "@/features/config/config.schema";
import { dbMiddleware } from "@/lib/middlewares";

/** 前台打赏配置（公开，10 分钟 KV 缓存） */
const RewardConfigSchema = z.object({
  enabled: z.boolean(),
  /** 赞赏码 R2 key */
  tipCode: z.string().nullable().optional(),
  /** 收款码 R2 key */
  payCode: z.string().nullable().optional(),
});

export type RewardConfig = z.infer<typeof RewardConfigSchema>;

export const getRewardConfigFn = createServerFn()
  .middleware([dbMiddleware])
  .handler(async ({ context }) =>
    CacheService.get(
      context,
      REWARD_CACHE_KEY,
      RewardConfigSchema,
      async () => {
        const config = await ConfigRepo.getSystemConfig(context.db);
        const reward = config?.reward;
        return {
          enabled: reward?.enabled ?? true,
          tipCode: reward?.tipCode ?? null,
          payCode: reward?.payCode ?? null,
        };
      },
      { ttl: "10m" },
    ),
  );
