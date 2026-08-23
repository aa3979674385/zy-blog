import { and, count, desc, eq, inArray, isNotNull, isNull, like, lte, or, sql } from "drizzle-orm";
import { getSystemConfig } from "@/features/config/data/config.data";
import type { DB } from "@/lib/db";
import { account, pointTransaction, session, user } from "@/lib/db/schema";

export interface ListUsersInput {
  offset: number;
  limit: number;
  search?: string;
}

export type UserRow = typeof user.$inferSelect;

export interface ListUsersResult {
  items: UserRow[];
  total: number;
}

/** 封禁信息（仅当账号处于封禁状态且未到期时返回） */
export interface BanInfo {
  banned: true;
  banReason: string | null;
  /** 封禁到期时间戳（ms）；null 表示永久封禁 */
  banExpires: number | null;
}

function toBanInfo(u: UserRow): BanInfo | null {
  if (!u.banned) return null;
  // 已到/过期的封禁视为自动解封
  if (u.banExpires && u.banExpires.getTime() <= Date.now()) return null;
  return {
    banned: true,
    banReason: u.banReason ?? null,
    banExpires: u.banExpires ? u.banExpires.getTime() : null,
  };
}

/** 通过会话 token 反查用户（用于已登录但被封禁的场景） */
export async function getUserBySessionToken(
  db: DB,
  token: string,
): Promise<UserRow | null> {
  const sess = await db.query.session.findFirst({
    where: eq(session.token, token),
  });
  if (!sess) return null;
  const u = await db.query.user.findFirst({
    where: eq(user.id, sess.userId),
  });
  return u ?? null;
}

/** 通过邮箱反查用户（用于登录失败但已知邮箱的场景） */
export async function getUserByEmail(
  db: DB,
  email: string,
): Promise<UserRow | null> {
  const u = await db.query.user.findFirst({
    where: eq(user.email, email),
  });
  return u ?? null;
}

export async function getBanInfoByUser(
  u: UserRow | null,
  db?: DB,
): Promise<BanInfo | null> {
  if (!u) return null;
  // 到期自动解封：顺手把 DB 状态也改回「正常」（真正解封），
  // 保证后台列表/详情与用户侧显示一致，不再长期挂着封禁状态
  if (u.banned && u.banExpires && u.banExpires.getTime() <= Date.now()) {
    if (db) {
      await db
        .update(user)
        .set({ banned: false, banReason: null, banExpires: null })
        .where(eq(user.id, u.id));
    }
    return null;
  }
  return toBanInfo(u);
}

/**
 * 批量解封所有已过期的封禁账号（供定时任务调用）：
 * banned=true 且 banExpires 已到 → 恢复为正常。
 * @returns 本次解封的用户数
 */
export async function unbanExpiredUsers(db: DB): Promise<number> {
  const rows = await db
    .update(user)
    .set({ banned: false, banReason: null, banExpires: null })
    .where(
      and(
        eq(user.banned, true),
        isNotNull(user.banExpires),
        lte(user.banExpires, new Date()),
      ),
    )
    .returning({ id: user.id });
  return rows.length;
}

export async function listUsers(
  db: DB,
  { offset, limit, search }: ListUsersInput,
): Promise<ListUsersResult> {
  const where = search
    ? or(like(user.name, `%${search}%`), like(user.email, `%${search}%`))
    : undefined;

  const items = await db.query.user.findMany({
    where,
    orderBy: [desc(user.createdAt)],
    limit,
    offset,
  });

  const [row] = await db.select({ value: count() }).from(user).where(where);

  return { items, total: row?.value ?? 0 };
}

export async function getUserById(db: DB, id: string) {
  return db.query.user.findFirst({ where: eq(user.id, id) });
}

export interface UpdateUserInput {
  name?: string;
  role?: string;
  /** 权限键数组；null = 超级管理员；不传则保持原值 */
  permissions?: string[] | null;
  banned?: boolean;
  banReason?: string | null;
  /** 封禁到期时间戳（ms）；null 表示永久封禁；不传则保持原值 */
  banExpires?: Date | null;
}

export async function updateUser(
  db: DB,
  id: string,
  data: UpdateUserInput,
): Promise<void> {
  const setData: Partial<typeof user.$inferInsert> = {};
  if (data.name !== undefined) setData.name = data.name;
  if (data.role !== undefined) setData.role = data.role;
  // permissions 为 text 列：数组需序列化为 JSON 字符串；null 表示超级管理员
  if (data.permissions !== undefined) {
    setData.permissions =
      data.permissions === null ? null : JSON.stringify(data.permissions);
  }
  if (data.banned !== undefined) setData.banned = data.banned;
  if (data.banReason !== undefined) setData.banReason = data.banReason;
  if (data.banExpires !== undefined) setData.banExpires = data.banExpires;
  await db.update(user).set(setData).where(eq(user.id, id));
}

export type PointField = "points" | "credits";

/** 调整用户积分：在现有余额上增减，结果 clamp 到 >= 0，返回新余额。 */
export async function adjustPoints(
  db: DB,
  id: string,
  field: PointField,
  delta: number,
): Promise<number> {
  const col = field === "points" ? user.points : user.credits;
  // 原子更新：直接在 SQL 层执行 `col = max(0, col + delta)`，避免
  // 先查后写的 read-modify-write 在并发请求下互相覆盖导致余额丢失。
  const [row] = await db
    .update(user)
    .set(
      field === "points"
        ? { points: sql`max(0, ${user.points} + ${delta})` }
        : { credits: sql`max(0, ${user.credits} + ${delta})` },
    )
    .where(eq(user.id, id))
    .returning({ v: col });
  return row?.v ?? 0;
}

/* ======================= 积分流水 & 签到 ======================= */

function dateKey(ts: number): string {
  // 北京时间（UTC+8）日期字符串 YYYY-MM-DD，用于按天判断是否已签到
  // 加 8 小时后再取 UTC 日期，等价于按北京时间「每天 0:00」重置签到资格
  return new Date(ts + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface CreatePointTxInput {
  userId: string;
  type: PointField;
  amount: number;
  balanceAfter: number;
  source: string;
  refId?: string | null;
  /** 关联订单号（资源购买产生的积分扣减时，关联 post_resource_order.order_no） */
  orderNo?: string | null;
  operatorId?: string | null;
  reason?: string | null;
}

/** 写入一条积分流水（每次积分变动都记一笔，便于对账与审计） */
export async function recordPointTransaction(
  db: DB,
  input: CreatePointTxInput,
): Promise<void> {
  // 积分动态开关关闭时不记录流水（records.pointsLog 缺省视为开启）。
  // 注意：余额由 adjustPoints 单独维护，此处仅控制流水行是否写入，不影响余额。
  const cfg = await getSystemConfig(db);
  if (cfg?.records?.pointsLog === false) return;

  await db.insert(pointTransaction).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    type: input.type,
    amount: input.amount,
    balanceAfter: input.balanceAfter,
    source: input.source as (typeof pointTransaction.$inferSelect)["source"],
    refId: input.refId ?? null,
    orderNo: input.orderNo ?? null,
    operatorId: input.operatorId ?? null,
    reason: input.reason ?? null,
  });
}

export interface ListPointTxInput {
  offset: number;
  limit: number;
  userId?: string;
  type?: PointField;
  source?: string;
  /** 精确匹配关联订单号 */
  orderNo?: string;
}

export interface PointTxRow {
  id: string;
  userId: string;
  type: PointField;
  amount: number;
  balanceAfter: number;
  source: string;
  refId: string | null;
  /** 关联订单号（资源购买产生的积分扣减时关联 post_resource_order.order_no） */
  orderNo: string | null;
  operatorId: string | null;
  reason: string | null;
  createdAt: Date | null;
  userName: string | null;
  userEmail: string | null;
}

export interface ListPointTxResult {
  items: PointTxRow[];
  total: number;
}

/** 列出积分流水（支持按用户/类型/来源筛选；左连接 user 取出展示名） */
export async function listPointTransactions(
  db: DB,
  input: ListPointTxInput,
): Promise<ListPointTxResult> {
  const conditions = [];
  if (input.userId) conditions.push(eq(pointTransaction.userId, input.userId));
  if (input.type) conditions.push(eq(pointTransaction.type, input.type));
  if (input.source)
    conditions.push(
      eq(
        pointTransaction.source,
        input.source as (typeof pointTransaction.$inferSelect)["source"],
      ),
    );
  if (input.orderNo)
    conditions.push(eq(pointTransaction.orderNo, input.orderNo));
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: pointTransaction.id,
      userId: pointTransaction.userId,
      type: pointTransaction.type,
      amount: pointTransaction.amount,
      balanceAfter: pointTransaction.balanceAfter,
      source: pointTransaction.source,
      refId: pointTransaction.refId,
      orderNo: pointTransaction.orderNo,
      operatorId: pointTransaction.operatorId,
      reason: pointTransaction.reason,
      createdAt: pointTransaction.createdAt,
      userName: user.name,
      userEmail: user.email,
    })
    .from(pointTransaction)
    .leftJoin(user, eq(pointTransaction.userId, user.id))
    .where(where)
    .orderBy(desc(pointTransaction.createdAt))
    .limit(input.limit)
    .offset(input.offset);

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(pointTransaction)
    .where(where);

  return { items: rows as PointTxRow[], total: Number(total) };
}

/** 批量删除积分流水（按 id）。ids 为空时直接返回，避免误清空。 */
export async function deletePointTransactions(
  db: DB,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  await db.delete(pointTransaction).where(inArray(pointTransaction.id, ids));
}

/** 清空全部积分流水。注意：仅删除流水记录，不影响用户积分余额。 */
export async function clearPointTransactions(db: DB): Promise<void> {
  await db.delete(pointTransaction);
}

export interface CheckInStatus {
  lastCheckInAt: Date | null;
  streak: number;
  canCheckIn: boolean;
}

/** 查询用户签到状态：最近签到时间、连续天数、今天是否还可签到 */
export async function getCheckInStatus(
  db: DB,
  userId: string,
): Promise<CheckInStatus> {
  const u = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { lastCheckInAt: true, checkInStreak: true },
  });
  const last = u?.lastCheckInAt
    ? u.lastCheckInAt instanceof Date
      ? u.lastCheckInAt.getTime()
      : Number(u.lastCheckInAt)
    : null;
  // 注意：todayKey 必须与 dateKey 保持同一口径（北京时间），否则查询状态与执行签到判定不一致
  const todayKey = dateKey(Date.now());
  const canCheckIn = !last || dateKey(last) !== todayKey;
  return {
    lastCheckInAt: last ? new Date(last) : null,
    streak: u?.checkInStreak ?? 0,
    canCheckIn,
  };
}

/** 每日签到发放的普通积分数（后续可做成可配置） */
export const CHECKIN_REWARD = 1;

/**
 * 执行签到：校验「今天还没签过」→ 发放普通积分 → 更新连续天数 → 记流水。
 * 重复签到会抛 ALREADY_CHECKED_IN 错误（由上层转成友好提示）。
 *
 * 注意：Cloudflare D1 的交互式事务 db.transaction() 在当前运行时会
 * "Failed query: begin" 失败，故改用 D1 单写者 + 条件 UPDATE 的乐观锁方案
 * （与 card-keys 的 redeemCardKey 同款做法）：仅当 lastCheckInAt 仍等于读取时的值
 * （即期间无人签到）才更新成功。两个并发请求即便都通过上面的读校验，也只有第一个
 * UPDATE 命中（meta.changes=1），第二个因 lastCheckInAt 已被改成今天而 changes=0，
 * 从而抛出 ALREADY_CHECKED_IN，杜绝重复发放 / 脏流水，且无需事务。
 */
export async function performCheckIn(
  db: DB,
  userId: string,
  reward: number = CHECKIN_REWARD,
): Promise<{ points: number; streak: number; awarded: number }> {
  // 读取当前用户积分 / 签到状态
  const u = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { points: true, lastCheckInAt: true, checkInStreak: true },
  });
  if (!u) throw new Error("USER_NOT_FOUND");

  const now = new Date();
  const todayKey = dateKey(now.getTime());
  const last = u.lastCheckInAt
    ? u.lastCheckInAt instanceof Date
      ? u.lastCheckInAt.getTime()
      : Number(u.lastCheckInAt)
    : null;

  // 友好前置校验：今天已签到
  if (last && dateKey(last) === todayKey) {
    throw new Error("ALREADY_CHECKED_IN");
  }

  // 连续天数：上次签到是「昨天(北京时间)」则连续 +1，否则重置为 1
  let streak = 1;
  if (last) {
    const yesterdayKey = dateKey(now.getTime() - 86_400_000);
    streak = dateKey(last) === yesterdayKey ? (u.checkInStreak ?? 0) + 1 : 1;
  }

  const next = (u.points ?? 0) + reward; // 签到有奖，保证非负

  // 并发安全：乐观锁——仅当 lastCheckInAt 仍等于读取时的值（期间无人签到）才更新成功
  const lockCond =
    u.lastCheckInAt === null
      ? isNull(user.lastCheckInAt)
      : eq(user.lastCheckInAt, u.lastCheckInAt);

  const result = await db
    .update(user)
    .set({ points: next, lastCheckInAt: now, checkInStreak: streak })
    .where(and(eq(user.id, userId), lockCond));

  if (result.meta.changes === 0) {
    throw new Error("ALREADY_CHECKED_IN");
  }

  // 记积分流水（积分流水开关关闭时不写，与 recordPointTransaction 行为一致）
  await recordPointTransaction(db, {
    userId,
    type: "points",
    amount: reward,
    balanceAfter: next,
    source: "checkin",
  });

  return { points: next, streak, awarded: reward };
}

export async function deleteUser(db: DB, id: string): Promise<void> {
  // 先清理子表，避免外键/隔离顺序问题：
  // session、account 外键设为 onDelete cascade；评论 userId 为 set null、
  // 评论点赞与友链为 cascade，均依赖 D1 外键自动处理。此处显式删除更稳妥。
  await db.delete(session).where(eq(session.userId, id));
  await db.delete(account).where(eq(account.userId, id));
  await db.delete(user).where(eq(user.id, id));
}

export async function updateUserPassword(
  db: DB,
  userId: string,
  hashedPassword: string,
): Promise<void> {
  // 仅更新邮箱+密码账号（credential provider），不动 OAuth 绑定
  await db
    .update(account)
    .set({ password: hashedPassword })
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")));
}
