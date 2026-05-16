import { relations, sql } from "drizzle-orm";
import {
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
