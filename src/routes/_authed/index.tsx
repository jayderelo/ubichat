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
import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { PublicLlmConfig } from "#/lib/llm-types.ts";
import { PaperclipIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authed/")({ component: Home });

function Home() {
  const [llmConfig, setLlmConfig] = useState<PublicLlmConfig | null>(null);
  const [selectedModelId, setSelectedModelId] = useState("");
  const [modelsError, setModelsError] = useState<string | null>(null);
  const { error, messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  useEffect(() => {
    let ignore = false;

    async function loadModels() {
      try {
        const response = await fetch("/api/llm-models");

        if (!response.ok) {
          throw new Error(await response.text());
        }

        const nextConfig = (await response.json()) as PublicLlmConfig;

        if (!ignore) {
          setLlmConfig(nextConfig);
          setSelectedModelId((current) => current || nextConfig.defaultModelId);
        }
      } catch {
        if (!ignore) {
          setModelsError("Model configuration could not be loaded.");
        }
      }
    }

    void loadModels();

    return () => {
      ignore = true;
    };
  }, []);

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
