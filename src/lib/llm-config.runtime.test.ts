import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const responses = vi.fn((model: string) => ({ model, provider: "azure-responses" }));
  const chatModel = vi.fn((model: string) => ({ model, provider: "azure-foundry" }));

  return {
    chatModel,
    createAzure: vi.fn(
      (_config: {
        fetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
      }) => ({ responses }),
    ),
    createOpenAICompatible: vi.fn((_config: unknown) => ({ chatModel })),
    readFile: vi.fn(),
    responses,
  };
});

vi.mock("node:fs/promises", () => ({
  default: { readFile: mocks.readFile },
  readFile: mocks.readFile,
}));
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
      displayName: "GPT-5.4 Mini",
      id: "gpt-5.4-mini",
      model: "gpt-5.4-mini",
      provider: "azure-openai-responses",
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
      displayName: "DeepSeek V4 Flash",
      id: "deepseek-v4-flash",
      model: "DeepSeek-V4-Flash",
      provider: "azure-foundry-chat",
    },
  ],
} as const;

describe("llm config runtime helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    mocks.readFile.mockReset();
    mocks.responses.mockClear();
    mocks.chatModel.mockClear();
    mocks.createAzure.mockClear();
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
          provider: "azure-openai-responses",
        },
        {
          capabilities: validConfig.models[1].capabilities,
          displayName: "DeepSeek V4 Flash",
          id: "deepseek-v4-flash",
          provider: "azure-foundry-chat",
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

    expect(createLanguageModel(validConfig.models[1])).toEqual({
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
});
