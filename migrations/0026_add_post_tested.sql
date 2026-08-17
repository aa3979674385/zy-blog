-- 0026: 文章「亲自测试」状态（is_tested）
-- 为 posts 表新增 is_tested 字段（INTEGER，0/1，默认 0=未测试）。
-- 用于前台在文章卡片/详情页的「付费徽章」与「发布时间」之间展示
-- 「已测试 / 未测试」标签，由后台编辑器设置。

ALTER TABLE "posts" ADD COLUMN "is_tested" integer NOT NULL DEFAULT 0;
