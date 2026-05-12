export type LlmProvider = "azure-openai-responses" | "azure-foundry-chat";

export type LlmModelCapabilities = {
  chatCompletions: boolean;
  reasoning: boolean;
  responses: boolean;
  tools: boolean;
  vision: boolean;
};

export type PublicLlmModel = {
  id: string;
  displayName: string;
  provider: LlmProvider;
  capabilities: LlmModelCapabilities;
};

export type PublicLlmConfig = {
  defaultModelId: string;
  models: PublicLlmModel[];
};
