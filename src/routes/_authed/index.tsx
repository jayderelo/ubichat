import { ChatScreen } from "#/components/chat-screen.tsx";
import { getPublicLlmConfig } from "#/lib/llm-config.ts";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";

const loadPublicLlmConfig = createServerFn({ method: "GET" }).handler(async () => {
  return await getPublicLlmConfig();
});

export const Route = createFileRoute("/_authed/")({
  loader: async () => {
    try {
      return {
        llmConfig: await loadPublicLlmConfig(),
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
