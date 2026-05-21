import { notFound } from "@tanstack/react-router";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { generateId } from "ai";
import { createChatActionsCore, type SessionLike } from "#/lib/chat-actions.core.ts";
import { auth } from "#/lib/auth.ts";
import { generateChatTitle } from "#/lib/chat-title.ts";
import {
  createChatWithInitialMessage,
  deleteChat,
  getChatForUser,
  getLatestUserMessageSelection,
  listArchivedChatsByUser,
  listChatMessages,
  listChatsByUser,
  updateChat,
} from "#/lib/chats.ts";
import { getLlmConfig, getLlmModelConfig, getPublicLlmConfig } from "#/lib/llm-config.ts";
import { getUserModelSettings, upsertUserModelSettings } from "#/lib/user-settings.ts";

export async function requireSession(): Promise<SessionLike> {
  const session = await auth.api.getSession({
    headers: getRequestHeaders(),
  });

  if (!session) {
    throw new Error("Unauthorized");
  }

  return session;
}

export const chatActions = createChatActionsCore({
  createChatWithInitialMessage,
  generateChatTitle,
  generateId,
  getChatForUser,
  getLatestUserMessageSelection,
  getLlmConfig,
  getLlmModelConfig,
  getPublicLlmConfig,
  getUserModelSettings,
  deleteChat,
  listChatMessages,
  listArchivedChatsByUser,
  listChatsByUser,
  notFound,
  requireSession,
  upsertUserModelSettings,
  updateChat,
});
