import React, { type FormEvent, useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VisualizeScreen } from "#/components/visualize-screen.tsx";

const mocks = vi.hoisted(() => ({
  clearError: vi.fn(),
  sendMessage: vi.fn(),
  setMessages: vi.fn(),
  stop: vi.fn(),
  useChat: vi.fn(),
}));

vi.mock("@ai-sdk/react", () => ({ useChat: mocks.useChat }));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();

  return {
    ...actual,
    DefaultChatTransport: vi.fn(function DefaultChatTransport(this: object, init: unknown) {
      Object.assign(this, { init });
    }),
  };
});

vi.mock("use-stick-to-bottom", () => ({
  useStickToBottom: () => ({
    contentRef: vi.fn(),
    isAtBottom: true,
    scrollRef: vi.fn(),
    scrollToBottom: vi.fn(),
  }),
}));

vi.mock("#/components/visualize-chart.tsx", () => ({
  VisualizeChart: () => <div>Chart</div>,
}));

vi.mock("#/components/ai-elements/conversation", () => ({
  ConversationEmptyState: ({ description, title }: { description?: string; title?: string }) => (
    <div>
      <h2>{title}</h2>
      <p>{description}</p>
    </div>
  ),
}));

vi.mock("#/components/ai-elements/message", () => ({
  Message: ({ children, from }: React.PropsWithChildren<{ from: string }>) => (
    <article data-from={from}>{children}</article>
  ),
  MessageContent: ({ children, className }: React.PropsWithChildren<{ className?: string }>) => (
    <div className={className}>{children}</div>
  ),
  MessageResponse: ({ children }: React.PropsWithChildren<{ isAnimating?: boolean }>) => (
    <p>{children}</p>
  ),
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
        <textarea
          aria-label="Prompt"
          onChange={(event) => setText(event.target.value)}
          value={text}
        />
        {children}
      </form>
    );
  }

  return {
    PromptInput,
    PromptInputBody: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
    PromptInputFooter: ({ children }: React.PropsWithChildren<{ className?: string }>) => (
      <footer>{children}</footer>
    ),
    PromptInputButton: ({
      children,
      disabled,
      onClick,
    }: React.PropsWithChildren<{
      "aria-label"?: string;
      disabled?: boolean;
      onClick?: () => void;
      tooltip?: string;
    }>) => (
      <button aria-label="Reset conversation" disabled={disabled} onClick={onClick} type="button">
        {children}
      </button>
    ),
    PromptInputSubmit: ({
      status,
    }: {
      idleIcon?: React.ReactNode;
      onStop?: () => void;
      status?: string;
    }) => <button type="button">{status === "streaming" ? "Stop" : "Submit"}</button>,
    PromptInputTextarea: React.forwardRef<HTMLTextAreaElement, { placeholder?: string }>(
      ({ placeholder }, ref) => <textarea placeholder={placeholder} ref={ref} />,
    ),
  };
});

type MockUseChatValue = {
  clearError: typeof mocks.clearError;
  error: Error | null;
  messages: UIMessage[];
  sendMessage: typeof mocks.sendMessage;
  setMessages: typeof mocks.setMessages;
  status: "error" | "ready" | "submitted" | "streaming";
  stop: typeof mocks.stop;
};

function defaultUseChatValue(): MockUseChatValue {
  return {
    clearError: mocks.clearError,
    error: null,
    messages: [],
    sendMessage: mocks.sendMessage,
    setMessages: mocks.setMessages,
    status: "ready",
    stop: mocks.stop,
  };
}

function mockUseChat(overrides: Partial<MockUseChatValue> = {}) {
  mocks.useChat.mockReturnValue({ ...defaultUseChatValue(), ...overrides });
}

function createAssistantMessage(parts: UIMessage["parts"]): UIMessage {
  return {
    id: "assistant-message",
    parts,
    role: "assistant",
  };
}

describe("VisualizeScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseChat();
  });

  it("shows the initial thinking state after submitting", () => {
    mockUseChat({ status: "submitted" });

    render(<VisualizeScreen />);

    expect(screen.getByText("Thinking...")).toBeInTheDocument();
  });

  it("shows a visible running state while the latest tool call is active", () => {
    mockUseChat({
      messages: [
        createAssistantMessage([
          {
            input: { question: "Top artists" },
            state: "input-available",
            toolCallId: "tool-1",
            type: "tool-extractChinookData",
          },
        ] as UIMessage["parts"]),
      ],
      status: "streaming",
    });

    render(<VisualizeScreen />);

    expect(screen.getByText("Running Extract Chinook Data...")).toBeInTheDocument();
  });

  it("keeps showing thinking after a tool result while the stream continues", () => {
    mockUseChat({
      messages: [
        createAssistantMessage([
          {
            input: { question: "Top artists" },
            output: { result: { rowCount: 3 } },
            state: "output-available",
            toolCallId: "tool-1",
            type: "tool-extractChinookData",
          },
        ] as UIMessage["parts"]),
      ],
      status: "streaming",
    });

    render(<VisualizeScreen />);

    expect(screen.getByText("Thinking...")).toBeInTheDocument();
  });

  it("does not add a duplicate activity row while assistant text is visible", () => {
    mockUseChat({
      messages: [createAssistantMessage([{ text: "Here is the chart.", type: "text" }])],
      status: "streaming",
    });

    render(<VisualizeScreen />);

    expect(screen.queryByText("Thinking...")).not.toBeInTheDocument();
  });

  it("resets the stateless conversation", async () => {
    const user = userEvent.setup();
    mockUseChat({
      messages: [createAssistantMessage([{ text: "Here is the chart.", type: "text" }])],
    });

    render(<VisualizeScreen />);

    await user.click(screen.getByRole("button", { name: "Reset conversation" }));

    expect(mocks.setMessages).toHaveBeenCalledWith([]);
    expect(mocks.clearError).toHaveBeenCalled();
    expect(mocks.stop).not.toHaveBeenCalled();
  });

  it("stops the active stream before resetting", async () => {
    const user = userEvent.setup();
    mockUseChat({
      messages: [
        createAssistantMessage([
          {
            input: { question: "Top artists" },
            state: "input-available",
            toolCallId: "tool-1",
            type: "tool-extractChinookData",
          },
        ] as UIMessage["parts"]),
      ],
      status: "streaming",
    });

    render(<VisualizeScreen />);

    await user.click(screen.getByRole("button", { name: "Reset conversation" }));

    expect(mocks.stop).toHaveBeenCalled();
    expect(mocks.setMessages).toHaveBeenCalledWith([]);
  });
});
