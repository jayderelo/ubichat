"use client";

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "#/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "#/components/ai-elements/message";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "#/components/ai-elements/model-selector";
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
import { Reasoning, ReasoningContent, ReasoningTrigger } from "#/components/ai-elements/reasoning";
import { Button } from "#/components/ui/button.tsx";
import {
  createChatFromFirstMessage,
  generateAndSaveChatTitle,
  updateUserModelSettings,
} from "#/lib/chat-functions.ts";
import { creditLimitSummaryQueryKey } from "#/lib/credit-limit-query.ts";
import type { PublicLlmConfig } from "#/lib/llm-types.ts";
import { useChat } from "@ai-sdk/react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { DefaultChatTransport, type UIMessage } from "ai";
import { BrainIcon, ChevronsUpDownIcon, SparklesIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

const AUTO_SUBMIT_KEY_PREFIX = "ubichat:auto-submit:";

type AutoSubmitPayload = {
  modelId: string;
  reasoningModeId?: string | null;
};

type ChatScreenProps = {
  chatId?: string;
  initialModelId?: string | null;
  initialMessages?: UIMessage[];
  initialReasoningModeId?: string | null;
  llmConfig: PublicLlmConfig | null;
  modelsError?: string | null;
};

function getInitialSelectedModelId(
  llmConfig: PublicLlmConfig | null,
  initialModelId?: string | null,
) {
  if (!llmConfig) {
    return "";
  }

  if (initialModelId && llmConfig.models.some((model) => model.id === initialModelId)) {
    return initialModelId;
  }

  if (
    llmConfig.userSettings?.selectedModelId &&
    llmConfig.models.some((model) => model.id === llmConfig.userSettings?.selectedModelId)
  ) {
    return llmConfig.userSettings.selectedModelId;
  }

  return llmConfig.defaultModelId;
}

function getSelectedModel(llmConfig: PublicLlmConfig | null, modelId: string) {
  return llmConfig?.models.find((model) => model.id === modelId);
}

function getReasoningModeId({
  initialReasoningModeId,
  llmConfig,
  modelId,
  useSavedPreference = true,
}: {
  initialReasoningModeId?: string | null;
  llmConfig: PublicLlmConfig | null;
  modelId: string;
  useSavedPreference?: boolean;
}) {
  const model = getSelectedModel(llmConfig, modelId);

  if (!model?.reasoning) {
    return "";
  }

  if (
    initialReasoningModeId &&
    model.reasoning.modes.some((mode) => mode.id === initialReasoningModeId)
  ) {
    return initialReasoningModeId;
  }

  const savedModeId = useSavedPreference
    ? llmConfig?.userSettings?.reasoningPreferences[modelId]
    : undefined;

  if (savedModeId && model.reasoning.modes.some((mode) => mode.id === savedModeId)) {
    return savedModeId;
  }

  return model.reasoning.defaultModeId;
}

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
  initialModelId,
  initialMessages = [],
  initialReasoningModeId,
  llmConfig,
  modelsError,
}: ChatScreenProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const router = useRouter();
  const hasAutoSubmitted = useRef(false);
  const [selectedModelId, setSelectedModelId] = useState(() =>
    getInitialSelectedModelId(llmConfig, initialModelId),
  );
  const [selectedReasoningModeId, setSelectedReasoningModeId] = useState(() =>
    getReasoningModeId({
      initialReasoningModeId,
      llmConfig,
      modelId: getInitialSelectedModelId(llmConfig, initialModelId),
      useSavedPreference: Boolean(chatId),
    }),
  );
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
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
    const nextModelId = getInitialSelectedModelId(llmConfig, initialModelId);
    setSelectedModelId(nextModelId);
    setSelectedReasoningModeId(
      getReasoningModeId({
        initialReasoningModeId,
        llmConfig,
        modelId: nextModelId,
        useSavedPreference: Boolean(chatId),
      }),
    );
  }, [chatId, initialModelId, initialReasoningModeId, llmConfig]);

  useEffect(() => {
    if (!chatId || hasAutoSubmitted.current || typeof window === "undefined") {
      return;
    }

    const payload = readAutoSubmitPayload(chatId);

    if (!payload) {
      return;
    }

    hasAutoSubmitted.current = true;
    setSelectedModelId(payload.modelId);
    setSelectedReasoningModeId(payload.reasoningModeId ?? "");
    void sendMessage(undefined, {
      body: {
        chatId,
        modelId: payload.modelId,
        reasoningModeId: payload.reasoningModeId,
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
            reasoningModeId: selectedReasoningModeId || undefined,
            text,
          },
        });

        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            `${AUTO_SUBMIT_KEY_PREFIX}${createdChat.chatId}`,
            JSON.stringify({
              modelId: createdChat.modelId,
              ...(createdChat.reasoningModeId
                ? { reasoningModeId: createdChat.reasoningModeId }
                : {}),
            } satisfies AutoSubmitPayload),
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
          reasoningModeId: selectedReasoningModeId || undefined,
        },
      },
    );
    await queryClient.invalidateQueries({ queryKey: creditLimitSummaryQueryKey });
  }

  const selectedModel = getSelectedModel(llmConfig, selectedModelId);
  const isSubmitDisabled = isCreatingChat || !selectedModelId || !llmConfig;
  const displayError = modelsError ?? submitError ?? error?.message;
  const isAssistantStreaming = status === "submitted" || status === "streaming";

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
                    const isMessageStreaming =
                      isAssistantStreaming &&
                      message.role === "assistant" &&
                      message.id === messages.at(-1)?.id;

                    if (part.type === "reasoning") {
                      return (
                        <Reasoning
                          className="mb-2"
                          isStreaming={isMessageStreaming}
                          key={`${message.id}-${index}`}
                        >
                          <ReasoningTrigger />
                          <ReasoningContent>{part.text}</ReasoningContent>
                        </Reasoning>
                      );
                    }

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
              <ModelSelector onOpenChange={setIsModelSelectorOpen} open={isModelSelectorOpen}>
                <ModelSelectorTrigger asChild>
                  <Button
                    aria-label="Model"
                    className="h-8 max-w-56 justify-between"
                    disabled={!llmConfig}
                    type="button"
                    variant="outline"
                  >
                    {selectedModel ? (
                      <>
                        {selectedModel.capabilities.reasoning && (
                          <BrainIcon className="size-4 text-muted-foreground" />
                        )}
                        <ModelSelectorLogoGroup>
                          <ModelSelectorLogo provider={selectedModel.lab} />
                        </ModelSelectorLogoGroup>
                        <ModelSelectorName>{selectedModel.displayName}</ModelSelectorName>
                      </>
                    ) : (
                      <ModelSelectorName>Select model</ModelSelectorName>
                    )}
                    <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
                  </Button>
                </ModelSelectorTrigger>
                <ModelSelectorContent title="Select model">
                  <ModelSelectorInput placeholder="Search models..." />
                  <ModelSelectorList>
                    <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                    <ModelSelectorGroup heading="Models">
                      {llmConfig?.models.map((model) => {
                        const isSelected = model.id === selectedModelId;

                        return (
                          <ModelSelectorItem
                            data-checked={isSelected}
                            key={model.id}
                            onSelect={() => {
                              setSelectedModelId(model.id);
                              const nextReasoningModeId = getReasoningModeId({
                                llmConfig,
                                modelId: model.id,
                                useSavedPreference: Boolean(chatId),
                              });
                              setSelectedReasoningModeId(nextReasoningModeId);
                              setIsModelSelectorOpen(false);
                              void updateUserModelSettings({
                                data: {
                                  modelId: model.id,
                                  reasoningModeId: nextReasoningModeId || undefined,
                                },
                              });
                            }}
                            value={model.displayName}
                          >
                            <ModelSelectorName>{model.displayName}</ModelSelectorName>
                            {model.capabilities.reasoning && (
                              <BrainIcon className="ml-auto size-4 text-muted-foreground" />
                            )}
                            <ModelSelectorLogoGroup
                              className={model.capabilities.reasoning ? "" : "ml-auto"}
                            >
                              <ModelSelectorLogo provider={model.lab} />
                            </ModelSelectorLogoGroup>
                          </ModelSelectorItem>
                        );
                      })}
                    </ModelSelectorGroup>
                  </ModelSelectorList>
                </ModelSelectorContent>
              </ModelSelector>
              {selectedModel?.reasoning && (
                <PromptInputSelect
                  disabled={!llmConfig}
                  onValueChange={(modeId) => {
                    setSelectedReasoningModeId(modeId);
                    void updateUserModelSettings({
                      data: {
                        modelId: selectedModel.id,
                        reasoningModeId: modeId,
                      },
                    });
                  }}
                  value={selectedReasoningModeId}
                >
                  <PromptInputSelectTrigger
                    aria-label="Reasoning effort"
                    className="h-8 max-w-44 gap-2"
                  >
                    <BrainIcon className="size-4 text-muted-foreground" />
                    <PromptInputSelectValue placeholder="Reasoning" />
                  </PromptInputSelectTrigger>
                  <PromptInputSelectContent>
                    {selectedModel.reasoning.modes.map((mode) => (
                      <PromptInputSelectItem key={mode.id} value={mode.id}>
                        {mode.label}
                      </PromptInputSelectItem>
                    ))}
                  </PromptInputSelectContent>
                </PromptInputSelect>
              )}
            </PromptInputTools>
            <PromptInputSubmit disabled={isSubmitDisabled} onStop={stop} status={status} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
