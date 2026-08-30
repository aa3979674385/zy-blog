import type { JSONContent } from "@tiptap/react";
import type { PostStatus } from "@/lib/db/schema";

export interface PostEditorData {
  title: string;
  summary: string;
  slug: string;
  status: PostStatus;
  readTimeInMinutes: number;
  contentJson: JSONContent | null;
  publishedAt: Date | null;
  pinnedAt: Date | null;
  /**
   * 亲自测试状态：1=已测试，0=未测试，null=不显示（默认，相当于关闭该功能）。
   * 与 DB is_tested 列（integer，可空）保持一致；UI 显示「已测试 / 未测试 / 不显示」。
   */
  isTested: number | null;
  /**
   * 免费资源获取开关：1=开启（默认），0=关闭。
   * 受全局总开关控制：全局关闭时即使此处开启也不生效。
   */
  freeResourceEnabled: number;
  tagIds: Array<number>;
  categoryIds: Array<number>;
  /** 文章封面图（可选）。留空时由后端自动从正文第一张图抓取作为兜底。 */
  coverImage?: string | null;
  isSynced: boolean;
  hasPublicCache: boolean;
}

export interface PostEditorProps {
  initialData: PostEditorData & { id: number };
  onSave: (data: PostEditorData) => Promise<void>;
}

export type SaveStatus = "SYNCED" | "SAVING" | "PENDING" | "ERROR";

export const defaultPostData: PostEditorData = {
  title: "",
  summary: "",
  slug: "",
  status: "draft",
  readTimeInMinutes: 1,
  contentJson: null,
  publishedAt: null,
  pinnedAt: null,
  isTested: null,
  freeResourceEnabled: 1,
  tagIds: [],
  categoryIds: [],
  coverImage: null,
  isSynced: true,
  hasPublicCache: false,
};
