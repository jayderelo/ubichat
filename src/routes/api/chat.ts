import { auth } from "#/lib/auth.ts";
import { getChatForUser, listChatMessages } from "#/lib/chats.ts";
import { createChatApiHandler } from "#/lib/chat-api.core.ts";
import { createLanguageModel, getLlmConfig, getLlmModelConfig } from "#/lib/llm-config.ts";
import {
  assertTextOnlyMessages,
  assertWithinModelInputLimit,
  chargeReservedUsage,
  estimateInputTokens,
  finalizeChatUsageAndMessages,
  markProviderStarted,
  releaseUsage,
  reserveUsage,
} from "#/lib/usage.ts";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, validateUIMessages } from "ai";
import { upsertUserModelSettings } from "#/lib/user-settings.ts";

const handleChatPost = createChatApiHandler({
  assertTextOnlyMessages,
  assertWithinModelInputLimit,
  authGetSession: (headers) => auth.api.getSession({ headers }),
  chargeReservedUsage,
  convertToModelMessages,
  createLanguageModel,
  estimateInputTokens,
  finalizeChatUsageAndMessages,
  getChatForUser,
  getLlmConfig,
  getLlmModelConfig,
  listChatMessages,
  markProviderStarted,
  releaseUsage,
  reserveUsage,
  streamText,
  upsertUserModelSettings,
  validateUIMessages,
});

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: ({ request }) => handleChatPost(request),
    },
  },
});
