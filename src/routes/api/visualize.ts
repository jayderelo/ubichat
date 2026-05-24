import { auth } from "#/lib/auth.ts";
import { createVisualizeResponse, VISUALIZE_MODEL_ID } from "#/lib/chinook-agents.ts";
import { assertChinookDatabaseAvailable } from "#/lib/chinook-db.ts";
import {
  createLanguageModel,
  getLlmModelConfig,
  getReasoningModeConfig,
} from "#/lib/llm-config.ts";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const visualizeRequestSchema = z.object({
  messages: z.array(z.unknown()),
});

type TextOnlyVisualizeMessage = {
  id: string;
  role: "user" | "assistant";
  parts: Array<{ type: "text"; text: string }>;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getStringArray(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
    ? value
    : null;
}

function summarizeToolOutput(output: unknown) {
  if (!isRecord(output)) {
    return null;
  }

  const title = getString(output.title);
  const description = getString(output.description);
  const chartType = getString(output.chartType);
  const yKeys = getStringArray(output.yKeys);

  if (title && description && chartType) {
    return [
      `Generated chart: ${title}.`,
      description,
      `Chart type: ${chartType}.`,
      yKeys?.length ? `Measures: ${yKeys.join(", ")}.` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }

  const explanation = getString(output.explanation);
  const query = getString(output.query);
  const result = isRecord(output.result) ? output.result : null;
  const rowCount = typeof result?.rowCount === "number" ? result.rowCount : null;
  const columns = getStringArray(result?.columns);

  if (explanation || query || rowCount !== null || columns) {
    return [
      explanation ? `Extracted Chinook data: ${explanation}` : null,
      query ? `SQL: ${query}` : null,
      rowCount !== null ? `Rows: ${rowCount}.` : null,
      columns?.length ? `Columns: ${columns.join(", ")}.` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }

  return null;
}

function summarizeMessagePart(part: unknown) {
  if (!isRecord(part)) {
    return null;
  }

  if (part.type === "text") {
    return getString(part.text);
  }

  const outputSummary = summarizeToolOutput(part.output);

  if (outputSummary) {
    return outputSummary;
  }

  const errorText = getString(part.errorText);

  if (errorText) {
    return `Tool error: ${errorText}`;
  }

  return null;
}

export function sanitizeVisualizeMessages(messages: unknown[]): TextOnlyVisualizeMessage[] {
  return messages
    .map((message, index) => {
      if (!isRecord(message) || (message.role !== "user" && message.role !== "assistant")) {
        return null;
      }

      const parts = Array.isArray(message.parts) ? message.parts : [];
      const text = parts.map(summarizeMessagePart).filter(Boolean).join("\n\n").trim();

      if (!text) {
        return null;
      }

      return {
        id: getString(message.id) ?? `visualize-${index}`,
        parts: [
          {
            text: text.slice(0, 8_000),
            type: "text" as const,
          },
        ],
        role: message.role,
      };
    })
    .filter((message): message is TextOnlyVisualizeMessage => message !== null)
    .slice(-8);
}

async function handleVisualizePost(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    assertChinookDatabaseAvailable();
  } catch (error) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid visualize request" }, { status: 400 });
  }

  const parsedBody = visualizeRequestSchema.safeParse(body);

  if (!parsedBody.success) {
    return Response.json({ error: "Invalid visualize request" }, { status: 400 });
  }

  const modelConfig = await getLlmModelConfig(VISUALIZE_MODEL_ID);

  if (!modelConfig) {
    return Response.json({ error: "Visualize model is not configured." }, { status: 500 });
  }

  const reasoningMode = getReasoningModeConfig(modelConfig, modelConfig.reasoning?.defaultModeId);

  return await createVisualizeResponse({
    messages: sanitizeVisualizeMessages(parsedBody.data.messages),
    model: createLanguageModel(modelConfig),
    providerOptions: reasoningMode?.providerOptions,
    request,
  });
}

export const Route = createFileRoute("/api/visualize")({
  server: {
    handlers: {
      POST: ({ request }) => handleVisualizePost(request),
    },
  },
});
