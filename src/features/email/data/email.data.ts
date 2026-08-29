import { and, eq, lte } from "drizzle-orm";
import type { EmailUnsubscribeType } from "@/lib/db/schema";
import { EmailUnsubscriptionsTable, emailVerificationCodes } from "@/lib/db/schema";

export async function isUnsubscribed(
  db: DB,
  userId: string,
  type: EmailUnsubscribeType,
): Promise<boolean> {
  const result = await db.query.EmailUnsubscriptionsTable.findFirst({
    where: and(
      eq(EmailUnsubscriptionsTable.userId, userId),
      eq(EmailUnsubscriptionsTable.type, type),
    ),
  });
  return !!result;
}

export async function subscribe(
  db: DB,
  userId: string,
  type: EmailUnsubscribeType,
): Promise<void> {
  await db
    .delete(EmailUnsubscriptionsTable)
    .where(
      and(
        eq(EmailUnsubscriptionsTable.userId, userId),
        eq(EmailUnsubscriptionsTable.type, type),
      ),
    );
}

export async function unsubscribe(
  db: DB,
  userId: string,
  type: EmailUnsubscribeType,
): Promise<void> {
  await db
    .insert(EmailUnsubscriptionsTable)
    .values({
      userId,
      type,
    })
    .onConflictDoNothing(); // Already unsubscribed
}

/**
 * 删除已过期的邮箱验证码。
 * 只删除 `expiresAt <= now()` 的记录，保留未过期的。
 */
export async function deleteExpiredVerificationCodes(db: DB): Promise<number> {
  const result = await db
    .delete(emailVerificationCodes)
    .where(lte(emailVerificationCodes.expiresAt, new Date()));
  return (result as { rowsAffected?: number }).rowsAffected ?? 0;
}
