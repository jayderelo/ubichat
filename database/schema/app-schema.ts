import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { UIMessage } from "ai";
import { user } from "./auth-schema";

export const chat = pgTable(
  "chat",
  {
    id: uuid("id")
      .default(sql`uuidv7()`)
      .primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    modelId: text("model_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    archivedAt: timestamp("archived_at"),
  },
  (table) => [
    index("chat_user_id_idx").on(table.userId),
    index("chat_user_id_updated_at_idx").on(table.userId, table.updatedAt),
    index("chat_user_id_archived_at_idx").on(table.userId, table.archivedAt),
  ],
);

export const chatMessage = pgTable(
  "chat_message",
  {
    id: uuid("id")
      .default(sql`uuidv7()`)
      .primaryKey(),
    chatId: uuid("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    uiMessageId: text("ui_message_id").notNull(),
    role: text("role").$type<UIMessage["role"]>().notNull(),
    message: jsonb("message").$type<UIMessage>().notNull(),
    position: integer("position").notNull(),
    modelId: text("model_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("chat_message_chat_id_created_at_idx").on(table.chatId, table.createdAt),
    index("chat_message_chat_id_position_idx").on(table.chatId, table.position),
    uniqueIndex("chat_message_chat_id_position_unique").on(table.chatId, table.position),
    uniqueIndex("chat_message_chat_id_ui_message_id_unique").on(table.chatId, table.uiMessageId),
  ],
);

export const userUsageLimit = pgTable("user_usage_limit", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  dailyCreditLimit: integer("daily_credit_limit").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

export const usagePeriod = pgTable(
  "usage_period",
  {
    id: uuid("id")
      .default(sql`uuidv7()`)
      .primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    periodStart: timestamp("period_start").notNull(),
    periodEnd: timestamp("period_end").notNull(),
    dailyCreditLimit: integer("daily_credit_limit").notNull(),
    usedCredits: integer("used_credits").default(0).notNull(),
    reservedCredits: integer("reserved_credits").default(0).notNull(),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    reasoningTokens: integer("reasoning_tokens").default(0).notNull(),
    cacheReadTokens: integer("cache_read_tokens").default(0).notNull(),
    cacheWriteTokens: integer("cache_write_tokens").default(0).notNull(),
    isCurrent: boolean("is_current").default(true).notNull(),
    resetReason: text("reset_reason").$type<"daily" | "manual">().default("daily").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("usage_period_user_id_idx").on(table.userId),
    index("usage_period_user_id_current_idx").on(table.userId, table.isCurrent),
    index("usage_period_user_id_period_start_idx").on(table.userId, table.periodStart),
  ],
);

export const usageCall = pgTable(
  "usage_call",
  {
    id: uuid("id")
      .default(sql`uuidv7()`)
      .primaryKey(),
    periodId: uuid("period_id")
      .notNull()
      .references(() => usagePeriod.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    chatId: uuid("chat_id").references(() => chat.id, { onDelete: "set null" }),
    usageKind: text("usage_kind").$type<"chat" | "title">().notNull(),
    modelId: text("model_id").notNull(),
    status: text("status")
      .$type<"reserved" | "started" | "completed" | "released" | "charged_reserved">()
      .default("reserved")
      .notNull(),
    reservedCredits: integer("reserved_credits").notNull(),
    chargedCredits: integer("charged_credits").default(0).notNull(),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    reasoningTokens: integer("reasoning_tokens").default(0).notNull(),
    cacheReadTokens: integer("cache_read_tokens").default(0).notNull(),
    cacheWriteTokens: integer("cache_write_tokens").default(0).notNull(),
    rawUsage: jsonb("raw_usage"),
    finishReason: text("finish_reason"),
    error: text("error"),
    providerStartedAt: timestamp("provider_started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("usage_call_period_id_idx").on(table.periodId),
    index("usage_call_user_id_created_at_idx").on(table.userId, table.createdAt),
    index("usage_call_status_created_at_idx").on(table.status, table.createdAt),
  ],
);

export const chatRelations = relations(chat, ({ many, one }) => ({
  user: one(user, {
    fields: [chat.userId],
    references: [user.id],
  }),
  messages: many(chatMessage),
}));

export const chatMessageRelations = relations(chatMessage, ({ one }) => ({
  chat: one(chat, {
    fields: [chatMessage.chatId],
    references: [chat.id],
  }),
}));

export type Chat = typeof chat.$inferSelect;
export type NewChat = typeof chat.$inferInsert;
export type ChatMessage = typeof chatMessage.$inferSelect;
export type NewChatMessage = typeof chatMessage.$inferInsert;
export type UsagePeriod = typeof usagePeriod.$inferSelect;
export type UsageCall = typeof usageCall.$inferSelect;
