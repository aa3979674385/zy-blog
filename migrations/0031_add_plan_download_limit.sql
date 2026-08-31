-- 0031: 会员套餐新增每日下载限制字段
ALTER TABLE membership_plan ADD COLUMN daily_download_limit INTEGER NOT NULL DEFAULT 0;
