import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { notFound } from "@tanstack/react-router";
import { generateId, type UIMessage } from "ai";
import { z } from "zod";
import { auth } from "#/lib/auth.ts";
import { createFallbackChatTitle, generateChatTitle } from "#/lib/chat-title.ts";
import {
  createChatWithInitialMessage,
  getChatForUser,
  listChatMessages,
  listChatsByUser,
  updateChat,
} from "#/lib/chats.ts";
import { getLlmConfig, getLlmModelConfig, getPublicLlmConfig } from "#/lib/llm-config.ts";

const createChatSchema = z.object({
  modelId: z.string().min(1).optional(),
  text: z.string().trim().min(1).max(32_000),
});

const chatIdSchema = z.object({
  chatId: z.string().uuid(),
});

async function requireSession() {
  const session = await auth.api.getSession({
    headers: getRequestHeaders(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session;
}

function serializeChatSummary(chat: Awaited<ReturnType<typeof listChatsByUser>>[number]) {
  return {
    archivedAt: chat.archivedAt?.toISOString() ?? null,
    createdAt: chat.createdAt.toISOString(),
    id: chat.id,
    modelId: chat.modelId,
    title: chat.title ?? "New chat",
    updatedAt: chat.updatedAt.toISOString(),
  };
}

function createUserMessage(text: string): UIMessage {
  return {
    id: generateId(),
    parts: [{ text, type: "text" }],
    role: "user",
  };
}

export const loadAuthedLayoutData = createServerFn({ method: "GET" }).handler(async () => {
  const session = await requireSession();
  const chats = await listChatsByUser(session.user.id);

  return {
    chats: chats.map(serializeChatSummary),
    user: {
      avatar: session.user.image ?? "",
      email: session.user.email,
      name: session.user.name,
    },
  };
});

export const createChatFromFirstMessage = createServerFn({ method: "POST" })
  .inputValidator(createChatSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const config = await getLlmConfig();
    const modelId = data.modelId ?? config.defaultModelId;
    const modelConfig = await getLlmModelConfig(modelId);

    if (!modelConfig) {
      throw new Error("Unknown model");
    }

    const message = createUserMessage(data.text);
    const title = createFallbackChatTitle(data.text);
    const created = await createChatWithInitialMessage({
      message,
      modelId,
      title,
      userId: session.user.id,
    });

    return {
      chatId: created.chat.id,
      messageId: created.message.id,
      modelId,
    };
  });

export const loadChatRouteData = createServerFn({ method: "GET" })
  .inputValidator(chatIdSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const existingChat = await getChatForUser({
      chatId: data.chatId,
      userId: session.user.id,
    });

    if (!existingChat) {
      throw notFound();
    }

    const messages = await listChatMessages({
      chatId: data.chatId,
      userId: session.user.id,
    });

    if (!messages) {
      throw notFound();
    }

    return {
      chat: serializeChatSummary(existingChat),
      llmConfig: await getPublicLlmConfig(),
      messagesJson: JSON.stringify(messages),
    };
  });

export const generateAndSaveChatTitle = createServerFn({ method: "POST" })
  .inputValidator(chatIdSchema)
  .handler(async ({ data }) => {
    const session = await requireSession();
    const existingChat = await getChatForUser({
      chatId: data.chatId,
      userId: session.user.id,
    });

    if (!existingChat) {
      throw notFound();
    }

    const messages = await listChatMessages({
      chatId: data.chatId,
      userId: session.user.id,
    });
    const firstUserMessage = messages?.find((message) => message.role === "user");

    if (!firstUserMessage) {
      return { title: existingChat.title ?? "New chat" };
    }

    try {
      const title = await generateChatTitle(firstUserMessage);
      const updatedChat = await updateChat({
        chatId: data.chatId,
        title,
        userId: session.user.id,
      });

      return { title: updatedChat?.title ?? title };
    } catch {
      return { title: existingChat.title ?? "New chat" };
    }
  });
