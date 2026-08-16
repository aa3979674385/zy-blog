import { Hono } from "hono";
import {
  BACKUP_KEYS,
} from "@/features/backup/backup.schema";
import { listBackups } from "@/features/backup/backup.service";
import { getAuth } from "@/lib/auth/auth.server";
import { getDb } from "@/lib/db";
import { serverEnv } from "@/lib/env/server.env";

export const backupRoute = new Hono<{ Bindings: Env }>();

// 仅管理员可访问
backupRoute.use("*", async (c, next) => {
  const db = getDb(c.env);
  const auth = await getAuth({ db, env: c.env });
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.text("Unauthorized", 401);
  }

  const env = serverEnv(c.env);
  if (session.user.email !== env.ADMIN_EMAIL) {
    return c.text("Forbidden", 403);
  }

  return next();
});

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}-\d{6}$/;

/** 列出备份 */
backupRoute.get("/list", async (c) => {
  const dates = await listBackups(c.env);
  return c.json({ data: dates });
});

/** 下载数据库备份（data.json） */
backupRoute.get("/data/:date", async (c) => {
  const date = c.req.param("date");
  if (!date || !DATE_REGEX.test(date)) {
    return c.text("Invalid backup date", 400);
  }

  const obj = await c.env.R2.get(BACKUP_KEYS.data(date));
  if (!obj) {
    return c.text("Backup data not found", 404);
  }

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  headers.set("Content-Type", "application/json");
  headers.set(
    "Content-Disposition",
    `attachment; filename="backup-${date}-data.json"`,
  );
  return new Response(obj.body, { headers });
});
