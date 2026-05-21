import type { LanguageModel } from "ai";
import { createAzure } from "@ai-sdk/azure";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { PublicLlmConfig } from "#/lib/llm-types.ts";

const providerOptionsSchema = z.record(z.string(), z.record(z.string(), z.json()));

const capabilitySchema = z.object({
  chatCompletions: z.boolean(),
  reasoning: z.boolean(),
  responses: z.boolean(),
  tools: z.boolean(),
  vision: z.boolean(),
});

const reasoningModeSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  consumesReasoningTokens: z.boolean().optional(),
  providerOptions: providerOptionsSchema.optional(),
});

const reasoningConfigSchema = z.object({
  defaultModeId: z.string().min(1),
  modes: z.array(reasoningModeSchema).min(1),
});

const usageConfigSchema = z.object({
  cacheReadCreditWeight: z.number().positive(),
  cacheWriteCreditWeight: z.number().positive(),
  inputCreditWeight: z.number().positive(),
  maxInputBytes: z.number().int().positive(),
  maxOutputTokens: z.number().int().positive(),
  outputCreditWeight: z.number().positive(),
  reasoningCreditWeight: z.number().positive(),
  reserveMultiplier: z.number().positive().default(1),
});

const modelConfigSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  lab: z.string().min(1),
  provider: z.enum(["azure-openai-responses", "azure-foundry-chat"]),
  baseURL: z.string().url(),
  apiVersion: z.string().min(1),
  model: z.string().min(1),
  capabilities: capabilitySchema,
  reasoning: reasoningConfigSchema.optional(),
  usage: usageConfigSchema,
});

const llmConfigSchema = z
  .object({
    defaultModelId: z.string().min(1),
    titleModelId: z.string().min(1),
    models: z.array(modelConfigSchema).min(1),
  })
  .superRefine((config, ctx) => {
    const ids = new Set<string>();

    for (const model of config.models) {
      if (ids.has(model.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate model id: ${model.id}`,
          path: ["models"],
        });
      }
      ids.add(model.id);

      if (model.capabilities.reasoning && !model.reasoning) {
        ctx.addIssue({
          code: "custom",
          message: `Reasoning model ${model.id} must define reasoning modes`,
          path: ["models"],
        });
      }

      if (!model.capabilities.reasoning && model.reasoning) {
        ctx.addIssue({
          code: "custom",
          message: `Non-reasoning model ${model.id} cannot define reasoning modes`,
          path: ["models"],
        });
      }

      if (model.reasoning) {
        const modeIds = new Set<string>();

        for (const mode of model.reasoning.modes) {
          if (modeIds.has(mode.id)) {
            ctx.addIssue({
              code: "custom",
              message: `Duplicate reasoning mode id: ${mode.id}`,
              path: ["models"],
            });
          }
          modeIds.add(mode.id);
        }

        if (!modeIds.has(model.reasoning.defaultModeId)) {
          ctx.addIssue({
            code: "custom",
            message: `defaultModeId must match a configured reasoning mode for ${model.id}`,
            path: ["models"],
          });
        }
      }
    }

    if (!ids.has(config.defaultModelId)) {
      ctx.addIssue({
        code: "custom",
        message: "defaultModelId must match a configured model id",
        path: ["defaultModelId"],
      });
    }

    if (!ids.has(config.titleModelId)) {
      ctx.addIssue({
        code: "custom",
        message: "titleModelId must match a configured model id",
        path: ["titleModelId"],
      });
    }
  });

type LlmConfig = z.infer<typeof llmConfigSchema>;
type LlmModelConfig = LlmConfig["models"][number];

let cachedConfig: LlmConfig | undefined;

export function parseLlmConfig(input: unknown) {
  return llmConfigSchema.parse(input);
}

async function readLlmConfig() {
  const path = join(process.cwd(), "llm.config.json");
  const file = await readFile(path, "utf8");
  return parseLlmConfig(JSON.parse(file));
}

export async function getLlmConfig() {
  cachedConfig ??= await readLlmConfig();
  return cachedConfig;
}

export async function getPublicLlmConfig(): Promise<PublicLlmConfig> {
  const config = await getLlmConfig();

  return {
    defaultModelId: config.defaultModelId,
    models: config.models.map(({ id, displayName, lab, provider, capabilities }) => ({
      capabilities,
      displayName,
      id,
      lab,
      provider,
          reasoning: config.models.find((model) => model.id === id)?.reasoning
        ? {
            defaultModeId: config.models.find((model) => model.id === id)!.reasoning!
              .defaultModeId,
            modes: config.models
              .find((model) => model.id === id)!
              .reasoning!.modes.map(({ id: modeId, label }) => ({ id: modeId, label })),
          }
        : undefined,
    })),
  };
}

export async function getLlmModelConfig(modelId: string) {
  const config = await getLlmConfig();
  return config.models.find((model) => model.id === modelId);
}

export async function getTitleLlmModelConfig() {
  const config = await getLlmConfig();
  return config.models.find((model) => model.id === config.titleModelId);
}

export function getReasoningModeConfig(
  modelConfig: LlmModelConfig,
  reasoningModeId?: string | null,
) {
  if (!modelConfig.reasoning) {
    return undefined;
  }

  const modeId = reasoningModeId ?? modelConfig.reasoning.defaultModeId;
  return modelConfig.reasoning.modes.find((mode) => mode.id === modeId);
}

function getAzureFoundryKey() {
  const apiKey = process.env.AZURE_FOUNDRY_KEY;

  if (!apiKey) {
    throw new Error("AZURE_FOUNDRY_KEY is required to call configured LLM providers.");
  }

  return apiKey;
}

export function createLanguageModel(config: LlmModelConfig): LanguageModel {
  const apiKey = getAzureFoundryKey();

  if (config.provider === "azure-openai-responses") {
    const azure = createAzure({
      apiKey,
      apiVersion: config.apiVersion,
      baseURL: config.baseURL,
      fetch: (input, init) => {
        const url =
          input instanceof Request
            ? new URL(input.url)
            : input instanceof URL
              ? input
              : new URL(input);

        if (url.pathname.endsWith("/openai/v1/responses")) {
          url.pathname = url.pathname.replace("/openai/v1/responses", "/openai/responses");
        }

        return fetch(url, init);
      },
    });

    return azure.responses(config.model);
  }

  const foundry = createOpenAICompatible({
    baseURL: config.baseURL,
    headers: { "api-key": apiKey },
    name: "azure-foundry",
    queryParams: { "api-version": config.apiVersion },
    supportsStructuredOutputs: true,
  });

  return foundry.chatModel(config.model);
}

export type { LlmConfig, LlmModelConfig };
