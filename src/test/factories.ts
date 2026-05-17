import type { UIMessage } from "ai";
import type { ChatRecord, SessionLike } from "#/lib/chat-actions.core.ts";
import type { PublicLlmConfig } from "#/lib/llm-types.ts";

export const chatId = "018f03d9-d8f7-7c3b-9a69-a8e8d99b6571";
export const userId = "user-1";

export function createTextMessage(
  overrides: Partial<UIMessage> & { text?: string } = {},
): UIMessage {
  const { text = "Hello", ...messageOverrides } = overrides;

  return {
    id: "message-1",
    parts: [{ text, type: "text" }],
    role: "user",
    ...messageOverrides,
  };
}

export function createChatRecord(overrides: Partial<ChatRecord> = {}): ChatRecord {
  return {
    archivedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    id: chatId,
    modelId: "model-default",
    title: "Existing chat",
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

export function createSession(overrides: Partial<SessionLike["user"]> = {}): SessionLike {
  return {
    user: {
      email: "jay@example.com",
      id: userId,
      image: null,
      name: "Jay",
      ...overrides,
    },
  };
}

export function createPublicLlmConfig(overrides: Partial<PublicLlmConfig> = {}): PublicLlmConfig {
  return {
    defaultModelId: "model-default",
    models: [
      {
        capabilities: {
          chatCompletions: true,
          reasoning: false,
          responses: false,
          tools: false,
          vision: false,
        },
        displayName: "Default Model",
        id: "model-default",
        provider: "azure-foundry-chat",
      },
      {
        capabilities: {
          chatCompletions: false,
          reasoning: true,
          responses: true,
          tools: true,
          vision: false,
        },
        displayName: "Other Model",
        id: "model-other",
        provider: "azure-openai-responses",
      },
    ],
    ...overrides,
  };
}
