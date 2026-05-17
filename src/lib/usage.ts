import { and, eq, lt, sql } from "drizzle-orm";
import { generateId, type LanguageModelUsage, type UIMessage } from "ai";
import {
  chat,
  chatMessage,
  usageCall,
  usagePeriod,
  userUsageLimit,
  type UsageCall,
} from "../../database/schema/app-schema";
import { db } from "#/lib/db.ts";
import type { LlmModelConfig } from "#/lib/llm-config.ts";

const DEFAULT_DAILY_TOKEN_CREDITS = 100_000;
const ESTIMATED_CHARS_PER_TOKEN = 3;
const STALE_STARTED_MS = 30 * 60 * 1000;
const STALE_RESERVED_MS = 10 * 60 * 1000;

type UsageKind = "chat" | "title";

type TokenBreakdown = {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

type ReserveUsageInput = {
  chatId?: string | null;
  estimatedInputTokens: number;
  kind: UsageKind;
  modelConfig: LlmModelConfig;
  userId: string;
};

type FinalizeUsageInput = {
  callId: string;
  finishReason?: string;
  usage: LanguageModelUsage;
};

type FinalizeChatInput = FinalizeUsageInput & {
  chatId: string;
  messages: UIMessage[];
  modelId: string;
  userId: string;
};

type ReleaseUsageInput = {
  callId: string;
  error?: string;
};

type ChargeReservedUsageInput = {
  callId: string;
  error?: string;
};

function getDefaultDailyCreditLimit() {
  const configured = process.env.DEFAULT_DAILY_TOKEN_CREDITS;

  if (!configured) {
    return DEFAULT_DAILY_TOKEN_CREDITS;
  }

  const parsed = Number(configured);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : DEFAULT_DAILY_TOKEN_CREDITS;
}

function startOfUtcDay(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function nextUtcDay(date: Date) {
  const next = startOfUtcDay(date);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

function messageText(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function estimateTokensFromText(text: string) {
  return Math.max(1, Math.ceil(text.length / ESTIMATED_CHARS_PER_TOKEN));
}

function normalizeUsage(usage: LanguageModelUsage): TokenBreakdown {
  return {
    cacheReadTokens: usage.inputTokenDetails.cacheReadTokens ?? usage.cachedInputTokens ?? 0,
    cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens ?? 0,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    reasoningTokens: usage.outputTokenDetails.reasoningTokens ?? usage.reasoningTokens ?? 0,
  };
}

function calculateCredits(tokens: TokenBreakdown, modelConfig: LlmModelConfig) {
  const usage = modelConfig.usage;

  return Math.ceil(
    tokens.inputTokens * usage.inputCreditWeight +
      tokens.outputTokens * usage.outputCreditWeight +
      tokens.reasoningTokens * usage.reasoningCreditWeight +
      tokens.cacheReadTokens * usage.cacheReadCreditWeight +
      tokens.cacheWriteTokens * usage.cacheWriteCreditWeight,
  );
}

export function normalizeMessagesForStorage(messages: UIMessage[]) {
  const seenIds = new Set<string>();

  return messages.map((message, index) => {
    let id = message.id.trim() || `${message.role}-${index}-${generateId()}`;

    while (seenIds.has(id)) {
      id = `${message.role}-${index}-${generateId()}`;
    }

    seenIds.add(id);

    return id === message.id ? message : { ...message, id };
  });
}

export function estimateInputTokens(messages: UIMessage[]) {
  return estimateTokensFromText(messages.map(messageText).join("\n"));
}

export function assertTextOnlyMessages(messages: UIMessage[]) {
  for (const message of messages) {
    if (message.role === "user" && message.parts.some((part) => part.type !== "text")) {
      throw new Error("Only text messages are supported for metered chat requests.");
    }
  }
}

export function assertWithinModelInputLimit(messages: UIMessage[], modelConfig: LlmModelConfig) {
  const inputBytes = new TextEncoder().encode(messages.map(messageText).join("\n")).length;

  if (inputBytes > modelConfig.usage.maxInputBytes) {
    throw new Error("Message input is too large for this model.");
  }
}

export function estimateReservedCredits(messages: UIMessage[], modelConfig: LlmModelConfig) {
  const estimatedInputTokens = estimateInputTokens(messages);
  return calculateCredits(
    {
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      inputTokens: estimatedInputTokens,
      outputTokens: modelConfig.usage.maxOutputTokens,
      reasoningTokens: modelConfig.capabilities.reasoning ? modelConfig.usage.maxOutputTokens : 0,
    },
    modelConfig,
  );
}

async function ensureCurrentUsagePeriod(userId: string) {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);

    const now = new Date();
    const periodStart = startOfUtcDay(now);
    const periodEnd = nextUtcDay(now);
    const [limitRow] = await tx
      .select()
      .from(userUsageLimit)
      .where(eq(userUsageLimit.userId, userId))
      .limit(1);
    const dailyCreditLimit = limitRow?.dailyCreditLimit ?? getDefaultDailyCreditLimit();
    const [currentPeriod] = await tx
      .select()
      .from(usagePeriod)
      .where(and(eq(usagePeriod.userId, userId), eq(usagePeriod.isCurrent, true)))
      .limit(1);

    if (currentPeriod && currentPeriod.periodStart <= now && now < currentPeriod.periodEnd) {
      return currentPeriod;
    }

    if (currentPeriod) {
      await tx
        .update(usagePeriod)
        .set({ isCurrent: false, updatedAt: now })
        .where(eq(usagePeriod.id, currentPeriod.id));
    }

    const [createdPeriod] = await tx
      .insert(usagePeriod)
      .values({
        dailyCreditLimit,
        periodEnd,
        periodStart,
        resetReason: "daily",
        userId,
      })
      .returning();

    if (!createdPeriod) {
      throw new Error("Failed to create usage period.");
    }

    return createdPeriod;
  });
}

export async function reserveUsage({
  chatId,
  estimatedInputTokens,
  kind,
  modelConfig,
  userId,
}: ReserveUsageInput) {
  const period = await ensureCurrentUsagePeriod(userId);

  return await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);

    const [lockedPeriod] = await tx
      .select()
      .from(usagePeriod)
      .where(eq(usagePeriod.id, period.id))
      .limit(1);

    if (!lockedPeriod || !lockedPeriod.isCurrent) {
      throw new Error("Usage period is no longer current.");
    }

    const reservedCredits = Math.ceil(
      calculateCredits(
        {
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          inputTokens: estimatedInputTokens,
          outputTokens: modelConfig.usage.maxOutputTokens,
          reasoningTokens: modelConfig.capabilities.reasoning
            ? modelConfig.usage.maxOutputTokens
            : 0,
        },
        modelConfig,
      ) * modelConfig.usage.reserveMultiplier,
    );
    const availableCredits =
      lockedPeriod.dailyCreditLimit - lockedPeriod.usedCredits - lockedPeriod.reservedCredits;

    if (reservedCredits > availableCredits) {
      return {
        ok: false as const,
        availableCredits: Math.max(0, availableCredits),
        reservedCredits,
      };
    }

    const [call] = await tx
      .insert(usageCall)
      .values({
        chatId,
        modelId: modelConfig.id,
        periodId: lockedPeriod.id,
        reservedCredits,
        usageKind: kind,
        userId,
      })
      .returning();

    if (!call) {
      throw new Error("Failed to reserve usage.");
    }

    await tx
      .update(usagePeriod)
      .set({
        reservedCredits: lockedPeriod.reservedCredits + reservedCredits,
        updatedAt: new Date(),
      })
      .where(eq(usagePeriod.id, lockedPeriod.id));

    return { call, ok: true as const };
  });
}

export async function markProviderStarted(callId: string) {
  await db
    .update(usageCall)
    .set({ providerStartedAt: new Date(), status: "started", updatedAt: new Date() })
    .where(eq(usageCall.id, callId));
}

export async function finalizeUsageWithModel({
  callId,
  finishReason,
  modelConfig,
  usage,
}: FinalizeUsageInput & { modelConfig: LlmModelConfig }) {
  const tokens = normalizeUsage(usage);

  return await db.transaction(async (tx) => {
    const [call] = await tx.select().from(usageCall).where(eq(usageCall.id, callId)).limit(1);

    if (!call || call.status === "completed" || call.status === "charged_reserved") {
      return call ?? null;
    }

    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${call.userId}))`);

    const [period] = await tx
      .select()
      .from(usagePeriod)
      .where(eq(usagePeriod.id, call.periodId))
      .limit(1);

    if (!period) {
      throw new Error("Usage period not found.");
    }

    const chargedCredits = calculateCredits(tokens, modelConfig);
    const reservedCredits = Math.max(0, period.reservedCredits - call.reservedCredits);

    await tx
      .update(usagePeriod)
      .set({
        cacheReadTokens: period.cacheReadTokens + tokens.cacheReadTokens,
        cacheWriteTokens: period.cacheWriteTokens + tokens.cacheWriteTokens,
        inputTokens: period.inputTokens + tokens.inputTokens,
        outputTokens: period.outputTokens + tokens.outputTokens,
        reasoningTokens: period.reasoningTokens + tokens.reasoningTokens,
        reservedCredits,
        updatedAt: new Date(),
        usedCredits: period.usedCredits + chargedCredits,
      })
      .where(eq(usagePeriod.id, period.id));

    const [updatedCall] = await tx
      .update(usageCall)
      .set({
        cacheReadTokens: tokens.cacheReadTokens,
        cacheWriteTokens: tokens.cacheWriteTokens,
        chargedCredits,
        completedAt: new Date(),
        finishReason,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        rawUsage: usage,
        reasoningTokens: tokens.reasoningTokens,
        status: "completed",
        updatedAt: new Date(),
      })
      .where(eq(usageCall.id, call.id))
      .returning();

    return updatedCall ?? null;
  });
}

export async function finalizeChatUsageAndMessages({
  chatId,
  finishReason,
  messages,
  modelId,
  usage,
  userId,
  callId,
  modelConfig,
}: FinalizeChatInput & { modelConfig: LlmModelConfig }) {
  const tokens = normalizeUsage(usage);
  const messagesForStorage = normalizeMessagesForStorage(messages);

  return await db.transaction(async (tx) => {
    const [call] = await tx.select().from(usageCall).where(eq(usageCall.id, callId)).limit(1);

    if (!call || call.status === "completed" || call.status === "charged_reserved") {
      return call ?? null;
    }

    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);

    const [period] = await tx
      .select()
      .from(usagePeriod)
      .where(eq(usagePeriod.id, call.periodId))
      .limit(1);
    const [existingChat] = await tx
      .select({ id: chat.id })
      .from(chat)
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
      .limit(1);

    if (!period || !existingChat) {
      throw new Error("Usage period or chat not found.");
    }

    const chargedCredits = calculateCredits(tokens, modelConfig);

    await tx.delete(chatMessage).where(eq(chatMessage.chatId, chatId));
    await tx.insert(chatMessage).values(
      messagesForStorage.map((message, position) => ({
        chatId,
        message,
        modelId,
        position,
        role: message.role,
        uiMessageId: message.id,
      })),
    );
    await tx
      .update(chat)
      .set({ updatedAt: new Date() })
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));

    await tx
      .update(usagePeriod)
      .set({
        cacheReadTokens: period.cacheReadTokens + tokens.cacheReadTokens,
        cacheWriteTokens: period.cacheWriteTokens + tokens.cacheWriteTokens,
        inputTokens: period.inputTokens + tokens.inputTokens,
        outputTokens: period.outputTokens + tokens.outputTokens,
        reasoningTokens: period.reasoningTokens + tokens.reasoningTokens,
        reservedCredits: Math.max(0, period.reservedCredits - call.reservedCredits),
        updatedAt: new Date(),
        usedCredits: period.usedCredits + chargedCredits,
      })
      .where(eq(usagePeriod.id, period.id));

    const [updatedCall] = await tx
      .update(usageCall)
      .set({
        cacheReadTokens: tokens.cacheReadTokens,
        cacheWriteTokens: tokens.cacheWriteTokens,
        chargedCredits,
        completedAt: new Date(),
        finishReason,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        rawUsage: usage,
        reasoningTokens: tokens.reasoningTokens,
        status: "completed",
        updatedAt: new Date(),
      })
      .where(eq(usageCall.id, call.id))
      .returning();

    return updatedCall ?? null;
  });
}

export async function releaseUsage({ callId, error }: ReleaseUsageInput) {
  return await db.transaction(async (tx) => {
    const [call] = await tx.select().from(usageCall).where(eq(usageCall.id, callId)).limit(1);

    if (!call || call.status !== "reserved") {
      return call ?? null;
    }

    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${call.userId}))`);

    const [period] = await tx
      .select()
      .from(usagePeriod)
      .where(eq(usagePeriod.id, call.periodId))
      .limit(1);

    if (period) {
      await tx
        .update(usagePeriod)
        .set({
          reservedCredits: Math.max(0, period.reservedCredits - call.reservedCredits),
          updatedAt: new Date(),
        })
        .where(eq(usagePeriod.id, period.id));
    }

    const [updatedCall] = await tx
      .update(usageCall)
      .set({ completedAt: new Date(), error, status: "released", updatedAt: new Date() })
      .where(eq(usageCall.id, call.id))
      .returning();

    return updatedCall ?? null;
  });
}

export async function chargeReservedUsage({ callId, error }: ChargeReservedUsageInput) {
  return await db.transaction(async (tx) => {
    const [call] = await tx.select().from(usageCall).where(eq(usageCall.id, callId)).limit(1);

    if (
      !call ||
      call.status === "completed" ||
      call.status === "charged_reserved" ||
      call.status === "released"
    ) {
      return call ?? null;
    }

    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${call.userId}))`);

    const [period] = await tx
      .select()
      .from(usagePeriod)
      .where(eq(usagePeriod.id, call.periodId))
      .limit(1);

    if (period) {
      await tx
        .update(usagePeriod)
        .set({
          reservedCredits: Math.max(0, period.reservedCredits - call.reservedCredits),
          updatedAt: new Date(),
          usedCredits: period.usedCredits + call.reservedCredits,
        })
        .where(eq(usagePeriod.id, period.id));
    }

    const [updatedCall] = await tx
      .update(usageCall)
      .set({
        chargedCredits: call.reservedCredits,
        completedAt: new Date(),
        error,
        status: "charged_reserved",
        updatedAt: new Date(),
      })
      .where(eq(usageCall.id, call.id))
      .returning();

    return updatedCall ?? null;
  });
}

export async function resetUserUsage(userId: string) {
  return await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`);

    const now = new Date();
    const [limitRow] = await tx
      .select()
      .from(userUsageLimit)
      .where(eq(userUsageLimit.userId, userId))
      .limit(1);
    const dailyCreditLimit = limitRow?.dailyCreditLimit ?? getDefaultDailyCreditLimit();

    await tx
      .update(usagePeriod)
      .set({ isCurrent: false, resetReason: "manual", updatedAt: now })
      .where(and(eq(usagePeriod.userId, userId), eq(usagePeriod.isCurrent, true)));

    const [createdPeriod] = await tx
      .insert(usagePeriod)
      .values({
        dailyCreditLimit,
        periodEnd: nextUtcDay(now),
        periodStart: now,
        resetReason: "manual",
        userId,
      })
      .returning();

    return createdPeriod ?? null;
  });
}

export async function reconcileStaleUsageCalls(now = new Date()) {
  const startedBefore = new Date(now.getTime() - STALE_STARTED_MS);
  const reservedBefore = new Date(now.getTime() - STALE_RESERVED_MS);
  const staleStarted = await db
    .select({ id: usageCall.id })
    .from(usageCall)
    .where(and(eq(usageCall.status, "started"), lt(usageCall.updatedAt, startedBefore)));
  const staleReserved = await db
    .select({ id: usageCall.id })
    .from(usageCall)
    .where(and(eq(usageCall.status, "reserved"), lt(usageCall.updatedAt, reservedBefore)));

  for (const call of staleStarted) {
    await chargeReservedUsage({ callId: call.id, error: "Stale started usage reservation." });
  }

  for (const call of staleReserved) {
    await releaseUsage({ callId: call.id, error: "Stale unstarted usage reservation." });
  }
}

export type { UsageCall };
