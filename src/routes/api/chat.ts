import { auth } from "#/lib/auth.ts";
import { getChatForUser, replaceChatMessages } from "#/lib/chats.ts";
import { createChatApiHandler } from "#/lib/chat-api.core.ts";
import { createLanguageModel, getLlmConfig, getLlmModelConfig } from "#/lib/llm-config.ts";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, validateUIMessages } from "ai";

const handleChatPost = createChatApiHandler({
  authGetSession: (headers) => auth.api.getSession({ headers }),
  convertToModelMessages,
  createLanguageModel,
  getChatForUser,
  getLlmConfig,
  getLlmModelConfig,
  replaceChatMessages,
  streamText,
  validateUIMessages,
});

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: ({ request }) => handleChatPost(request),
    },
  },
});
