import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import type { LlmModelConfig } from "#/lib/llm-config.ts";
import {
  assertTextOnlyMessages,
  assertWithinModelInputLimit,
  estimateInputTokens,
  estimateReservedCredits,
  normalizeMessagesForStorage,
} from "#/lib/usage.ts";

const message: UIMessage = {
  id: "message-1",
  parts: [{ text: "hello world", type: "text" }],
  role: "user",
};

const modelConfig = {
  apiVersion: "2025-04-01-preview",
  baseURL: "https://example.com",
  capabilities: {
    chatCompletions: true,
    reasoning: true,
    responses: false,
    tools: false,
    vision: false,
  },
  displayName: "Test Model",
  id: "test-model",
  lab: "deepseek",
  model: "test-model",
  provider: "azure-foundry-chat",
  reasoning: {
    defaultModeId: "high",
    modes: [{ id: "high", label: "High" }],
  },
  usage: {
    cacheReadCreditWeight: 0.25,
    cacheWriteCreditWeight: 1,
    inputCreditWeight: 1,
    maxInputBytes: 100,
    maxOutputTokens: 10,
    outputCreditWeight: 2,
    reasoningCreditWeight: 3,
    reserveMultiplier: 1,
  },
} satisfies LlmModelConfig;

describe("usage helpers", () => {
  it("estimates input tokens from message text", () => {
    expect(estimateInputTokens([message])).toBe(4);
  });

  it("reserves input, output, and reasoning credits", () => {
    expect(estimateReservedCredits([message], modelConfig)).toBe(54);
  });

  it("rejects non-text message parts", () => {
    expect(() =>
      assertTextOnlyMessages([
        {
          id: "file-message",
          parts: [{ mediaType: "text/plain", type: "file", url: "data:text/plain,hello" }],
          role: "user",
        },
      ]),
    ).toThrow("Only text messages are supported");
  });

  it("allows non-text assistant metadata already saved in history", () => {
    expect(() =>
      assertTextOnlyMessages([
        {
          id: "assistant-message",
          parts: [{ type: "step-start" }],
          role: "assistant",
        },
      ]),
    ).not.toThrow();
  });

  it("assigns storage-safe ids to empty and duplicate message ids", () => {
    const normalized = normalizeMessagesForStorage([
      { ...message, id: "" },
      { ...message, id: "duplicate" },
      { ...message, id: "duplicate" },
    ]);

    expect(normalized.map((item) => item.id).every(Boolean)).toBe(true);
    expect(new Set(normalized.map((item) => item.id)).size).toBe(3);
  });

  it("rejects input above the configured byte limit", () => {
    expect(() =>
      assertWithinModelInputLimit(
        [{ ...message, parts: [{ text: "x".repeat(101), type: "text" }] }],
        modelConfig,
      ),
    ).toThrow("too large");
  });
});
