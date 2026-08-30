import { z } from "zod";
import { blogConfig } from "@/blog.config";
import {
  createSiteConfigInputFormSchema,
  type SiteConfigInput,
  SiteConfigInputSchema,
} from "@/features/config/site-config.schema";
import { webhookEndpointSchema } from "@/features/webhook/webhook.schema";
import {
  DEFAULT_HOME_NAV_ITEM,
  navMenuItemSchema,
} from "@/features/navigation/navigation.schema";
import type { Messages } from "@/lib/i18n";

export const SystemConfigSchema = z.object({
  email: z
    .object({
      apiKey: z.string().optional(),
      host: z.string().optional(),
      port: z.number().int().positive().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      senderName: z.string().optional(),
      senderAddress: z.union([z.email(), z.literal("")]).optional(),
    })
    .optional(),
  notification: z
    .object({
      admin: z
        .object({
          channels: z
            .object({
              email: z.boolean().optional(),
              webhook: z.boolean().optional(),
            })
            .optional(),
        })
        .optional(),
      user: z
        .object({
          emailEnabled: z.boolean().optional(),
        })
        .optional(),
      webhooks: z.array(webhookEndpointSchema).optional(),
    })
    .optional(),
  site: SiteConfigInputSchema.optional(),
  auth: z
    .object({
      methods: z.enum(["email", "oauth", "both"]).default("email"),
      requireEmailVerification: z.boolean().default(false),
    })
    .optional(),
  // 双积分名称 + 资源计费（前台展示/换算用，可后台配置）
  points: z
    .object({
      pointsName: z.string().max(20).default("普通积分"),
      creditsName: z.string().max(20).default("会员积分"),
      // 多少积分 = 1 元（用于「积分不足时自动折算成人民币」）
      pointsPerYuan: z.number().int().positive().default(10),
      // 是否已接入支付网关（接入后，积分不足可自动折算为人民币并调起支付）
      paymentEnabled: z.boolean().default(false),
    })
    .optional(),
  // 每日下载限制：普通用户 / 会员用户分别限制每天可下载的「不同文章」篇数（免费/收费均计入）；0 = 不限
  downloadLimit: z
    .object({
      normalUserDaily: z.number().int().min(0).default(0),
      memberDaily: z.number().int().min(0).default(0),
    })
    .optional(),
  // 免费资源获取：全局总开关 + 每日免费获取次数（按自然日 0 点重置）
  freeResource: z
    .object({
      /** 全局总开关：关闭后全站不显示「免费获取」按钮，即使文章级开关开启也不生效 */
      enabled: z.boolean().default(true),
      /** 每日免费获取次数（0=不限，但不建议） */
      dailyLimit: z.number().int().min(0).default(3),
    })
    .optional(),
  // 前台导航菜单（后台可管理：首页 / 自定义链接 / 分类）
  navMenu: z.array(navMenuItemSchema).optional(),
  // 各类后台记录是否记录（关闭后对应记录不再写入，用于减少库表 clutter / 隐私）
  records: z
    .object({
      /** 操作日志（管理员后台操作审计） */
      operationLog: z.boolean().default(true),
      /** 积分动态（积分流水） */
      pointsLog: z.boolean().default(true),
      /** 购买记录（资源订单） */
      purchaseLog: z.boolean().default(true),
      /** 附件下载记录 */
      downloadLog: z.boolean().default(true),
    })
    .optional(),
  // 文章历史自动快照：可开关 + 每篇文章最多保留的自动快照条数（超出自动删除最旧的）
  autoSnapshot: z
    .object({
      enabled: z.boolean().default(true),
      /** 每篇文章最多保留的自动快照条数（1-100，超出自动清理） */
      maxRevisions: z.number().int().min(1).max(100).default(30),
    })
    .optional(),
  // 站点维护模式：开启后前台显示维护页（后台可正常访问），到点自动恢复
  maintenance: z
    .object({
      enabled: z.boolean().default(false),
      /** 维护结束时间 ISO 字符串（到点自动恢复；缺省/null = 永久维护） */
      endsAt: z.string().optional().nullable(),
      /** 自定义维护话术（留空使用默认话术） */
      message: z.string().max(500).optional().nullable(),
    })
    .optional(),
  // 打赏：前台文章页下载模块下方展示打赏二维码（赞赏码/收款码）
  reward: z
    .object({
      /** 全局开关：关闭后前台完全不显示打赏模块 */
      enabled: z.boolean().default(true),
      /** 赞赏码图片 R2 key（未上传则不显示） */
      tipCode: z.string().optional().nullable(),
      /** 收款码图片 R2 key（未上传则不显示） */
      payCode: z.string().optional().nullable(),
    })
    .optional(),
  // 图片水印：访问图片时由 Cloudflare Image Resizing 动态叠加（原图不受影响）
  watermark: z
    .object({
      /** 总开关：关闭则图片不带水印 */
      enabled: z.boolean().default(false),
      /** 水印类型：text=文字水印，image=图片水印 */
      type: z.enum(["text", "image"]).default("text"),
      // —— 文字水印 ——
      /** 水印文字内容 */
      text: z.string().max(100).default(""),
      /** 水印文字颜色（支持 #hex / rgb() / rgba()） */
      textColor: z.string().default("rgba(255,255,255,0.6)"),
      /** 水印文字字号（px） */
      textSize: z.number().int().min(12).max(200).default(36),
      // —— 图片水印 ——
      /** 水印图片 URL（本站 /images/asset/... 或外链） */
      imageUrl: z.string().url().optional().nullable(),
      // —— 通用 ——
      /** 水印透明度 0-1 */
      opacity: z.number().min(0).max(1).default(0.5),
      /** 水印相对图片大小（0.05-1，相对图宽） */
      scale: z.number().min(0.05).max(1).default(0.2),
      /** 水印位置（Cloudflare Image Resizing 枚举，连写） */
      position: z
        .enum([
          "center",
          "north",
          "south",
          "east",
          "west",
          "northeast",
          "northwest",
          "southeast",
          "southwest",
        ])
        .default("southeast"),
    })
    .optional(),
  // 图片压缩：上传时自动缩小尺寸+转换格式，减少图片体积
  compression: z
    .object({
      /** 总开关：关闭则图片原样上传 */
      enabled: z.boolean().default(false),
      /** 最大宽度（px）：图片宽超过此值才压缩，小于则保持原尺寸 */
      maxWidth: z.number().int().min(100).max(4096).default(1200),
      /** 输出格式：webp=WebP（推荐），jpeg=JPEG，png=PNG，auto=与原图同格式 */
      outputFormat: z.enum(["webp", "jpeg", "png", "auto"]).default("webp"),
      /** 压缩质量 0.1-1.0，越小体积越小 */
      quality: z.number().min(0.1).max(1).default(0.85),
    })
    .optional(),
});

export type AuthMethod = "email" | "oauth" | "both";

export const createSystemConfigFormSchema = (messages: Messages) =>
  z.object({
    email: SystemConfigSchema.shape.email,
    notification: SystemConfigSchema.shape.notification,
    site: createSiteConfigInputFormSchema(messages).optional(),
    auth: SystemConfigSchema.shape.auth,
    watermark: SystemConfigSchema.shape.watermark,
    compression: SystemConfigSchema.shape.compression,
  });

export type SystemConfig = z.infer<typeof SystemConfigSchema>;
export type {
  SiteConfig,
  SiteConfigInput,
} from "@/features/config/site-config.schema";

export const DEFAULT_CONFIG: SystemConfig = {
  email: {
    host: "",
    port: 465,
    username: "",
    password: "",
    senderName: "",
    senderAddress: "",
  },
  notification: {
    admin: {
      channels: {
        email: true,
        webhook: true,
      },
    },
    user: {
      emailEnabled: true,
    },
    webhooks: [],
  },
  site: blogConfig satisfies SiteConfigInput,
  auth: { methods: "email", requireEmailVerification: false },
  points: { pointsName: "普通积分", creditsName: "会员积分", pointsPerYuan: 10, paymentEnabled: false },
  downloadLimit: { normalUserDaily: 0, memberDaily: 0 },
  freeResource: { enabled: true, dailyLimit: 3 },
  navMenu: [DEFAULT_HOME_NAV_ITEM],
  records: {
    operationLog: true,
    pointsLog: true,
    purchaseLog: true,
    downloadLog: true,
  },
  autoSnapshot: { enabled: true, maxRevisions: 30 },
  maintenance: { enabled: false, endsAt: undefined, message: undefined },
  reward: { enabled: true, tipCode: null, payCode: null },
  watermark: {
    enabled: false,
    type: "text",
    text: "",
    textColor: "rgba(255,255,255,0.6)",
    textSize: 36,
    imageUrl: null,
    opacity: 0.5,
    scale: 0.2,
    position: "southeast",
  },
  compression: {
    enabled: false,
    maxWidth: 1200,
    outputFormat: "webp",
    quality: 0.85,
  },
};

export const CONFIG_CACHE_KEYS = {
  system: ["system"] as const,
} as const;

/** 前台打赏配置缓存 key（保存打赏设置时需要清除，让前台立即生效） */
export const REWARD_CACHE_KEY = ["reward", "config"] as const;
