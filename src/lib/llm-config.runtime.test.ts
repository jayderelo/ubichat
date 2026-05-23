import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LlmConfig } from "#/lib/llm-config.ts";

const mocks = vi.hoisted(() => {
  const responses = vi.fn((model: string) => ({ model, provider: "azure-responses" }));
  const chatModel = vi.fn((model: string) => ({ model, provider: "azure-foundry" }));
  const messages = vi.fn((model: string) => ({ model, provider: "azure-foundry-anthropic" }));

  return {
    chatModel,
    createAnthropic: vi.fn((_config: unknown) => ({ messages })),
    createAzure: vi.fn(
      (_config: {
        fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
      }) => ({ responses }),
    ),
    createOpenAICompatible: vi.fn((_config: unknown) => ({ chatModel })),
    messages,
    readFile: vi.fn(),
    responses,
  };
});

vi.mock("node:fs/promises", () => ({
  default: { readFile: mocks.readFile },
  readFile: mocks.readFile,
}));
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: mocks.createAnthropic }));
vi.mock("@ai-sdk/azure", () => ({ createAzure: mocks.createAzure }));
vi.mock("@ai-sdk/openai-compatible", () => ({
  createOpenAICompatible: mocks.createOpenAICompatible,
}));

const validConfig = {
  defaultModelId: "gpt-5.4-mini",
  titleModelId: "deepseek-v4-flash",
  models: [
    {
      apiVersion: "2025-04-01-preview",
      baseURL: "https://example.openai.azure.com/openai",
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
      displayName: "GPT-5.4 Mini",
      id: "gpt-5.4-mini",
      lab: "openai",
      model: "gpt-5.4-mini",
      provider: "azure-openai-responses",
      usage: {
        cacheReadCreditWeight: 0.25,
        cacheWriteCreditWeight: 1,
        inputCreditWeight: 1,
        maxInputBytes: 131_072,
        maxOutputTokens: 4096,
        outputCreditWeight: 2,
        reasoningCreditWeight: 2,
        reserveMultiplier: 1,
      },
    },
    {
      apiVersion: "2023-06-01",
      baseURL: "https://example.services.ai.azure.com/anthropic/v1",
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
      displayName: "Claude Haiku 4.5",
      id: "claude-haiku-4-5",
      lab: "anthropic",
      model: "claude-haiku-4-5",
      provider: "azure-foundry-anthropic",
      usage: {
        cacheReadCreditWeight: 0.1,
        cacheWriteCreditWeight: 1.25,
        inputCreditWeight: 1,
        maxInputBytes: 600_000,
        maxOutputTokens: 4096,
        outputCreditWeight: 5,
        reasoningCreditWeight: 5,
        reserveMultiplier: 1,
      },
    },
    {
      apiVersion: "2024-05-01-preview",
      baseURL: "https://example.services.ai.azure.com/models",
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
      displayName: "DeepSeek V4 Flash",
      id: "deepseek-v4-flash",
      lab: "deepseek",
      model: "DeepSeek-V4-Flash",
      provider: "azure-foundry-chat",
      usage: {
        cacheReadCreditWeight: 0.25,
        cacheWriteCreditWeight: 1,
        inputCreditWeight: 1,
        maxInputBytes: 131_072,
        maxOutputTokens: 4096,
        outputCreditWeight: 2,
        reasoningCreditWeight: 2,
        reserveMultiplier: 1,
      },
    },
  ],
} satisfies LlmConfig;

describe("llm config runtime helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mocks.readFile.mockReset();
    mocks.responses.mockClear();
    mocks.chatModel.mockClear();
    mocks.messages.mockClear();
    mocks.createAzure.mockClear();
    mocks.createAnthropic.mockClear();
    mocks.createOpenAICompatible.mockClear();
  });

  it("reads config once and redacts provider credentials from public config", async () => {
    mocks.readFile.mockResolvedValue(JSON.stringify(validConfig));
    const { getLlmConfig, getPublicLlmConfig } = await import("#/lib/llm-config.ts");

    await expect(getLlmConfig()).resolves.toEqual(validConfig);
    await expect(getPublicLlmConfig()).resolves.toEqual({
      defaultModelId: "gpt-5.4-mini",
      models: [
        {
          capabilities: validConfig.models[0].capabilities,
          displayName: "GPT-5.4 Mini",
          id: "gpt-5.4-mini",
          lab: "openai",
          provider: "azure-openai-responses",
          reasoning: {
            defaultModeId: "medium",
            modes: [{ id: "medium", label: "Medium" }],
          },
        },
        {
          capabilities: validConfig.models[1].capabilities,
          displayName: "Claude Haiku 4.5",
          id: "claude-haiku-4-5",
          lab: "anthropic",
          provider: "azure-foundry-anthropic",
          reasoning: {
            defaultModeId: "thinking-1k",
            modes: [{ id: "thinking-1k", label: "Thinking 1K" }],
          },
        },
        {
          capabilities: validConfig.models[2].capabilities,
          displayName: "DeepSeek V4 Flash",
          id: "deepseek-v4-flash",
          lab: "deepseek",
          provider: "azure-foundry-chat",
          reasoning: {
            defaultModeId: "high",
            modes: [{ id: "high", label: "High" }],
          },
        },
      ],
    });
    expect(mocks.readFile).toHaveBeenCalledTimes(1);
  });

  it("looks up configured chat and title models", async () => {
    mocks.readFile.mockResolvedValue(JSON.stringify(validConfig));
    const { getLlmModelConfig, getTitleLlmModelConfig } = await import("#/lib/llm-config.ts");

    await expect(getLlmModelConfig("deepseek-v4-flash")).resolves.toMatchObject({
      model: "DeepSeek-V4-Flash",
    });
    await expect(getLlmModelConfig("missing")).resolves.toBeUndefined();
    await expect(getTitleLlmModelConfig()).resolves.toMatchObject({
      id: "deepseek-v4-flash",
    });
  });

  it("requires an Azure Foundry key before constructing providers", async () => {
    const { createLanguageModel } = await import("#/lib/llm-config.ts");

    expect(() => createLanguageModel(validConfig.models[0])).toThrow("AZURE_FOUNDRY_KEY");
  });

  it("constructs Azure responses models and rewrites responses URLs", async () => {
    vi.stubEnv("AZURE_FOUNDRY_KEY", "test-key");
    const { createLanguageModel } = await import("#/lib/llm-config.ts");

    expect(createLanguageModel(validConfig.models[0])).toEqual({
      model: "gpt-5.4-mini",
      provider: "azure-responses",
    });
    expect(mocks.createAzure).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "test-key",
        apiVersion: "2025-04-01-preview",
        baseURL: "https://example.openai.azure.com/openai",
      }),
    );

    const fetchOverride = mocks.createAzure.mock.calls[0]?.[0].fetch;
    expect(fetchOverride).toBeDefined();
    if (!fetchOverride) {
      throw new Error("Expected Azure fetch override to be configured.");
    }
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok"));
    await fetchOverride("https://example.openai.azure.com/openai/v1/responses");
    expect(fetchSpy.mock.calls[0]?.[0].toString()).toBe(
      "https://example.openai.azure.com/openai/responses",
    );
    fetchSpy.mockRestore();
  });

  it("constructs Azure Foundry chat models with api-key headers", async () => {
    vi.stubEnv("AZURE_FOUNDRY_KEY", "test-key");
    const { createLanguageModel } = await import("#/lib/llm-config.ts");

    expect(createLanguageModel(validConfig.models[2])).toEqual({
      model: "DeepSeek-V4-Flash",
      provider: "azure-foundry",
    });
    expect(mocks.createOpenAICompatible).toHaveBeenCalledWith({
      baseURL: "https://example.services.ai.azure.com/models",
      headers: { "api-key": "test-key" },
      name: "azure-foundry",
      queryParams: { "api-version": "2024-05-01-preview" },
      supportsStructuredOutputs: true,
    });
  });

  it("constructs Azure Foundry Anthropic messages models with Anthropic-compatible base URL", async () => {
    vi.stubEnv("AZURE_FOUNDRY_KEY", "test-key");
    const { createLanguageModel } = await import("#/lib/llm-config.ts");

    expect(createLanguageModel(validConfig.models[1])).toEqual({
      model: "claude-haiku-4-5",
      provider: "azure-foundry-anthropic",
    });
    expect(mocks.createAnthropic).toHaveBeenCalledWith({
      apiKey: "test-key",
      baseURL: "https://example.services.ai.azure.com/anthropic/v1",
      name: "azure-foundry-anthropic",
    });
  });
});
