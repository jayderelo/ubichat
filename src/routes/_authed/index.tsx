import { ChatScreen } from "#/components/chat-screen.tsx";
import { loadNewChatRouteData } from "#/lib/chat-functions.ts";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/")({
  loader: async () => {
    try {
      return {
        ...(await loadNewChatRouteData()),
        modelsError: null,
      };
    } catch {
      return {
        llmConfig: null,
        modelsError: "Model configuration could not be loaded.",
      };
    }
  },
  component: Home,
});

function Home() {
  const { llmConfig, modelsError } = Route.useLoaderData();

  return <ChatScreen llmConfig={llmConfig} modelsError={modelsError} />;
}
