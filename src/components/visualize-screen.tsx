"use client";

import { ConversationEmptyState } from "#/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "#/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from "#/components/ai-elements/prompt-input";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "#/components/ai-elements/tool";
import { VisualizeChart } from "#/components/visualize-chart.tsx";
import { Button } from "#/components/ui/button.tsx";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card.tsx";
import { Separator } from "#/components/ui/separator.tsx";
import { visualizeChartSchema } from "#/lib/chinook-visualize-types.ts";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai";
import {
  ArrowDownIcon,
  ChartAreaIcon,
  DatabaseIcon,
  LoaderCircleIcon,
  SendIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStickToBottom } from "use-stick-to-bottom";
import type { ToolPart } from "#/components/ai-elements/tool";

const sampleInquiries = [
  "Show monthly sales totals.",
  "Which genres generated the most revenue?",
  "Top 10 artists by invoice revenue.",
  "Average track price by genre.",
  "Sales by billing country.",
];

const relationships = [
  "Artist → Album → Track",
  "Track → Genre / MediaType",
  "Customer → Invoice → InvoiceLine → Track",
  "Employee → Customer via SupportRepId",
  "Playlist → PlaylistTrack → Track",
];

function getToolTitle(toolName: string) {
  if (toolName === "extractChinookData") {
    return "Extract Chinook Data";
  }

  if (toolName === "buildChinookGraph") {
    return "Build Graph";
  }

  return toolName;
}

function VisualizeToolPart({ part }: { part: ToolPart }) {
  const toolName = getToolName(part);
  const [isOpen, setIsOpen] = useState(part.state !== "output-available");
  const parsedChart =
    toolName === "buildChinookGraph" && part.state === "output-available"
      ? visualizeChartSchema.safeParse(part.output)
      : null;

  useEffect(() => {
    if (part.state === "output-available") {
      setIsOpen(false);
    }
  }, [part.state]);

  return (
    <>
      <Tool onOpenChange={setIsOpen} open={isOpen}>
        {part.type === "dynamic-tool" ? (
          <ToolHeader
            state={part.state}
            title={getToolTitle(toolName)}
            toolName={toolName}
            type={part.type}
          />
        ) : (
          <ToolHeader state={part.state} title={getToolTitle(toolName)} type={part.type} />
        )}
        <ToolContent>
          {"input" in part && part.input !== undefined && <ToolInput input={part.input} />}
          {("output" in part && part.output !== undefined) ||
          ("errorText" in part && part.errorText) ? (
            <ToolOutput
              errorText={"errorText" in part ? part.errorText : undefined}
              output={"output" in part ? part.output : undefined}
            />
          ) : null}
        </ToolContent>
      </Tool>
      {parsedChart?.success ? (
        <div className="mb-2 flex flex-col gap-3 rounded-md border bg-background p-3">
          <div>
            <h3 className="font-medium text-sm">{parsedChart.data.title}</h3>
            <p className="text-muted-foreground text-sm">{parsedChart.data.description}</p>
          </div>
          <VisualizeChart chart={parsedChart.data} />
        </div>
      ) : null}
    </>
  );
}

function VisualizeMessage({ message, status }: { message: UIMessage; status: string }) {
  const isAssistantStreaming =
    (status === "submitted" || status === "streaming") && message.role === "assistant";

  return (
    <Message from={message.role}>
      <MessageContent className={message.role === "assistant" ? "w-full" : undefined}>
        {message.parts.map((part, index) => {
          const key = `${message.id}-${index}`;

          if (part.type === "text") {
            return (
              <MessageResponse isAnimating={isAssistantStreaming} key={key}>
                {part.text}
              </MessageResponse>
            );
          }

          if (isToolUIPart(part)) {
            return <VisualizeToolPart key={key} part={part} />;
          }

          return null;
        })}
      </MessageContent>
    </Message>
  );
}

export function VisualizeScreen() {
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/visualize" }), []);
  const { error, messages, sendMessage, status, stop } = useChat({ transport });
  const displayError = submitError ?? error?.message;
  const isBusy = status === "submitted" || status === "streaming";
  const { contentRef, isAtBottom, scrollRef, scrollToBottom } = useStickToBottom({
    initial: "smooth",
    resize: "smooth",
  });

  async function handleSubmit(message: PromptInputMessage) {
    const text = message.text.trim();
    setSubmitError(null);

    if (!text) {
      return;
    }

    if (message.files.length > 0) {
      setSubmitError("Visualize accepts text questions only.");
      return;
    }

    try {
      void scrollToBottom({ animation: "smooth", wait: true });
      await sendMessage({
        parts: [{ text, type: "text" }],
        role: "user",
      });
      void scrollToBottom({ animation: "smooth", wait: true });
    } catch (caughtError) {
      setSubmitError(
        caughtError instanceof Error ? caughtError.message : "Failed to send Visualize request.",
      );
      throw caughtError;
    }
  }

  async function submitSampleInquiry(sample: string) {
    if (isBusy) {
      return;
    }

    const prompt = promptRef.current;

    if (prompt) {
      prompt.value = sample;
      prompt.dispatchEvent(new Event("input", { bubbles: true }));
    }

    void handleSubmit({ files: [], text: sample }).catch(() => undefined);

    if (prompt) {
      prompt.value = "";
      prompt.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  useEffect(() => {
    if (messages.length > 0 && isBusy) {
      void scrollToBottom({ animation: "smooth", wait: true });
    }
  }, [isBusy, messages.length, scrollToBottom]);

  return (
    <div className="grid h-[calc(100svh-3rem)] min-h-0 grid-cols-1 overflow-hidden xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="flex min-h-0 flex-col overflow-hidden border-r">
        <div className="relative min-h-0 flex-1 overflow-y-auto" ref={scrollRef} role="log">
          {messages.length === 0 && !isBusy ? (
            <ConversationEmptyState
              description="Ask for Chinook sales, music catalog, customers, invoices, or graphable statistics."
              icon={<ChartAreaIcon className="size-6" />}
              title="Visualize Chinook data"
            />
          ) : (
            <div
              className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4"
              ref={contentRef}
            >
              {messages.map((message) => (
                <VisualizeMessage key={message.id} message={message} status={status} />
              ))}
              {status === "submitted" && (
                <Message from="assistant">
                  <MessageContent>
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <LoaderCircleIcon className="size-4 animate-spin" />
                      <span>Thinking...</span>
                    </div>
                  </MessageContent>
                </Message>
              )}
              {displayError && (
                <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-destructive text-sm">
                  <TriangleAlertIcon className="size-4 shrink-0" />
                  <span>{displayError}</span>
                </div>
              )}
            </div>
          )}
          {!isAtBottom && (
            <Button
              className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full dark:bg-background dark:hover:bg-muted"
              onClick={() => void scrollToBottom("smooth")}
              size="icon"
              type="button"
              variant="outline"
            >
              <ArrowDownIcon className="size-4" />
            </Button>
          )}
        </div>
        <div className="shrink-0 border-t bg-background p-3">
          <PromptInput className="mx-auto max-w-5xl" onSubmit={handleSubmit}>
            <PromptInputBody>
              <PromptInputTextarea
                placeholder="Ask for a Chinook chart or statistic..."
                ref={promptRef}
              />
            </PromptInputBody>
            <PromptInputFooter className="justify-end">
              <PromptInputSubmit
                idleIcon={<SendIcon className="size-4" />}
                onStop={stop}
                status={status}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </section>
      <aside className="hidden min-h-0 overflow-auto bg-muted/20 p-4 xl:block">
        <div className="flex flex-col gap-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DatabaseIcon className="size-4 text-muted-foreground" />
                Chinook Guide
              </CardTitle>
              <CardDescription>Digital media store sample data for agent demos.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">Sample inquiries</h3>
                <div className="flex flex-col overflow-hidden rounded-md border bg-background">
                  {sampleInquiries.map((sample) => (
                    <Button
                      className="h-auto justify-start gap-2 rounded-none border-0 border-b px-3 py-2 text-left font-normal last:border-b-0"
                      disabled={isBusy}
                      key={sample}
                      onClick={() => void submitSampleInquiry(sample)}
                      type="button"
                      variant="ghost"
                    >
                      <SendIcon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 whitespace-normal text-sm">{sample}</span>
                    </Button>
                  ))}
                </div>
              </div>
              <Separator />
              <div className="flex flex-col gap-2">
                <h3 className="font-medium text-sm">Relationships</h3>
                <div className="flex flex-col gap-1.5 text-muted-foreground text-sm">
                  {relationships.map((relationship) => (
                    <div className="font-mono text-xs" key={relationship}>
                      {relationship}
                    </div>
                  ))}
                </div>
              </div>
              <Separator />
              <div className="flex items-start gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                <SparklesIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <p className="text-muted-foreground">
                  The agent will steer unrelated prompts back to Chinook data and graph generation.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </aside>
    </div>
  );
}
