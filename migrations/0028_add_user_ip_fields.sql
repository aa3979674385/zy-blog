-- 0028: 用户 IP 记录字段
-- 为 user 表新增 registered_ip（注册时 IP）和 last_login_ip（最后登录 IP）。
-- 均为可空 text，旧用户为 NULL；注册时写入 registered_ip，每次登录时更新 last_login_ip。

ALTER TABLE "user" ADD COLUMN "registered_ip" text;
ALTER TABLE "user" ADD COLUMN "last_login_ip" text;
