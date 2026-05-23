import type { UIMessage } from "ai";
import { z } from "zod";
import { createFallbackChatTitle } from "#/lib/chat-title.ts";
import { getReasoningModeConfig, type LlmModelConfig } from "#/lib/llm-config.ts";
import type { PublicLlmConfig } from "#/lib/llm-types.ts";

export const createChatSchema = z.object({
  modelId: z.string().min(1).optional(),
  reasoningModeId: z.string().min(1).optional(),
  text: z.string().trim().min(1).max(32_000),
});

export const chatIdSchema = z.object({
  chatId: z.uuid({ version: "v7" }),
});

export const updateUserModelSettingsSchema = z.object({
  modelId: z.string().min(1),
  reasoningModeId: z.string().min(1).optional(),
});

export type ChatRecord = {
  archivedAt: Date | null;
  createdAt: Date;
  id: string;
  title: string | null;
  updatedAt: Date;
};

export type SessionLike = {
  user: {
    email: string;
    id: string;
    image?: string | null;
    isAnonymous?: boolean | null;
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
    reasoningModeId?: string | null;
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
  getLatestUserMessageSelection: (input: {
    chatId: string;
    userId: string;
  }) => Promise<{ modelId: string | null; reasoningModeId: string | null } | null>;
  getLlmConfig: () => Promise<{ defaultModelId: string }>;
  getLlmModelConfig: (modelId: string) => Promise<LlmModelConfig | undefined>;
  getPublicLlmConfig: () => Promise<PublicLlmConfig>;
  getUserModelSettings: (userId: string) => Promise<NonNullable<PublicLlmConfig["userSettings"]>>;
  upsertUserModelSettings: (input: {
    modelId: string;
    reasoningModeId?: string | null;
    userId: string;
  }) => Promise<unknown>;
  deleteChat: (input: { chatId: string; userId: string }) => Promise<boolean>;
  listChatMessages: (input: { chatId: string; userId: string }) => Promise<UIMessage[] | null>;
  listArchivedChatsByUser: (userId: string) => Promise<ChatRecord[]>;
  listChatsByUser: (userId: string) => Promise<ChatRecord[]>;
  notFound: () => unknown;
  requireSession: () => Promise<SessionLike>;
  updateChat: (input: {
    archivedAt?: Date | null;
    chatId: string;
    title?: string;
    userId: string;
  }) => Promise<{ title: string | null } | null>;
};

export type ChatActionsCore = ReturnType<typeof createChatActionsCore>;

export function serializeChatSummary(chat: ChatRecord) {
  return {
    archivedAt: chat.archivedAt?.toISOString() ?? null,
    createdAt: chat.createdAt.toISOString(),
    id: chat.id,
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

      const reasoningMode = getReasoningModeConfig(modelConfig, data.reasoningModeId);

      if (data.reasoningModeId && !reasoningMode) {
        throw new Error("Unsupported reasoning mode");
      }

      const message = createUserMessage(data.text, deps.generateId);
      const created = await deps.createChatWithInitialMessage({
        message,
        modelId,
        reasoningModeId: reasoningMode?.id,
        title: createFallbackChatTitle(data.text),
        userId: session.user.id,
      });

      return {
        chatId: created.chat.id,
        messageId: created.message.id,
        modelId,
        reasoningModeId: reasoningMode?.id,
      };
    },

    async loadNewChatRouteData() {
      const session = await deps.requireSession();
      const [llmConfig, userSettings] = await Promise.all([
        deps.getPublicLlmConfig(),
        deps.getUserModelSettings(session.user.id),
      ]);

      return {
        llmConfig: {
          ...llmConfig,
          userSettings,
        },
      };
    },

    async updateUserModelSettings(data: z.infer<typeof updateUserModelSettingsSchema>) {
      const session = await deps.requireSession();
      const modelConfig = await deps.getLlmModelConfig(data.modelId);

      if (!modelConfig) {
        throw new Error("Unknown model");
      }

      const reasoningMode = getReasoningModeConfig(modelConfig, data.reasoningModeId);

      if (data.reasoningModeId && !reasoningMode) {
        throw new Error("Unsupported reasoning mode");
      }

      await deps.upsertUserModelSettings({
        modelId: data.modelId,
        reasoningModeId: reasoningMode?.id,
        userId: session.user.id,
      });

      return {
        modelId: data.modelId,
        reasoningModeId: reasoningMode?.id ?? null,
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
      const [chats, archivedChats] = await Promise.all([
        deps.listChatsByUser(session.user.id),
        deps.listArchivedChatsByUser(session.user.id),
      ]);

      return {
        archivedChats: archivedChats.map(serializeChatSummary),
        chats: chats.map(serializeChatSummary),
        user: {
          avatar: session.user.image ?? "",
          email: session.user.email,
          isAnonymous: Boolean(session.user.isAnonymous),
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

      const [initialSelection, llmConfig, userSettings] = await Promise.all([
        deps.getLatestUserMessageSelection({
          chatId: data.chatId,
          userId: session.user.id,
        }),
        deps.getPublicLlmConfig(),
        deps.getUserModelSettings(session.user.id),
      ]);

      return {
        chat: serializeChatSummary(existingChat),
        initialSelection,
        llmConfig: {
          ...llmConfig,
          userSettings,
        },
        messagesJson: JSON.stringify(messages),
      };
    },

    async archiveChat(data: z.infer<typeof chatIdSchema>) {
      const session = await deps.requireSession();
      const updatedChat = await deps.updateChat({
        archivedAt: new Date(),
        chatId: data.chatId,
        userId: session.user.id,
      });

      if (!updatedChat) {
        throw deps.notFound();
      }

      return { chatId: data.chatId };
    },

    async deleteChat(data: z.infer<typeof chatIdSchema>) {
      const session = await deps.requireSession();
      const didDelete = await deps.deleteChat({
        chatId: data.chatId,
        userId: session.user.id,
      });

      if (!didDelete) {
        throw deps.notFound();
      }

      return { chatId: data.chatId };
    },
  };
}
