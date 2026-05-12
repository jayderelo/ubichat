import { describe, expect, it } from "vitest";
import { parseLlmConfig } from "#/lib/llm-config.ts";

const validConfig = {
  defaultModelId: "gpt-5.4-mini",
  models: [
    {
      id: "gpt-5.4-mini",
      displayName: "GPT-5.4 Mini",
      provider: "azure-openai-responses",
      baseURL: "https://example.openai.azure.com/openai",
      apiVersion: "2025-04-01-preview",
      model: "gpt-5.4-mini",
      capabilities: {
        chatCompletions: false,
        reasoning: true,
        responses: true,
        tools: true,
        vision: false,
      },
    },
    {
      id: "kimi-k2.6",
      displayName: "Kimi K2.6",
      provider: "azure-foundry-chat",
      baseURL: "https://example.services.ai.azure.com/models",
      apiVersion: "2024-05-01-preview",
      model: "Kimi-K2.6",
      capabilities: {
        chatCompletions: true,
        reasoning: false,
        responses: false,
        tools: false,
        vision: false,
      },
    },
  ],
};

describe("parseLlmConfig", () => {
  it("accepts a valid model registry", () => {
    expect(parseLlmConfig(validConfig).defaultModelId).toBe("gpt-5.4-mini");
  });

  it("rejects an unknown default model id", () => {
    expect(() =>
      parseLlmConfig({
        ...validConfig,
        defaultModelId: "missing-model",
      }),
    ).toThrow("defaultModelId must match a configured model id");
  });

  it("rejects duplicate model ids", () => {
    expect(() =>
      parseLlmConfig({
        ...validConfig,
        models: [validConfig.models[0], validConfig.models[0]],
      }),
    ).toThrow("Duplicate model id");
  });

  it("rejects unsupported providers", () => {
    expect(() =>
      parseLlmConfig({
        ...validConfig,
        models: [
          {
            ...validConfig.models[0],
            provider: "unsupported-provider",
          },
        ],
      }),
    ).toThrow();
  });
});
