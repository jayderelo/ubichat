import React, { type FormEvent, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ChatScreen } from "#/components/chat-screen.tsx";
import { chatId, createPublicLlmConfig, createTextMessage } from "#/test/factories.ts";

const mocks = vi.hoisted(() => ({
  createChatFromFirstMessage: vi.fn(),
  generateAndSaveChatTitle: vi.fn(),
  invalidate: vi.fn(),
  invalidateQueries: vi.fn(),
  navigate: vi.fn(),
  sendMessage: vi.fn(),
  stop: vi.fn(),
  updateUserModelSettings: vi.fn(),
  useChat: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => mocks.navigate,
  useRouter: () => ({ invalidate: mocks.invalidate }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("@ai-sdk/react", () => ({ useChat: mocks.useChat }));

vi.mock("#/lib/chat-functions.ts", () => ({
  createChatFromFirstMessage: mocks.createChatFromFirstMessage,
  generateAndSaveChatTitle: mocks.generateAndSaveChatTitle,
  updateUserModelSettings: mocks.updateUserModelSettings,
}));

vi.mock("#/lib/credit-limit-query.ts", () => ({
  creditLimitSummaryQueryKey: ["credit-limit-summary"],
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();

  return {
    ...actual,
    DefaultChatTransport: vi.fn(function DefaultChatTransport(this: object, init: unknown) {
      Object.assign(this, { init });
    }),
  };
});

vi.mock("#/components/ai-elements/conversation", () => ({
  Conversation: ({ children }: React.PropsWithChildren) => <section>{children}</section>,
  ConversationContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  ConversationEmptyState: ({ description, title }: { description?: string; title?: string }) => (
    <div>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  ),
  ConversationScrollButton: () => null,
}));

vi.mock("#/components/ai-elements/message", () => ({
  Message: ({ children, from }: React.PropsWithChildren<{ from: string }>) => (
    <article data-from={from}>{children}</article>
  ),
  MessageContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  MessageResponse: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
}));

vi.mock("#/components/ai-elements/model-selector", () => ({
  ModelSelector: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  ModelSelectorContent: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  ModelSelectorEmpty: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  ModelSelectorGroup: ({ children }: React.PropsWithChildren<{ heading?: string }>) => (
    <div>{children}</div>
  ),
  ModelSelectorInput: ({ placeholder }: { placeholder?: string }) => (
    <input aria-label="Search models" placeholder={placeholder} />
  ),
  ModelSelectorItem: ({
    children,
    onSelect,
    value,
  }: React.PropsWithChildren<{ onSelect?: () => void; value: string }>) => (
    <button onClick={onSelect} role="option" type="button" value={value}>
      {children}
    </button>
  ),
  ModelSelectorList: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  ModelSelectorLogo: ({ provider }: { provider: string }) => <span>{provider}</span>,
  ModelSelectorLogoGroup: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  ModelSelectorName: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
  ModelSelectorTrigger: ({ children }: React.PropsWithChildren<{ asChild?: boolean }>) => (
    <>{children}</>
  ),
}));

vi.mock("#/components/ai-elements/reasoning", () => ({
  Reasoning: ({
    children,
    isStreaming,
  }: React.PropsWithChildren<{ isStreaming?: boolean }>) => (
    <section data-streaming={isStreaming}>{children}</section>
  ),
  ReasoningContent: ({ children }: React.PropsWithChildren) => <p>{children}</p>,
  ReasoningTrigger: () => <button type="button">Thinking...</button>,
}));

vi.mock("#/components/ai-elements/prompt-input", () => {
  function PromptInput({
    children,
    onSubmit,
  }: React.PropsWithChildren<{
    onSubmit: (
      message: { files: File[]; text: string },
      event: FormEvent<HTMLFormElement>,
    ) => void | Promise<void>;
  }>) {
    const [text, setText] = useState("");

    return (
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void onSubmit({ files: [], text }, event);
        }}
      >
        <label htmlFor="prompt">Prompt</label>
        <textarea id="prompt" onChange={(event) => setText(event.target.value)} value={text} />
        {children}
      </form>
    );
  }

  return {
    PromptInput,
    PromptInputBody: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    PromptInputFooter: ({ children }: React.PropsWithChildren) => <footer>{children}</footer>,
    PromptInputSelect: ({
      children,
      onValueChange,
    }: React.PropsWithChildren<{ onValueChange?: (value: string) => void; value?: string }>) => (
      <div data-testid="prompt-input-select">
        {React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(
                child as React.ReactElement<{ onValueChange?: (value: string) => void }>,
                { onValueChange },
              )
            : child,
        )}
      </div>
    ),
    PromptInputSelectContent: ({
      children,
      onValueChange,
    }: React.PropsWithChildren<{ onValueChange?: (value: string) => void }>) => (
      <div>
        {React.Children.map(children, (child) =>
          React.isValidElement(child)
            ? React.cloneElement(
                child as React.ReactElement<{ onValueChange?: (value: string) => void }>,
                { onValueChange },
              )
            : child,
        )}
      </div>
    ),
    PromptInputSelectItem: ({
      children,
      onValueChange,
      value,
    }: React.PropsWithChildren<{ onValueChange?: (value: string) => void; value: string }>) => (
      <button onClick={() => onValueChange?.(value)} role="option" type="button" value={value}>
        {children}
      </button>
    ),
    PromptInputSelectTrigger: ({ children }: React.PropsWithChildren) => (
      <button aria-label="Reasoning effort" type="button">
        {children}
      </button>
    ),
    PromptInputSelectValue: ({ placeholder }: { placeholder?: string }) => (
      <span>{placeholder}</span>
    ),
    PromptInputSubmit: ({
      disabled,
      onStop,
      status,
    }: {
      disabled?: boolean;
      onStop?: () => void;
      status?: string;
    }) => (
      <button
        aria-label={status === "submitted" || status === "streaming" ? "Stop" : "Submit"}
        disabled={disabled}
        onClick={(event) => {
          if ((status === "submitted" || status === "streaming") && onStop) {
            event.preventDefault();
            onStop();
          }
        }}
        type={status === "submitted" || status === "streaming" ? "button" : "submit"}
      >
        {status === "submitted" || status === "streaming" ? "Stop" : "Submit"}
      </button>
    ),
    PromptInputTextarea: ({ placeholder }: { placeholder?: string }) => (
      <span data-placeholder={placeholder} />
    ),
    PromptInputTools: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
  };
});

type MockUseChatValue = {
  error: Error | null;
  messages: UIMessage[];
  sendMessage: typeof mocks.sendMessage;
  status: "error" | "ready" | "submitted" | "streaming";
  stop: typeof mocks.stop;
};

function mockUseChat(overrides: Partial<MockUseChatValue> = {}) {
  mocks.useChat.mockReturnValue({ ...defaultUseChatValue(), ...overrides });
}

function defaultUseChatValue(): MockUseChatValue {
  return {
    error: null,
    messages: [] as UIMessage[],
    sendMessage: mocks.sendMessage,
    status: "ready",
    stop: mocks.stop,
  };
}

describe("ChatScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mockUseChat();
    mocks.createChatFromFirstMessage.mockResolvedValue({
      chatId,
      messageId: "message-1",
      modelId: "model-default",
      reasoningModeId: null,
    });
    mocks.generateAndSaveChatTitle.mockResolvedValue({ title: "Generated title" });
  });

  it("renders a ready empty state when there are no messages", () => {
    render(<ChatScreen llmConfig={createPublicLlmConfig()} />);

    expect(screen.getByRole("heading", { name: "Ready to chat" })).toBeInTheDocument();
    expect(screen.getByText("Start a conversation from the prompt below.")).toBeInTheDocument();
  });

  it("renders model configuration errors and disables submitting", () => {
    render(<ChatScreen llmConfig={null} modelsError="Model configuration could not be loaded." />);

    expect(
      screen.getByRole("heading", { name: "Model configuration unavailable" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Submit" })).toBeDisabled();
  });

  it("renders initial messages and chat errors", () => {
    mockUseChat({
      error: new Error("Streaming failed"),
      messages: [createTextMessage({ text: "Saved prompt" })],
    });

    render(<ChatScreen llmConfig={createPublicLlmConfig()} />);

    expect(screen.getByText("Saved prompt")).toBeInTheDocument();
    expect(screen.getByText("Streaming failed")).toBeInTheDocument();
  });

  it("creates a new chat from a first text message", async () => {
    const user = userEvent.setup();
    render(<ChatScreen llmConfig={createPublicLlmConfig()} />);

    await user.type(screen.getByLabelText("Prompt"), "Start a project plan");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(mocks.createChatFromFirstMessage).toHaveBeenCalledWith({
        data: {
          modelId: "model-default",
          text: "Start a project plan",
        },
      });
    });
    expect(window.sessionStorage.getItem(`ubichat:auto-submit:${chatId}`)).toBe(
      JSON.stringify({ modelId: "model-default" }),
    );
    expect(mocks.invalidate).toHaveBeenCalled();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["credit-limit-summary"],
    });
    expect(mocks.navigate).toHaveBeenCalledWith({
      params: { chatId },
      to: "/chats/$chatId",
    });
  });

  it("creates a new chat from a first text message with the selected model", async () => {
    const user = userEvent.setup();
    mocks.createChatFromFirstMessage.mockResolvedValue({
      chatId,
      messageId: "message-1",
      modelId: "model-other",
      reasoningModeId: "high",
    });

    render(<ChatScreen llmConfig={createPublicLlmConfig()} />);

    await user.click(screen.getByRole("option", { name: /Other Model/ }));
    await user.type(screen.getByLabelText("Prompt"), "Start a project plan");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(mocks.createChatFromFirstMessage).toHaveBeenCalledWith({
        data: {
          modelId: "model-other",
          reasoningModeId: "high",
          text: "Start a project plan",
        },
      });
    });
    expect(window.sessionStorage.getItem(`ubichat:auto-submit:${chatId}`)).toBe(
      JSON.stringify({ modelId: "model-other", reasoningModeId: "high" }),
    );
  });

  it("uses the configured reasoning default for new chats instead of saved reasoning preferences", async () => {
    const user = userEvent.setup();
    render(
      <ChatScreen
        llmConfig={createPublicLlmConfig({
          userSettings: {
            reasoningPreferences: { "model-other": "low" },
            selectedModelId: "model-other",
          },
        })}
      />,
    );

    await user.type(screen.getByLabelText("Prompt"), "Start a project plan");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    await waitFor(() => {
      expect(mocks.createChatFromFirstMessage).toHaveBeenCalledWith({
        data: {
          modelId: "model-other",
          reasoningModeId: "high",
          text: "Start a project plan",
        },
      });
    });
  });

  it("does not create a new chat for empty prompt text", async () => {
    const user = userEvent.setup();
    render(<ChatScreen llmConfig={createPublicLlmConfig()} />);

    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(mocks.createChatFromFirstMessage).not.toHaveBeenCalled();
  });

  it("sends messages to an existing chat with the selected model", async () => {
    const user = userEvent.setup();
    render(<ChatScreen chatId={chatId} llmConfig={createPublicLlmConfig()} />);

    await user.click(screen.getByRole("option", { name: /Other Model/ }));
    await user.type(screen.getByLabelText("Prompt"), "Continue");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      {
        files: [],
        text: "Continue",
      },
      {
        body: {
          chatId,
          modelId: "model-other",
          reasoningModeId: "high",
        },
      },
    );
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["credit-limit-summary"],
    });
  });

  it("initializes an existing chat with its saved model", async () => {
    const user = userEvent.setup();
    render(
      <ChatScreen
        chatId={chatId}
        initialModelId="model-other"
        llmConfig={createPublicLlmConfig()}
      />,
    );

    expect(screen.getByLabelText("Model")).toHaveTextContent("Other Model");

    await user.type(screen.getByLabelText("Prompt"), "Continue");
    await user.click(screen.getByRole("button", { name: "Submit" }));

    expect(mocks.sendMessage).toHaveBeenCalledWith(
      {
        files: [],
        text: "Continue",
      },
      {
        body: {
          chatId,
          modelId: "model-other",
          reasoningModeId: "high",
        },
      },
    );
  });

  it("renders reasoning parts from assistant messages", () => {
    mockUseChat({
      messages: [
        {
          id: "message-2",
          parts: [
            { text: "I should compare the options.", type: "reasoning" },
            { text: "Use the second option.", type: "text" },
          ],
          role: "assistant",
        } as UIMessage,
      ],
    });

    render(<ChatScreen chatId={chatId} llmConfig={createPublicLlmConfig()} />);

    expect(screen.getByText("Thinking...")).toBeInTheDocument();
    expect(screen.getByText("I should compare the options.")).toBeInTheDocument();
    expect(screen.getByText("Use the second option.")).toBeInTheDocument();
  });

  it("auto-submits a saved first message when loading a newly created chat", async () => {
    window.sessionStorage.setItem(
      `ubichat:auto-submit:${chatId}`,
      JSON.stringify({ modelId: "model-default" }),
    );

    render(<ChatScreen chatId={chatId} llmConfig={createPublicLlmConfig()} />);

    await waitFor(() => {
      expect(mocks.sendMessage).toHaveBeenCalledWith(undefined, {
        body: {
          chatId,
          modelId: "model-default",
        },
      });
    });
    expect(window.sessionStorage.getItem(`ubichat:auto-submit:${chatId}`)).toBeNull();
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["credit-limit-summary"],
    });
    expect(mocks.generateAndSaveChatTitle).toHaveBeenCalledWith({ data: { chatId } });
  });

  it("stops an in-flight response from the submit button", async () => {
    const user = userEvent.setup();
    mockUseChat({ status: "streaming" });

    render(<ChatScreen chatId={chatId} llmConfig={createPublicLlmConfig()} />);

    await user.click(screen.getByRole("button", { name: "Stop" }));

    expect(mocks.stop).toHaveBeenCalled();
  });
});
