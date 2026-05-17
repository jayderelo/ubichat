import { Output, generateText, type UIMessage } from "ai";
import { z } from "zod";
import { createLanguageModel, getTitleLlmModelConfig } from "#/lib/llm-config.ts";
import {
  chargeReservedUsage,
  estimateInputTokens,
  finalizeUsageWithModel,
  markProviderStarted,
  releaseUsage,
  reserveUsage,
} from "#/lib/usage.ts";

const MAX_TITLE_LENGTH = 80;

const titleSchema = z.object({
  title: z.string().min(1).max(MAX_TITLE_LENGTH),
});

export function createFallbackChatTitle(text: string) {
  const normalized = text.replaceAll(/\s+/g, " ").trim();

  if (!normalized) {
    return "New chat";
  }

  return normalized.length > MAX_TITLE_LENGTH
    ? `${normalized.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}...`
    : normalized;
}

function getTextFromMessage(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export async function generateChatTitle({
  chatId,
  message,
  userId,
}: {
  chatId: string;
  message: UIMessage;
  userId: string;
}) {
  const fallbackTitle = createFallbackChatTitle(getTextFromMessage(message));
  const modelConfig = await getTitleLlmModelConfig();

  if (!modelConfig) {
    return fallbackTitle;
  }

  const titleModelConfig = {
    ...modelConfig,
    usage: {
      ...modelConfig.usage,
      maxOutputTokens: Math.min(modelConfig.usage.maxOutputTokens, 64),
    },
  };
  const prompt = [
    "Create a short, plain-language title for this chat.",
    "Return no markdown, no quotes, and no ending punctuation unless necessary.",
    "The title must be at most 80 characters.",
    "",
    "First user message:",
    getTextFromMessage(message),
  ].join("\n");
  const reservation = await reserveUsage({
    chatId,
    estimatedInputTokens: estimateInputTokens([
      {
        id: message.id,
        parts: [{ text: prompt, type: "text" }],
        role: "user",
      },
    ]),
    kind: "title",
    modelConfig: titleModelConfig,
    userId,
  });

  if (!reservation.ok) {
    return fallbackTitle;
  }

  let providerStarted = false;

  try {
    const languageModel = createLanguageModel(titleModelConfig);

    await markProviderStarted(reservation.call.id);
    providerStarted = true;

    const { finishReason, output, usage } = await generateText({
      maxOutputTokens: titleModelConfig.usage.maxOutputTokens,
      maxRetries: 0,
      model: languageModel,
      output: Output.object({
        description: "A concise title for a saved chat conversation.",
        name: "chat_title",
        schema: titleSchema,
      }),
      prompt,
    });

    await finalizeUsageWithModel({
      callId: reservation.call.id,
      finishReason,
      modelConfig: titleModelConfig,
      usage,
    });

    return createFallbackChatTitle(output.title) || fallbackTitle;
  } catch (caughtError) {
    if (providerStarted) {
      await chargeReservedUsage({
        callId: reservation.call.id,
        error: caughtError instanceof Error ? caughtError.message : "Title generation failed.",
      });
    } else {
      await releaseUsage({
        callId: reservation.call.id,
        error: caughtError instanceof Error ? caughtError.message : "Title generation failed.",
      });
    }

    return fallbackTitle;
  }
}
