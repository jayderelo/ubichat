import type { UIMessage } from "ai";
import { z } from "zod";
import { createFallbackChatTitle } from "#/lib/chat-title.ts";
import type { PublicLlmConfig } from "#/lib/llm-types.ts";

export const createChatSchema = z.object({
  modelId: z.string().min(1).optional(),
  text: z.string().trim().min(1).max(32_000),
});

export const chatIdSchema = z.object({
  chatId: z.uuid({ version: "v7" }),
});

export type ChatRecord = {
  archivedAt: Date | null;
  createdAt: Date;
  id: string;
  modelId: string | null;
  title: string | null;
  updatedAt: Date;
};

export type SessionLike = {
  user: {
    email: string;
    id: string;
    image?: string | null;
    name: string;
  };
};

type SavedInitialMessage = {
  chat: { id: string };
  message: { id: string };
};

type ChatActionsDeps = {
  createChatWithInitialMessage: (input: {
    message: UIMessage;
    modelId: string;
    title: string;
    userId: string;
  }) => Promise<SavedInitialMessage>;
  generateChatTitle: (input: {
    chatId: string;
    message: UIMessage;
    userId: string;
  }) => Promise<string>;
  generateId: () => string;
  getChatForUser: (input: { chatId: string; userId: string }) => Promise<ChatRecord | null>;
  getLlmConfig: () => Promise<{ defaultModelId: string }>;
  getLlmModelConfig: (modelId: string) => Promise<unknown | undefined>;
  getPublicLlmConfig: () => Promise<PublicLlmConfig>;
  listChatMessages: (input: { chatId: string; userId: string }) => Promise<UIMessage[] | null>;
  listChatsByUser: (userId: string) => Promise<ChatRecord[]>;
  notFound: () => unknown;
  requireSession: () => Promise<SessionLike>;
  updateChat: (input: {
    chatId: string;
    title: string;
    userId: string;
  }) => Promise<{ title: string | null } | null>;
};

export type ChatActionsCore = ReturnType<typeof createChatActionsCore>;

export function serializeChatSummary(chat: ChatRecord) {
  return {
    archivedAt: chat.archivedAt?.toISOString() ?? null,
    createdAt: chat.createdAt.toISOString(),
    id: chat.id,
    modelId: chat.modelId,
    title: chat.title ?? "New chat",
    updatedAt: chat.updatedAt.toISOString(),
  };
}

export function createUserMessage(text: string, generateId: () => string): UIMessage {
  return {
    id: generateId(),
    parts: [{ text, type: "text" }],
    role: "user",
  };
}

export function createChatActionsCore(deps: ChatActionsDeps) {
  return {
    async createChatFromFirstMessage(data: z.infer<typeof createChatSchema>) {
      const session = await deps.requireSession();
      const config = await deps.getLlmConfig();
      const modelId = data.modelId ?? config.defaultModelId;
      const modelConfig = await deps.getLlmModelConfig(modelId);

      if (!modelConfig) {
        throw new Error("Unknown model");
      }

      const message = createUserMessage(data.text, deps.generateId);
      const created = await deps.createChatWithInitialMessage({
        message,
        modelId,
        title: createFallbackChatTitle(data.text),
        userId: session.user.id,
      });

      return {
        chatId: created.chat.id,
        messageId: created.message.id,
        modelId,
      };
    },

    async generateAndSaveChatTitle(data: z.infer<typeof chatIdSchema>) {
      const session = await deps.requireSession();
      const existingChat = await deps.getChatForUser({
        chatId: data.chatId,
        userId: session.user.id,
      });

      if (!existingChat) {
        throw deps.notFound();
      }

      const messages = await deps.listChatMessages({
        chatId: data.chatId,
        userId: session.user.id,
      });
      const firstUserMessage = messages?.find((message) => message.role === "user");

      if (!firstUserMessage) {
        return { title: existingChat.title ?? "New chat" };
      }

      try {
        const title = await deps.generateChatTitle({
          chatId: data.chatId,
          message: firstUserMessage,
          userId: session.user.id,
        });
        const updatedChat = await deps.updateChat({
          chatId: data.chatId,
          title,
          userId: session.user.id,
        });

        return { title: updatedChat?.title ?? title };
      } catch {
        return { title: existingChat.title ?? "New chat" };
      }
    },

    async loadAuthedLayoutData() {
      const session = await deps.requireSession();
      const chats = await deps.listChatsByUser(session.user.id);

      return {
        chats: chats.map(serializeChatSummary),
        user: {
          avatar: session.user.image ?? "",
          email: session.user.email,
          name: session.user.name,
        },
      };
    },

    async loadChatRouteData(data: z.infer<typeof chatIdSchema>) {
      const session = await deps.requireSession();
      const existingChat = await deps.getChatForUser({
        chatId: data.chatId,
        userId: session.user.id,
      });

      if (!existingChat) {
        throw deps.notFound();
      }

      const messages = await deps.listChatMessages({
        chatId: data.chatId,
        userId: session.user.id,
      });

      if (!messages) {
        throw deps.notFound();
      }

      return {
        chat: serializeChatSummary(existingChat),
        llmConfig: await deps.getPublicLlmConfig(),
        messagesJson: JSON.stringify(messages),
      };
    },
  };
}
