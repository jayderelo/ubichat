import { Output, generateText, type UIMessage } from "ai";
import { z } from "zod";
import { createLanguageModel, getTitleLlmModelConfig } from "#/lib/llm-config.ts";

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
    ? `${normalized.slice(0, MAX_TITLE_LENGTH - 3).trimEnd()}...`
    : normalized;
}

function getTextFromMessage(message: UIMessage) {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export async function generateChatTitle(message: UIMessage) {
  const fallbackTitle = createFallbackChatTitle(getTextFromMessage(message));
  const modelConfig = await getTitleLlmModelConfig();

  if (!modelConfig) {
    return fallbackTitle;
  }

  const { output } = await generateText({
    model: createLanguageModel(modelConfig),
    output: Output.object({
      description: "A concise title for a saved chat conversation.",
      name: "chat_title",
      schema: titleSchema,
    }),
    prompt: [
      "Create a short, plain-language title for this chat.",
      "Return no markdown, no quotes, and no ending punctuation unless necessary.",
      "The title must be at most 80 characters.",
      "",
      "First user message:",
      getTextFromMessage(message),
    ].join("\n"),
  });

  return createFallbackChatTitle(output.title) || fallbackTitle;
}
