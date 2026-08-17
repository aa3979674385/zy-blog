-- 0026: 文章「亲自测试」状态（is_tested）
-- 为 posts 表新增 is_tested 字段（INTEGER，可空）。
-- 取值：1=已测试，0=未测试，NULL=不显示（默认，相当于关闭该功能）。
-- 用于前台在文章卡片/详情页展示「已测试 / 未测试」标签，由后台编辑器三选一设置
-- （不显示 / 已测试 / 未测试）；旧文章因默认 NULL 而天然不显示该标签。

ALTER TABLE "posts" ADD COLUMN "is_tested" integer DEFAULT NULL;
