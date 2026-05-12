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
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from "#/components/ai-elements/prompt-input";
import { createFileRoute } from "@tanstack/react-router";
import type { UIMessage } from "ai";
import { PaperclipIcon, SparklesIcon } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authed/")({ component: Home });

function Home() {
  const [messages, setMessages] = useState<UIMessage[]>([]);

  function handleSubmit(message: PromptInputMessage) {
    const text = message.text.trim();

    if (!text && message.files.length === 0) {
      return;
    }

    setMessages((currentMessages) => [
      ...currentMessages,
      {
        id: crypto.randomUUID(),
        metadata: undefined,
        parts: [...message.files, ...(text ? [{ text, type: "text" as const }] : [])],
        role: "user",
      },
      {
        id: crypto.randomUUID(),
        metadata: undefined,
        parts: [
          {
            text: "Provider streaming is not configured yet.",
            type: "text",
          },
        ],
        role: "assistant",
      },
    ]);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Conversation className="min-h-0">
        {messages.length === 0 ? (
          <ConversationEmptyState
            description="Start a conversation from the prompt below."
            icon={<SparklesIcon className="size-6" />}
            title="Ready to chat"
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
              <PromptInputButton disabled tooltip="Attachments coming soon">
                <PaperclipIcon className="size-4" />
              </PromptInputButton>
            </PromptInputTools>
            <PromptInputSubmit />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
