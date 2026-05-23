export type LlmProvider =
  | "azure-openai-responses"
  | "azure-foundry-anthropic"
  | "azure-foundry-chat";

export type LlmModelCapabilities = {
  chatCompletions: boolean;
  reasoning: boolean;
  responses: boolean;
  tools: boolean;
  vision: boolean;
};

export type PublicReasoningMode = {
  id: string;
  label: string;
};

export type PublicLlmModel = {
  id: string;
  displayName: string;
  lab: string;
  provider: LlmProvider;
  capabilities: LlmModelCapabilities;
  reasoning?: {
    defaultModeId: string;
    modes: PublicReasoningMode[];
  };
};

export type PublicLlmConfig = {
  defaultModelId: string;
  models: PublicLlmModel[];
  userSettings?: {
    reasoningPreferences: Record<string, string>;
    selectedModelId: string | null;
  };
};
