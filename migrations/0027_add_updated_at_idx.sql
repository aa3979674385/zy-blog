-- 0027: posts.updated_at 索引
-- 后台文章管理列表默认按 updated_at 倒序排序，该列此前无索引，
-- 导致每次列表查询全表排序（rows_read 高）。新增索引后排序走索引，
-- 列表查询 rows_read 从全表行数降为 O(limit)。

CREATE INDEX `updated_at_idx` ON `posts` (`updated_at`);
