"use client";

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
import { createChatFromFirstMessage, generateAndSaveChatTitle } from "#/lib/chat-functions.ts";
import { creditLimitSummaryQueryKey } from "#/lib/credit-limit-query.ts";
import type { PublicLlmConfig } from "#/lib/llm-types.ts";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { DefaultChatTransport, type UIMessage } from "ai";
import { SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const AUTO_SUBMIT_KEY_PREFIX = "ubichat:auto-submit:";

type AutoSubmitPayload = {
  modelId: string;
};

type ChatScreenProps = {
  chatId?: string;
  initialMessages?: UIMessage[];
  llmConfig: PublicLlmConfig | null;
  modelsError?: string | null;
};

function readAutoSubmitPayload(chatId: string) {
  const key = `${AUTO_SUBMIT_KEY_PREFIX}${chatId}`;
  const rawPayload = window.sessionStorage.getItem(key);

  if (!rawPayload) {
    return null;
  }

  window.sessionStorage.removeItem(key);

  try {
    return JSON.parse(rawPayload) as AutoSubmitPayload;
  } catch {
    return null;
  }
}

export function ChatScreen({
  chatId,
  initialMessages = [],
  llmConfig,
  modelsError,
}: ChatScreenProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const router = useRouter();
  const hasAutoSubmitted = useRef(false);
  const [selectedModelId, setSelectedModelId] = useState(llmConfig?.defaultModelId ?? "");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/chat" }), []);
  const { error, messages, sendMessage, status, stop } = useChat({
    id: chatId,
    messages: initialMessages,
    onFinish: () => {
      void router.invalidate();
      void queryClient.invalidateQueries({ queryKey: creditLimitSummaryQueryKey });
    },
    transport,
  });

  useEffect(() => {
    if (!chatId || hasAutoSubmitted.current || typeof window === "undefined") {
      return;
    }

    const payload = readAutoSubmitPayload(chatId);

    if (!payload) {
      return;
    }

    hasAutoSubmitted.current = true;
    void sendMessage(undefined, {
      body: {
        chatId,
        modelId: payload.modelId,
      },
    });
    void queryClient.invalidateQueries({ queryKey: creditLimitSummaryQueryKey });
    void generateAndSaveChatTitle({ data: { chatId } }).then(() => router.invalidate());
  }, [chatId, queryClient, router, sendMessage]);

  async function handleSubmit(message: PromptInputMessage) {
    const text = message.text.trim();

    setSubmitError(null);

    if (!text && message.files.length === 0) {
      return;
    }

    if (!selectedModelId) {
      return;
    }

    if (!chatId) {
      if (!text || message.files.length > 0) {
        setSubmitError("New chats currently support text-only first messages.");
        return;
      }

      setIsCreatingChat(true);

      try {
        const createdChat = await createChatFromFirstMessage({
          data: {
            modelId: selectedModelId,
            text,
          },
        });

        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            `${AUTO_SUBMIT_KEY_PREFIX}${createdChat.chatId}`,
            JSON.stringify({ modelId: createdChat.modelId } satisfies AutoSubmitPayload),
          );
        }

        await router.invalidate();
        await navigate({
          params: { chatId: createdChat.chatId },
          to: "/chats/$chatId",
        });
        await queryClient.invalidateQueries({ queryKey: creditLimitSummaryQueryKey });
      } catch (caughtError) {
        setSubmitError(
          caughtError instanceof Error ? caughtError.message : "Failed to create chat.",
        );
        throw caughtError;
      } finally {
        setIsCreatingChat(false);
      }

      return;
    }

    await sendMessage(
      {
        files: message.files,
        text,
      },
      {
        body: {
          chatId,
          modelId: selectedModelId || llmConfig?.defaultModelId,
        },
      },
    );
    await queryClient.invalidateQueries({ queryKey: creditLimitSummaryQueryKey });
  }

  const selectedModel = llmConfig?.models.find((model) => model.id === selectedModelId);
  const isSubmitDisabled = isCreatingChat || !selectedModelId || !llmConfig;
  const displayError = modelsError ?? submitError ?? error?.message;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <Conversation className="min-h-0 flex-1">
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
            {displayError && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
                <TriangleAlertIcon className="size-4 shrink-0" />
                <span>{displayError}</span>
              </div>
            )}
          </ConversationContent>
        )}
        <ConversationScrollButton />
      </Conversation>
      <div className="shrink-0 bg-background">
        <PromptInput className="mx-auto max-w-4xl" multiple onSubmit={handleSubmit}>
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
            </PromptInputTools>
            <PromptInputSubmit disabled={isSubmitDisabled} onStop={stop} status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
