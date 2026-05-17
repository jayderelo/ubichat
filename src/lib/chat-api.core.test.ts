import type { LanguageModel, ModelMessage, UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmModelConfig } from "#/lib/llm-config.ts";
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

type TestSession = { user: { id: string } };

function createModelConfig(id = "model-default"): LlmModelConfig {
  return {
    apiVersion: "2025-04-01-preview",
    baseURL: "https://example.com",
    capabilities: {
      chatCompletions: true,
      reasoning: false,
      responses: false,
      tools: false,
      vision: false,
    },
    displayName: "Test Model",
    id,
    model: id,
    provider: "azure-foundry-chat",
    usage: {
      cacheReadCreditWeight: 0.25,
      cacheWriteCreditWeight: 1,
      inputCreditWeight: 1,
      maxInputBytes: 100_000,
      maxOutputTokens: 512,
      outputCreditWeight: 2,
      reasoningCreditWeight: 3,
      reserveMultiplier: 1,
    },
  };
}

function createDeps() {
  const streamResponse = new Response("stream", { status: 200 });
  return {
    assertTextOnlyMessages: vi.fn(),
    assertWithinModelInputLimit: vi.fn(),
    authGetSession: vi.fn<(headers: Headers) => Promise<TestSession | null>>(async () =>
      createSession(),
    ),
    chargeReservedUsage: vi.fn(async () => undefined),
    convertToModelMessages: vi.fn(async (messages: UIMessage[]) => [
      {
        content: messages[0]?.parts[0]?.type === "text" ? messages[0].parts[0].text : "",
        role: "user",
      } satisfies ModelMessage,
    ]),
    createLanguageModel: vi.fn(() => ({ model: "language-model" }) as unknown as LanguageModel),
    estimateInputTokens: vi.fn(() => 8),
    finalizeChatUsageAndMessages: vi.fn(async () => undefined),
    getChatForUser: vi.fn<() => Promise<unknown | null>>(async () => ({ id: chatId })),
    getLlmConfig: vi.fn(async () => ({ defaultModelId: "model-default" })),
    getLlmModelConfig: vi.fn<(modelId: string) => Promise<LlmModelConfig | undefined>>(
      async (modelId) => createModelConfig(modelId),
    ),
    listChatMessages: vi.fn(async () => [] as UIMessage[]),
    markProviderStarted: vi.fn(async () => undefined),
    releaseUsage: vi.fn(async () => undefined),
    reserveUsage: vi.fn(async () => ({ call: { id: "usage-call-1" }, ok: true as const })),
    streamText: vi.fn(() => ({
      finishReason: Promise.resolve("stop"),
      toUIMessageStreamResponse: vi.fn(() => streamResponse),
      totalUsage: Promise.resolve({
        inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: 0, noCacheTokens: 4 },
        inputTokens: 4,
        outputTokenDetails: { reasoningTokens: 0, textTokens: 2 },
        outputTokens: 2,
        totalTokens: 6,
      }),
    })),
    validateUIMessages: vi.fn(
      async ({ messages }: { messages: unknown }) => messages as UIMessage[],
    ),
  } satisfies ChatApiDeps;
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
    deps.listChatMessages.mockResolvedValue([]);
    const handlePost = createChatApiHandler(deps);

    const response = await handlePost(jsonRequest({ chatId, messages: originalMessages }));

    expect(response.status).toBe(200);
    expect(deps.getLlmModelConfig).toHaveBeenCalledWith("model-default");
    expect(deps.getChatForUser).toHaveBeenCalledWith({ chatId, userId });
    expect(deps.streamText).toHaveBeenCalledWith({
      experimental_onStepStart: expect.any(Function),
      maxOutputTokens: 512,
      maxRetries: 0,
      messages: [{ content: "Hello", role: "user" }],
      model: { model: "language-model" },
      onAbort: expect.any(Function),
      onError: expect.any(Function),
      system: SYSTEM_PROMPT,
    });
    expect(deps.reserveUsage).toHaveBeenCalledWith({
      chatId,
      estimatedInputTokens: 8,
      kind: "chat",
      modelConfig: createModelConfig("model-default"),
      userId,
    });

    const streamResult = deps.streamText.mock.results[0]?.value;
    const streamOptions = streamResult.toUIMessageStreamResponse.mock.calls[0]?.[0];

    expect(streamOptions.originalMessages).toEqual(originalMessages);
    await streamOptions.onFinish({ messages: finishedMessages });
    expect(deps.finalizeChatUsageAndMessages).toHaveBeenCalledWith({
      callId: "usage-call-1",
      chatId,
      finishReason: "stop",
      messages: finishedMessages,
      modelConfig: createModelConfig("model-default"),
      modelId: "model-default",
      usage: {
        inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: 0, noCacheTokens: 4 },
        inputTokens: 4,
        outputTokenDetails: { reasoningTokens: 0, textTokens: 2 },
        outputTokens: 2,
        totalTokens: 6,
      },
      userId,
    });
  });

  it("uses an explicit model id when provided", async () => {
    const handlePost = createChatApiHandler(deps);

    await handlePost(jsonRequest({ chatId, messages: [], modelId: "model-other" }));

    expect(deps.getLlmModelConfig).toHaveBeenCalledWith("model-other");
  });
});
