import { auth } from "#/lib/auth.ts";
import { getChatForUser, replaceChatMessages } from "#/lib/chats.ts";
import { createLanguageModel, getLlmConfig, getLlmModelConfig } from "#/lib/llm-config.ts";
import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, validateUIMessages, type UIMessage } from "ai";
import { z } from "zod";

const chatRequestSchema = z.object({
  chatId: z.string().uuid(),
  modelId: z.string().min(1).optional(),
  messages: z.unknown(),
});

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers });

        if (!session) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        const parsedBody = chatRequestSchema.safeParse(await request.json());

        if (!parsedBody.success) {
          return Response.json({ error: "Invalid chat request" }, { status: 400 });
        }

        const config = await getLlmConfig();
        const modelId = parsedBody.data.modelId ?? config.defaultModelId;
        const modelConfig = await getLlmModelConfig(modelId);

        if (!modelConfig) {
          return Response.json({ error: "Unknown model" }, { status: 400 });
        }

        const existingChat = await getChatForUser({
          chatId: parsedBody.data.chatId,
          userId: session.user.id,
        });

        if (!existingChat) {
          return Response.json({ error: "Chat not found" }, { status: 404 });
        }

        let messages: UIMessage[];

        try {
          messages = await validateUIMessages({ messages: parsedBody.data.messages });
        } catch {
          return Response.json({ error: "Invalid messages" }, { status: 400 });
        }

        const result = streamText({
          messages: await convertToModelMessages(messages),
          model: createLanguageModel(modelConfig),
        });

        return result.toUIMessageStreamResponse({
          originalMessages: messages,
          onFinish: async ({ messages: finishedMessages }) => {
            await replaceChatMessages({
              chatId: parsedBody.data.chatId,
              messages: finishedMessages,
              modelId,
              userId: session.user.id,
            });
          },
        });
      },
    },
  },
});
