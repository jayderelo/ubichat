import { and, eq, sql } from "drizzle-orm";
import {
  chat,
  usageCall,
  usagePeriod,
  userSettings,
  userUsageLimit,
} from "../../database/schema/app-schema";
import { db } from "#/lib/db.ts";

type TransferAnonymousUserDataInput = {
  anonymousUserId: string;
  targetUserId: string;
};

export async function transferAnonymousUserData({
  anonymousUserId,
  targetUserId,
}: TransferAnonymousUserDataInput) {
  if (anonymousUserId === targetUserId) {
    return;
  }

  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${anonymousUserId}))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${targetUserId}))`);

    await tx.update(chat).set({ userId: targetUserId }).where(eq(chat.userId, anonymousUserId));
    await transferUserSettings({ anonymousUserId, targetUserId, tx });
    await transferUserUsageLimit({ anonymousUserId, targetUserId, tx });
    await transferUsagePeriods({ anonymousUserId, targetUserId, tx });
    await tx
      .update(usageCall)
      .set({ userId: targetUserId })
      .where(eq(usageCall.userId, anonymousUserId));
  });
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function transferUserSettings({
  anonymousUserId,
  targetUserId,
  tx,
}: {
  anonymousUserId: string;
  targetUserId: string;
  tx: Transaction;
}) {
  const [targetRow] = await tx
    .select({ userId: userSettings.userId })
    .from(userSettings)
    .where(eq(userSettings.userId, targetUserId))
    .limit(1);
  const [anonymousRow] = await tx
    .select({ userId: userSettings.userId })
    .from(userSettings)
    .where(eq(userSettings.userId, anonymousUserId))
    .limit(1);

  if (!anonymousRow) {
    return;
  }

  if (targetRow) {
    await tx.delete(userSettings).where(eq(userSettings.userId, anonymousUserId));
    return;
  }

  await tx
    .update(userSettings)
    .set({ userId: targetUserId })
    .where(eq(userSettings.userId, anonymousUserId));
}

async function transferUserUsageLimit({
  anonymousUserId,
  targetUserId,
  tx,
}: {
  anonymousUserId: string;
  targetUserId: string;
  tx: Transaction;
}) {
  const [targetRow] = await tx
    .select({ userId: userUsageLimit.userId })
    .from(userUsageLimit)
    .where(eq(userUsageLimit.userId, targetUserId))
    .limit(1);
  const [anonymousRow] = await tx
    .select({ userId: userUsageLimit.userId })
    .from(userUsageLimit)
    .where(eq(userUsageLimit.userId, anonymousUserId))
    .limit(1);

  if (!anonymousRow) {
    return;
  }

  if (targetRow) {
    await tx.delete(userUsageLimit).where(eq(userUsageLimit.userId, anonymousUserId));
    return;
  }

  await tx
    .update(userUsageLimit)
    .set({ userId: targetUserId })
    .where(eq(userUsageLimit.userId, anonymousUserId));
}

async function transferUsagePeriods({
  anonymousUserId,
  targetUserId,
  tx,
}: {
  anonymousUserId: string;
  targetUserId: string;
  tx: Transaction;
}) {
  const anonymousCurrentPeriods = await tx
    .select()
    .from(usagePeriod)
    .where(and(eq(usagePeriod.userId, anonymousUserId), eq(usagePeriod.isCurrent, true)));
  const targetCurrentPeriods = await tx
    .select()
    .from(usagePeriod)
    .where(and(eq(usagePeriod.userId, targetUserId), eq(usagePeriod.isCurrent, true)));

  for (const anonymousPeriod of anonymousCurrentPeriods) {
    const matchingTargetPeriod = targetCurrentPeriods.find(
      (targetPeriod) =>
        targetPeriod.periodStart.getTime() === anonymousPeriod.periodStart.getTime() &&
        targetPeriod.periodEnd.getTime() === anonymousPeriod.periodEnd.getTime(),
    );

    if (!matchingTargetPeriod) {
      continue;
    }

    await tx
      .update(usageCall)
      .set({ periodId: matchingTargetPeriod.id })
      .where(eq(usageCall.periodId, anonymousPeriod.id));
    await tx
      .update(usagePeriod)
      .set({
        cacheReadTokens: sql`${usagePeriod.cacheReadTokens} + ${anonymousPeriod.cacheReadTokens}`,
        cacheWriteTokens: sql`${usagePeriod.cacheWriteTokens} + ${anonymousPeriod.cacheWriteTokens}`,
        inputTokens: sql`${usagePeriod.inputTokens} + ${anonymousPeriod.inputTokens}`,
        outputTokens: sql`${usagePeriod.outputTokens} + ${anonymousPeriod.outputTokens}`,
        reasoningTokens: sql`${usagePeriod.reasoningTokens} + ${anonymousPeriod.reasoningTokens}`,
        reservedCredits: sql`${usagePeriod.reservedCredits} + ${anonymousPeriod.reservedCredits}`,
        updatedAt: new Date(),
        usedCredits: sql`${usagePeriod.usedCredits} + ${anonymousPeriod.usedCredits}`,
      })
      .where(eq(usagePeriod.id, matchingTargetPeriod.id));
    await tx.delete(usagePeriod).where(eq(usagePeriod.id, anonymousPeriod.id));
  }

  const hasTargetCurrentPeriod = targetCurrentPeriods.length > 0;

  if (hasTargetCurrentPeriod) {
    await tx
      .update(usagePeriod)
      .set({
        isCurrent: false,
        userId: targetUserId,
      })
      .where(eq(usagePeriod.userId, anonymousUserId));
    return;
  }

  await tx
    .update(usagePeriod)
    .set({ userId: targetUserId })
    .where(eq(usagePeriod.userId, anonymousUserId));
}
