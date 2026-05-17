import type { LanguageModel, ModelMessage, UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createChatApiHandler, SYSTEM_PROMPT, type ChatApiDeps } from "#/lib/chat-api.core.ts";
import { chatId, createSession, createTextMessage, userId } from "#/test/factories.ts";

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/chat", {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
}

async function responseJson(response: Response) {
  return (await response.json()) as unknown;
}

type TestModelConfig = { id: string };
type TestSession = { user: { id: string } };

function createDeps() {
  const streamResponse = new Response("stream", { status: 200 });
  return {
    authGetSession: vi.fn<(headers: Headers) => Promise<TestSession | null>>(async () =>
      createSession(),
    ),
    convertToModelMessages: vi.fn(async (messages: UIMessage[]) => [
      {
        content: messages[0]?.parts[0]?.type === "text" ? messages[0].parts[0].text : "",
        role: "user",
      } satisfies ModelMessage,
    ]),
    createLanguageModel: vi.fn(() => ({ model: "language-model" }) as unknown as LanguageModel),
    getChatForUser: vi.fn<() => Promise<unknown | null>>(async () => ({ id: chatId })),
    getLlmConfig: vi.fn(async () => ({ defaultModelId: "model-default" })),
    getLlmModelConfig: vi.fn<(modelId: string) => Promise<TestModelConfig | undefined>>(
      async (modelId) => ({ id: modelId }),
    ),
    replaceChatMessages: vi.fn(async () => undefined),
    streamText: vi.fn(() => ({
      toUIMessageStreamResponse: vi.fn(() => streamResponse),
    })),
    validateUIMessages: vi.fn(async ({ messages }: { messages: unknown }) => messages as UIMessage[]),
  } satisfies ChatApiDeps<TestModelConfig>;
}

describe("chat API core", () => {
  let deps: ReturnType<typeof createDeps>;

  beforeEach(() => {
    deps = createDeps();
  });

  it("rejects unauthenticated requests", async () => {
    deps.authGetSession.mockResolvedValue(null);
    const handlePost = createChatApiHandler(deps);

    const response = await handlePost(jsonRequest({ chatId, messages: [] }));

    expect(response.status).toBe(401);
    await expect(responseJson(response)).resolves.toEqual({ error: "Unauthorized" });
  });

  it("rejects malformed JSON", async () => {
    const handlePost = createChatApiHandler(deps);

    const response = await handlePost(
      new Request("http://localhost/api/chat", { body: "{", method: "POST" }),
    );

    expect(response.status).toBe(400);
    await expect(responseJson(response)).resolves.toEqual({ error: "Invalid chat request" });
  });

  it("rejects invalid request bodies", async () => {
    const handlePost = createChatApiHandler(deps);

    const response = await handlePost(jsonRequest({ chatId: "not-a-uuid", messages: [] }));

    expect(response.status).toBe(400);
    await expect(responseJson(response)).resolves.toEqual({ error: "Invalid chat request" });
  });

  it("rejects unknown models", async () => {
    deps.getLlmModelConfig.mockResolvedValue(undefined);
    const handlePost = createChatApiHandler(deps);

    const response = await handlePost(jsonRequest({ chatId, messages: [] }));

    expect(response.status).toBe(400);
    await expect(responseJson(response)).resolves.toEqual({ error: "Unknown model" });
  });

  it("rejects chats the user cannot access", async () => {
    deps.getChatForUser.mockResolvedValue(null);
    const handlePost = createChatApiHandler(deps);

    const response = await handlePost(jsonRequest({ chatId, messages: [] }));

    expect(response.status).toBe(404);
    await expect(responseJson(response)).resolves.toEqual({ error: "Chat not found" });
  });

  it("rejects invalid UI messages", async () => {
    deps.validateUIMessages.mockRejectedValue(new Error("invalid"));
    const handlePost = createChatApiHandler(deps);

    const response = await handlePost(jsonRequest({ chatId, messages: [{}] }));

    expect(response.status).toBe(400);
    await expect(responseJson(response)).resolves.toEqual({ error: "Invalid messages" });
  });

  it("streams with the default model and persists finished messages", async () => {
    const originalMessages = [createTextMessage({ text: "Hello" })];
    const finishedMessages = [
      originalMessages[0],
      createTextMessage({ id: "assistant-1", role: "assistant", text: "Hi" }),
    ];
    const handlePost = createChatApiHandler(deps);

    const response = await handlePost(jsonRequest({ chatId, messages: originalMessages }));

    expect(response.status).toBe(200);
    expect(deps.getLlmModelConfig).toHaveBeenCalledWith("model-default");
    expect(deps.getChatForUser).toHaveBeenCalledWith({ chatId, userId });
    expect(deps.streamText).toHaveBeenCalledWith({
      messages: [{ content: "Hello", role: "user" }],
      model: { model: "language-model" },
      system: SYSTEM_PROMPT,
    });

    const streamResult = deps.streamText.mock.results[0]?.value;
    const streamOptions = streamResult.toUIMessageStreamResponse.mock.calls[0]?.[0];

    expect(streamOptions.originalMessages).toEqual(originalMessages);
    await streamOptions.onFinish({ messages: finishedMessages });
    expect(deps.replaceChatMessages).toHaveBeenCalledWith({
      chatId,
      messages: finishedMessages,
      modelId: "model-default",
      userId,
    });
  });

  it("uses an explicit model id when provided", async () => {
    const handlePost = createChatApiHandler(deps);

    await handlePost(jsonRequest({ chatId, messages: [], modelId: "model-other" }));

    expect(deps.getLlmModelConfig).toHaveBeenCalledWith("model-other");
  });
});
