import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "#/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "#/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSelect,
  PromptInputSelectContent,
  PromptInputSelectItem,
  PromptInputSelectTrigger,
  PromptInputSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "#/components/ai-elements/prompt-input";
import { getPublicLlmConfig } from "#/lib/llm-config.ts";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { PaperclipIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { useState } from "react";

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
  const [selectedModelId, setSelectedModelId] = useState(llmConfig?.defaultModelId ?? "");
  const { error, messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  async function handleSubmit(message: PromptInputMessage) {
    const text = message.text.trim();

    if (!text && message.files.length === 0) {
      return;
    }

    await sendMessage(
      {
        files: message.files,
        text,
      },
      {
        body: {
          modelId: selectedModelId || llmConfig?.defaultModelId,
        },
      },
    );
  }

  const selectedModel = llmConfig?.models.find((model) => model.id === selectedModelId);
  const isSubmitDisabled = status === "submitted" || status === "streaming" || !selectedModelId;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0">
        {messages.length === 0 ? (
          <ConversationEmptyState
            description={modelsError ?? "Start a conversation from the prompt below."}
            icon={
              modelsError ? (
                <TriangleAlertIcon className="size-6" />
              ) : (
                <SparklesIcon className="size-6" />
              )
            }
            title={modelsError ? "Model configuration unavailable" : "Ready to chat"}
          />
        ) : (
          <ConversationContent className="mx-auto w-full max-w-3xl px-4 py-6">
            {messages.map((message) => (
              <Message from={message.role} key={message.id}>
                <MessageContent>
                  {message.parts.map((part, index) => {
                    if (part.type === "text") {
                      return (
                        <MessageResponse key={`${message.id}-${index}`}>
                          {part.text}
                        </MessageResponse>
                      );
                    }

                    return null;
                  })}
                </MessageContent>
              </Message>
            ))}
            {(error || modelsError) && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
                <TriangleAlertIcon className="size-4 shrink-0" />
                <span>{modelsError ?? error?.message}</span>
              </div>
            )}
          </ConversationContent>
        )}
        <ConversationScrollButton />
      </Conversation>
      <div className="border-t bg-background p-4">
        <PromptInput className="mx-auto max-w-3xl" multiple onSubmit={handleSubmit}>
          <PromptInputBody>
            <PromptInputTextarea placeholder="Ask anything..." />
          </PromptInputBody>
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputSelect
                disabled={!llmConfig}
                onValueChange={setSelectedModelId}
                value={selectedModelId}
              >
                <PromptInputSelectTrigger className="h-8 max-w-48">
                  <PromptInputSelectValue placeholder="Select model">
                    {selectedModel?.displayName}
                  </PromptInputSelectValue>
                </PromptInputSelectTrigger>
                <PromptInputSelectContent>
                  {llmConfig?.models.map((model) => (
                    <PromptInputSelectItem key={model.id} value={model.id}>
                      {model.displayName}
                    </PromptInputSelectItem>
                  ))}
                </PromptInputSelectContent>
              </PromptInputSelect>
              <PromptInputButton disabled tooltip="Attachments coming soon">
                <PaperclipIcon className="size-4" />
              </PromptInputButton>
            </PromptInputTools>
            <PromptInputSubmit disabled={isSubmitDisabled} onStop={stop} status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
