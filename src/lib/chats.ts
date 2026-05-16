import { and, asc, desc, eq } from "drizzle-orm";
import type { UIMessage } from "ai";
import { chat, chatMessage, type Chat } from "../../database/schema/app-schema";
import { db } from "#/lib/db.ts";

type ChatIdInput = {
  chatId: string;
  userId: string;
};

type CreateChatInput = {
  userId: string;
  title?: string | null;
  modelId?: string | null;
};

type UpdateChatInput = ChatIdInput & {
  title?: string | null;
  modelId?: string | null;
  archivedAt?: Date | null;
};

type ChatMessageInput = {
  message: UIMessage;
  modelId?: string | null;
};

type ReplaceChatMessagesInput = ChatIdInput & {
  messages: UIMessage[];
  modelId?: string | null;
};

type AppendChatMessageInput = ChatIdInput & ChatMessageInput;

type ChatUpdateValues = {
  title?: string | null;
  modelId?: string | null;
  archivedAt?: Date | null;
  updatedAt: Date;
};

function toChatMessageRow(
  chatId: string,
  { message, modelId }: ChatMessageInput,
  position: number,
) {
  return {
    chatId,
    message,
    modelId,
    position,
    role: message.role,
    uiMessageId: message.id,
  };
}

function buildChatUpdateValues(input: UpdateChatInput): ChatUpdateValues {
  const values: ChatUpdateValues = {
    updatedAt: new Date(),
  };

  if ("title" in input) {
    values.title = input.title;
  }

  if ("modelId" in input) {
    values.modelId = input.modelId;
  }

  if ("archivedAt" in input) {
    values.archivedAt = input.archivedAt;
  }

  return values;
}

export async function createChat(input: CreateChatInput) {
  const [createdChat] = await db
    .insert(chat)
    .values({
      modelId: input.modelId,
      title: input.title,
      userId: input.userId,
    })
    .returning();

  return createdChat;
}

export async function listChatsByUser(userId: string) {
  return await db.select().from(chat).where(eq(chat.userId, userId)).orderBy(desc(chat.updatedAt));
}

export async function getChatForUser({ chatId, userId }: ChatIdInput) {
  const [existingChat] = await db
    .select()
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);

  return existingChat ?? null;
}

export async function updateChat(input: UpdateChatInput) {
  const [updatedChat] = await db
    .update(chat)
    .set(buildChatUpdateValues(input))
    .where(and(eq(chat.id, input.chatId), eq(chat.userId, input.userId)))
    .returning();

  return updatedChat ?? null;
}

export async function deleteChat({ chatId, userId }: ChatIdInput) {
  const [deletedChat] = await db
    .delete(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .returning({ id: chat.id });

  return Boolean(deletedChat);
}

export async function replaceChatMessages({
  chatId,
  messages,
  modelId,
  userId,
}: ReplaceChatMessagesInput) {
  return await db.transaction(async (tx) => {
    const [existingChat] = await tx
      .select({ id: chat.id })
      .from(chat)
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
      .limit(1);

    if (!existingChat) {
      return null;
    }

    await tx.delete(chatMessage).where(eq(chatMessage.chatId, chatId));

    const rows = messages.map((message, position) =>
      toChatMessageRow(chatId, { message, modelId }, position),
    );

    const savedMessages =
      rows.length > 0 ? await tx.insert(chatMessage).values(rows).returning() : [];

    await tx
      .update(chat)
      .set({ updatedAt: new Date() })
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));

    return savedMessages;
  });
}

export async function appendChatMessage({
  chatId,
  message,
  modelId,
  userId,
}: AppendChatMessageInput) {
  return await db.transaction(async (tx) => {
    const [existingChat] = await tx
      .select({ id: chat.id })
      .from(chat)
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
      .limit(1);

    if (!existingChat) {
      return null;
    }

    const existingMessages = await tx
      .select({ position: chatMessage.position })
      .from(chatMessage)
      .where(eq(chatMessage.chatId, chatId))
      .orderBy(desc(chatMessage.position))
      .limit(1);

    const position = (existingMessages[0]?.position ?? -1) + 1;
    const [savedMessage] = await tx
      .insert(chatMessage)
      .values(toChatMessageRow(chatId, { message, modelId }, position))
      .returning();

    await tx
      .update(chat)
      .set({ updatedAt: new Date() })
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));

    return savedMessage;
  });
}

export async function listChatMessages({
  chatId,
  userId,
}: ChatIdInput): Promise<UIMessage[] | null> {
  const existingChat = await getChatForUser({ chatId, userId });

  if (!existingChat) {
    return null;
  }

  const rows = await db
    .select({ message: chatMessage.message })
    .from(chatMessage)
    .where(eq(chatMessage.chatId, chatId))
    .orderBy(asc(chatMessage.position));

  return rows.map((row) => row.message);
}

export type { Chat };
