import { describe, expect, it } from "vitest";
import { createPublicReasoningConfig, parseLlmConfig } from "#/lib/llm-config.ts";

const usage = {
  cacheReadCreditWeight: 0.25,
  cacheWriteCreditWeight: 1,
  inputCreditWeight: 1,
  maxInputBytes: 131_072,
  maxOutputTokens: 4096,
  outputCreditWeight: 2,
  reasoningCreditWeight: 2,
  reserveMultiplier: 1,
};

const validConfig = {
  defaultModelId: "gpt-5.4-mini",
  titleModelId: "deepseek-v4-flash",
  models: [
    {
      id: "gpt-5.4-mini",
      displayName: "GPT-5.4 Mini",
      lab: "openai",
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
      reasoning: {
        defaultModeId: "medium",
        modes: [{ consumesReasoningTokens: true, id: "medium", label: "Medium" }],
      },
      usage,
    },
    {
      id: "kimi-k2.6",
      displayName: "Kimi K2.6",
      lab: "moonshotai",
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
      usage,
    },
    {
      id: "claude-haiku-4-5",
      displayName: "Claude Haiku 4.5",
      lab: "anthropic",
      provider: "azure-foundry-anthropic",
      baseURL: "https://example.services.ai.azure.com/anthropic/v1",
      apiVersion: "2023-06-01",
      model: "claude-haiku-4-5",
      capabilities: {
        chatCompletions: true,
        reasoning: true,
        responses: false,
        tools: false,
        vision: false,
      },
      reasoning: {
        defaultModeId: "thinking-1k",
        modes: [
          {
            id: "thinking-1k",
            label: "Thinking 1K",
            providerOptions: {
              anthropic: {
                thinking: {
                  type: "enabled",
                  budgetTokens: 1024,
                },
              },
            },
            reserveReasoningTokens: 1024,
          },
        ],
      },
      usage,
    },
    {
      id: "deepseek-v4-flash",
      displayName: "DeepSeek V4 Flash",
      lab: "deepseek",
      provider: "azure-foundry-chat",
      baseURL: "https://example.services.ai.azure.com/models",
      apiVersion: "2024-05-01-preview",
      model: "DeepSeek-V4-Flash",
      capabilities: {
        chatCompletions: true,
        reasoning: true,
        responses: false,
        tools: false,
        vision: false,
      },
      reasoning: {
        defaultModeId: "high",
        modes: [{ consumesReasoningTokens: true, id: "high", label: "High" }],
      },
      usage,
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

  it("rejects an unknown title model id", () => {
    expect(() =>
      parseLlmConfig({
        ...validConfig,
        titleModelId: "missing-model",
      }),
    ).toThrow("titleModelId must match a configured model id");
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

  it("rejects models without usage limits", () => {
    const { usage: _usage, ...modelWithoutUsage } = validConfig.models[0];

    expect(() =>
      parseLlmConfig({
        ...validConfig,
        models: [modelWithoutUsage],
      }),
    ).toThrow();
  });

  it("rejects invalid usage limits", () => {
    expect(() =>
      parseLlmConfig({
        ...validConfig,
        models: [
          {
            ...validConfig.models[0],
            usage: {
              ...usage,
              maxOutputTokens: 0,
            },
          },
        ],
      }),
    ).toThrow();
  });
});

describe("createPublicReasoningConfig", () => {
  function publicReasoningFor(reasoning: unknown) {
    const [model] = parseLlmConfig({
      ...validConfig,
      models: [
        {
          ...validConfig.models[0],
          reasoning,
        },
      ],
      titleModelId: validConfig.models[0].id,
    }).models;

    if (!model.reasoning) {
      throw new Error("Expected reasoning config.");
    }

    return createPublicReasoningConfig(model.reasoning);
  }

  it("keeps low, medium, and high as canonical public labels", () => {
    expect(
      publicReasoningFor({
        defaultModeId: "high",
        modes: [
          { id: "low", label: "Provider low" },
          { id: "medium", label: "Provider medium" },
          { id: "high", label: "Provider high" },
        ],
      }),
    ).toEqual({
      defaultModeId: "high",
      modes: [
        { id: "low", label: "Low" },
        { id: "medium", label: "Medium" },
        { id: "high", label: "High" },
      ],
    });
  });

  it("maps off plus ordered thinking budgets to low, medium, and high", () => {
    expect(
      publicReasoningFor({
        defaultModeId: "off",
        modes: [
          {
            consumesReasoningTokens: false,
            id: "off",
            label: "Thinking off",
          },
          { id: "thinking-1k", label: "Thinking 1K" },
          { id: "thinking-2k", label: "Thinking 2K" },
          { id: "thinking-3k", label: "Thinking 3K" },
        ],
      }),
    ).toEqual({
      defaultModeId: "thinking-3k",
      modes: [
        { id: "thinking-1k", label: "Low" },
        { id: "thinking-2k", label: "Medium" },
        { id: "thinking-3k", label: "High" },
      ],
    });
  });

  it("maps on and off only models to low and high", () => {
    expect(
      publicReasoningFor({
        defaultModeId: "on",
        modes: [
          { id: "on", label: "Thinking on" },
          {
            consumesReasoningTokens: false,
            id: "off",
            label: "Thinking off",
          },
        ],
      }),
    ).toEqual({
      defaultModeId: "on",
      modes: [
        { id: "off", label: "Low" },
        { id: "on", label: "High" },
      ],
    });
  });

  it("maps non-think plus two stronger modes to low, medium, and high", () => {
    expect(
      publicReasoningFor({
        defaultModeId: "max",
        modes: [
          {
            consumesReasoningTokens: false,
            id: "non-think",
            label: "Non-think",
          },
          { id: "high", label: "High" },
          { id: "max", label: "Max" },
        ],
      }),
    ).toEqual({
      defaultModeId: "max",
      modes: [
        { id: "non-think", label: "Low" },
        { id: "high", label: "Medium" },
        { id: "max", label: "High" },
      ],
    });
  });
});
