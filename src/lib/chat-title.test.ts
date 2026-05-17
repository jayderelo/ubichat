import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { chatId, createTextMessage, userId } from "#/test/factories.ts";

const generateText = vi.fn();
const objectOutput = { kind: "object-output" };
const chargeReservedUsage = vi.fn();
const estimateInputTokens = vi.fn(() => 12);
const finalizeUsageWithModel = vi.fn();
const markProviderStarted = vi.fn();
const releaseUsage = vi.fn();
const reserveUsage = vi.fn();

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();

  return {
    ...actual,
    Output: {
      object: vi.fn(() => objectOutput),
    },
    generateText,
  };
});

const getTitleLlmModelConfig = vi.fn();
const createLanguageModel = vi.fn(() => ({ model: "title-model" }));

vi.mock("#/lib/llm-config.ts", () => ({
  createLanguageModel,
  getTitleLlmModelConfig,
}));

vi.mock("#/lib/usage.ts", () => ({
  chargeReservedUsage,
  estimateInputTokens,
  finalizeUsageWithModel,
  markProviderStarted,
  releaseUsage,
  reserveUsage,
}));

const titleModelConfig = {
  apiVersion: "2025-04-01-preview",
  baseURL: "https://example.com",
  capabilities: {
    chatCompletions: true,
    reasoning: false,
    responses: false,
    tools: false,
    vision: false,
  },
  displayName: "Title Model",
  id: "title-model",
  model: "title-model",
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
} as const;

function titleInput(message: UIMessage) {
  return { chatId, message, userId };
}

describe("createFallbackChatTitle", () => {
  it("normalizes whitespace", async () => {
    const { createFallbackChatTitle } = await import("#/lib/chat-title.ts");

    expect(createFallbackChatTitle("  hello\n\nworld\tagain  ")).toBe("hello world again");
  });

  it("uses a generic title for empty text", async () => {
    const { createFallbackChatTitle } = await import("#/lib/chat-title.ts");

    expect(createFallbackChatTitle(" \n\t ")).toBe("New chat");
  });

  it("truncates long text to the title limit", async () => {
    const { createFallbackChatTitle } = await import("#/lib/chat-title.ts");

    const title = createFallbackChatTitle("a".repeat(100));

    expect(title).toHaveLength(80);
    expect(title.endsWith("...")).toBe(true);
  });
});

describe("generateChatTitle", () => {
  beforeEach(() => {
    generateText.mockReset();
    getTitleLlmModelConfig.mockReset();
    createLanguageModel.mockClear();
    chargeReservedUsage.mockReset();
    estimateInputTokens.mockClear();
    finalizeUsageWithModel.mockReset();
    markProviderStarted.mockReset();
    releaseUsage.mockReset();
    reserveUsage.mockReset();
    reserveUsage.mockResolvedValue({ call: { id: "usage-call-1" }, ok: true });
  });

  it("falls back to message text when no title model is configured", async () => {
    getTitleLlmModelConfig.mockResolvedValue(undefined);
    const { generateChatTitle } = await import("#/lib/chat-title.ts");

    await expect(
      generateChatTitle(titleInput(createTextMessage({ text: "Fallback title" }))),
    ).resolves.toBe("Fallback title");
    expect(generateText).not.toHaveBeenCalled();
  });

  it("uses all text parts from the first message in the title prompt", async () => {
    getTitleLlmModelConfig.mockResolvedValue(titleModelConfig);
    generateText.mockResolvedValue({
      finishReason: "stop",
      output: { title: "Generated" },
      usage: {
        inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: 0 },
        inputTokens: 10,
        outputTokenDetails: { reasoningTokens: 0 },
        outputTokens: 2,
        totalTokens: 12,
      },
    });
    const { generateChatTitle } = await import("#/lib/chat-title.ts");
    const message: UIMessage = {
      id: "message-1",
      parts: [
        { text: "First line", type: "text" },
        { text: "Second line", type: "text" },
      ],
      role: "user",
    };

    await expect(generateChatTitle(titleInput(message))).resolves.toBe("Generated");

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 64,
        maxRetries: 0,
        model: { model: "title-model" },
        output: objectOutput,
        prompt: expect.stringContaining("First line\nSecond line"),
      }),
    );
    expect(reserveUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId,
        estimatedInputTokens: 12,
        kind: "title",
        userId,
      }),
    );
    expect(finalizeUsageWithModel).toHaveBeenCalledWith(
      expect.objectContaining({
        callId: "usage-call-1",
        finishReason: "stop",
      }),
    );
  });

  it("normalizes generated titles before returning them", async () => {
    getTitleLlmModelConfig.mockResolvedValue(titleModelConfig);
    generateText.mockResolvedValue({
      finishReason: "stop",
      output: { title: "  Generated\nTitle  " },
      usage: {
        inputTokenDetails: { cacheReadTokens: 0, cacheWriteTokens: 0 },
        inputTokens: 10,
        outputTokenDetails: { reasoningTokens: 0 },
        outputTokens: 2,
        totalTokens: 12,
      },
    });
    const { generateChatTitle } = await import("#/lib/chat-title.ts");

    await expect(generateChatTitle(titleInput(createTextMessage()))).resolves.toBe(
      "Generated Title",
    );
  });

  it("falls back to message text when the provider fails", async () => {
    getTitleLlmModelConfig.mockResolvedValue(titleModelConfig);
    generateText.mockRejectedValue(new Error("provider failed"));
    const { generateChatTitle } = await import("#/lib/chat-title.ts");

    await expect(
      generateChatTitle(titleInput(createTextMessage({ text: "Fallback" }))),
    ).resolves.toBe("Fallback");
    expect(chargeReservedUsage).toHaveBeenCalledWith({
      callId: "usage-call-1",
      error: "provider failed",
    });
  });
});
