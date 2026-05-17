import type { UIMessage } from "ai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTextMessage } from "#/test/factories.ts";

const generateText = vi.fn();
const objectOutput = { kind: "object-output" };

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();

  return {
    ...actual,
    Output: {
      object: vi.fn(() => objectOutput),
    },
    generateText,
  };
});

const getTitleLlmModelConfig = vi.fn();
const createLanguageModel = vi.fn(() => ({ model: "title-model" }));

vi.mock("#/lib/llm-config.ts", () => ({
  createLanguageModel,
  getTitleLlmModelConfig,
}));

describe("createFallbackChatTitle", () => {
  it("normalizes whitespace", async () => {
    const { createFallbackChatTitle } = await import("#/lib/chat-title.ts");

    expect(createFallbackChatTitle("  hello\n\nworld\tagain  ")).toBe("hello world again");
  });

  it("uses a generic title for empty text", async () => {
    const { createFallbackChatTitle } = await import("#/lib/chat-title.ts");

    expect(createFallbackChatTitle(" \n\t ")).toBe("New chat");
  });

  it("truncates long text to the title limit", async () => {
    const { createFallbackChatTitle } = await import("#/lib/chat-title.ts");

    const title = createFallbackChatTitle("a".repeat(100));

    expect(title).toHaveLength(80);
    expect(title.endsWith("...")).toBe(true);
  });
});

describe("generateChatTitle", () => {
  beforeEach(() => {
    generateText.mockReset();
    getTitleLlmModelConfig.mockReset();
    createLanguageModel.mockClear();
  });

  it("falls back to message text when no title model is configured", async () => {
    getTitleLlmModelConfig.mockResolvedValue(undefined);
    const { generateChatTitle } = await import("#/lib/chat-title.ts");

    await expect(generateChatTitle(createTextMessage({ text: "Fallback title" }))).resolves.toBe(
      "Fallback title",
    );
    expect(generateText).not.toHaveBeenCalled();
  });

  it("uses all text parts from the first message in the title prompt", async () => {
    getTitleLlmModelConfig.mockResolvedValue({ id: "title-model" });
    generateText.mockResolvedValue({ output: { title: "Generated" } });
    const { generateChatTitle } = await import("#/lib/chat-title.ts");
    const message: UIMessage = {
      id: "message-1",
      parts: [
        { text: "First line", type: "text" },
        { text: "Second line", type: "text" },
      ],
      role: "user",
    };

    await expect(generateChatTitle(message)).resolves.toBe("Generated");

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { model: "title-model" },
        output: objectOutput,
        prompt: expect.stringContaining("First line\nSecond line"),
      }),
    );
  });

  it("normalizes generated titles before returning them", async () => {
    getTitleLlmModelConfig.mockResolvedValue({ id: "title-model" });
    generateText.mockResolvedValue({ output: { title: "  Generated\nTitle  " } });
    const { generateChatTitle } = await import("#/lib/chat-title.ts");

    await expect(generateChatTitle(createTextMessage())).resolves.toBe("Generated Title");
  });

  it("propagates provider errors so callers can keep existing titles", async () => {
    getTitleLlmModelConfig.mockResolvedValue({ id: "title-model" });
    generateText.mockRejectedValue(new Error("provider failed"));
    const { generateChatTitle } = await import("#/lib/chat-title.ts");

    await expect(generateChatTitle(createTextMessage())).rejects.toThrow("provider failed");
  });
});
