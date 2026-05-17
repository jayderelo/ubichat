import { ChatScreen } from "#/components/chat-screen.tsx";
import { loadChatRouteData } from "#/lib/chat-functions.ts";
import { createFileRoute } from "@tanstack/react-router";
import type { UIMessage } from "ai";

export const Route = createFileRoute("/_authed/chats/$chatId")({
  loader: async ({ params }) => {
    return await loadChatRouteData({ data: { chatId: params.chatId } });
  },
  component: ChatRoute,
});

function ChatRoute() {
  const { chat, llmConfig, messagesJson } = Route.useLoaderData();
  const messages = JSON.parse(messagesJson) as UIMessage[];

  return (
    <ChatScreen
      chatId={chat.id}
      initialMessages={messages}
      initialModelId={chat.modelId}
      llmConfig={llmConfig}
    />
  );
}
