import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createChatActionsCore,
  type ChatRecord,
  type SessionLike,
} from "#/lib/chat-actions.core.ts";
import {
  chatId,
  createChatRecord,
  createPublicLlmConfig,
  createSession,
  createTextMessage,
  userId,
} from "#/test/factories.ts";

function createDeps() {
  return {
    createChatWithInitialMessage: vi.fn(async () => ({
      chat: { id: chatId },
      message: { id: "saved-message-1" },
    })),
    generateChatTitle: vi.fn(async () => "Generated title"),
    generateId: vi.fn(() => "generated-message-id"),
    getChatForUser: vi.fn<() => Promise<ChatRecord | null>>(async () => createChatRecord()),
    getLlmConfig: vi.fn(async () => ({ defaultModelId: "model-default" })),
    getLlmModelConfig: vi.fn<(modelId: string) => Promise<unknown | undefined>>(
      async (modelId) => ({
        id: modelId,
      }),
    ),
    getPublicLlmConfig: vi.fn(async () => createPublicLlmConfig()),
    listChatMessages: vi.fn(async () => [createTextMessage({ text: "First prompt" })]),
    listChatsByUser: vi.fn(async () => [createChatRecord({ title: null })]),
    notFound: vi.fn(() => {
      throw new Error("Not found");
    }),
    requireSession: vi.fn<() => Promise<SessionLike>>(async () => createSession()),
    updateChat: vi.fn(async ({ title }: { title: string }) => ({ title })),
  };
}

describe("chat actions core", () => {
  let deps: ReturnType<typeof createDeps>;

  beforeEach(() => {
    deps = createDeps();
  });

  it("loads authenticated layout data with serialized chats and user details", async () => {
    const actions = createChatActionsCore(deps);

    await expect(actions.loadAuthedLayoutData()).resolves.toEqual({
      chats: [
        {
          archivedAt: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          id: chatId,
          modelId: "model-default",
          title: "New chat",
          updatedAt: "2026-01-02T00:00:00.000Z",
        },
      ],
      user: {
        avatar: "",
        email: "jay@example.com",
        name: "Jay",
      },
    });
    expect(deps.listChatsByUser).toHaveBeenCalledWith(userId);
  });

  it("creates a chat from the first message using the default model", async () => {
    const actions = createChatActionsCore(deps);

    await expect(actions.createChatFromFirstMessage({ text: "  Hello world  " })).resolves.toEqual({
      chatId,
      messageId: "saved-message-1",
      modelId: "model-default",
    });
    expect(deps.createChatWithInitialMessage).toHaveBeenCalledWith({
      message: {
        id: "generated-message-id",
        parts: [{ text: "  Hello world  ", type: "text" }],
        role: "user",
      },
      modelId: "model-default",
      title: "Hello world",
      userId,
    });
  });

  it("uses an explicit model when creating a chat", async () => {
    const actions = createChatActionsCore(deps);

    await actions.createChatFromFirstMessage({ modelId: "model-other", text: "Hello" });

    expect(deps.getLlmModelConfig).toHaveBeenCalledWith("model-other");
    expect(deps.createChatWithInitialMessage).toHaveBeenCalledWith(
      expect.objectContaining({ modelId: "model-other" }),
    );
  });

  it("rejects unknown models before creating chat rows", async () => {
    deps.getLlmModelConfig.mockResolvedValue(undefined);
    const actions = createChatActionsCore(deps);

    await expect(actions.createChatFromFirstMessage({ text: "Hello" })).rejects.toThrow(
      "Unknown model",
    );
    expect(deps.createChatWithInitialMessage).not.toHaveBeenCalled();
  });

  it("loads a chat route with messages and public model config", async () => {
    const actions = createChatActionsCore(deps);

    const result = await actions.loadChatRouteData({ chatId });

    expect(result.chat.title).toBe("Existing chat");
    expect(JSON.parse(result.messagesJson)).toEqual([createTextMessage({ text: "First prompt" })]);
    expect(result.llmConfig).toEqual(createPublicLlmConfig());
  });

  it("throws notFound when chat route ownership check fails", async () => {
    deps.getChatForUser.mockResolvedValue(null);
    const actions = createChatActionsCore(deps);

    await expect(actions.loadChatRouteData({ chatId })).rejects.toThrow("Not found");
    expect(deps.listChatMessages).not.toHaveBeenCalled();
  });

  it("generates and saves a title from the first user message", async () => {
    const actions = createChatActionsCore(deps);

    await expect(actions.generateAndSaveChatTitle({ chatId })).resolves.toEqual({
      title: "Generated title",
    });
    expect(deps.generateChatTitle).toHaveBeenCalledWith({
      chatId,
      message: createTextMessage({ text: "First prompt" }),
      userId,
    });
    expect(deps.updateChat).toHaveBeenCalledWith({
      chatId,
      title: "Generated title",
      userId,
    });
  });

  it("keeps the existing title when no user message exists", async () => {
    deps.listChatMessages.mockResolvedValue([createTextMessage({ role: "assistant" })]);
    const actions = createChatActionsCore(deps);

    await expect(actions.generateAndSaveChatTitle({ chatId })).resolves.toEqual({
      title: "Existing chat",
    });
    expect(deps.updateChat).not.toHaveBeenCalled();
  });

  it("falls back to the existing title when title generation fails", async () => {
    deps.generateChatTitle.mockRejectedValue(new Error("provider failed"));
    const actions = createChatActionsCore(deps);

    await expect(actions.generateAndSaveChatTitle({ chatId })).resolves.toEqual({
      title: "Existing chat",
    });
    expect(deps.updateChat).not.toHaveBeenCalled();
  });
});
