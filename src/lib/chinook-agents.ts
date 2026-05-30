import {
  executeChinookSelectQuery,
  CHINOOK_SCHEMA_SUMMARY,
  chinookQueryResultSchema,
} from "#/lib/chinook-db.ts";
import {
  visualizeChartSchema,
  visualizeGraphToolOutputSchema,
  type VisualizeNoData,
} from "#/lib/chinook-visualize-types.ts";
import {
  createAgentUIStreamResponse,
  Output,
  stepCountIs,
  tool,
  ToolLoopAgent,
  type LanguageModel,
} from "ai";
import { z } from "zod";

const MODEL_ID = "gpt-5.4-mini";

export const sqlAgentOutputSchema = z.object({
  explanation: z.string(),
  query: z.string(),
  result: chinookQueryResultSchema,
});

export const graphAgentOutputSchema = visualizeChartSchema;

export type GraphAgentOutput = z.infer<typeof graphAgentOutputSchema>;
export type SqlAgentOutput = z.infer<typeof sqlAgentOutputSchema>;

type CreateVisualizeAgentInput = {
  model: LanguageModel;
  providerOptions?: ConstructorParameters<typeof ToolLoopAgent>[0]["providerOptions"];
};

const SQL_GENERATOR_INSTRUCTIONS = `
You are the SQL generator agent for a Chinook SQLite demo.
Generate safe read-only SQLite for the user's Chinook data request, then execute it with the tool.

Rules:
- Use only the Chinook schema below.
- Produce exactly one SELECT query, or one read-only WITH query that ends in SELECT.
- Include LIMIT 200 or lower.
- Prefer aggregate queries that are graphable.
- Do not use PRAGMA, temp tables, comments, semicolon-separated statements, DDL, DML, extension functions, ATTACH, DETACH, or CROSS JOIN.
- Use explicit JOIN ... ON clauses.

${CHINOOK_SCHEMA_SUMMARY}
`.trim();

const GRAPH_GENERATOR_INSTRUCTIONS = `
You are the graph generator agent for a Chinook SQLite demo.
Analyze the query result and return a chart payload that the frontend can render.

Rules:
- Pick area or line for time series, bar for ranked categories, pie only for small part-to-whole results, table when no chart is appropriate.
- Keep data keys simple ASCII identifiers from the result columns.
- Use chart token colors: var(--chart-1), var(--chart-2), var(--chart-3), var(--chart-4), var(--chart-5).
- Return only structured output matching the schema.
`.trim();

const ORCHESTRATOR_INSTRUCTIONS = `
You are the orchestrator agent for Ubichat Visualize, a demo for graphing the public Chinook SQLite database.

Scope:
- Only answer questions about Chinook data, schema, relationships, or graphable statistics.
- Refuse unrelated requests, even if they include a small Chinook reference.
- If the user asks a general schema question, answer from the schema summary and suggest a graphable follow-up.
- When the user asks for data or statistics, call extractChinookData first, then buildChinookGraph with a short chart question. Do not copy SQL rows into buildChinookGraph.
- After graph data is built, summarize the result and guide the user toward useful follow-up Chinook graph questions.
- Never claim that data was persisted. This page is non-persistent and separate from the main chat.

${CHINOOK_SCHEMA_SUMMARY}
`.trim();

function getNumericColumns(result: z.infer<typeof chinookQueryResultSchema>) {
  return result.columns.filter((column) =>
    result.rows.some((row) => typeof row[column] === "number"),
  );
}

function getTextColumns(result: z.infer<typeof chinookQueryResultSchema>) {
  return result.columns.filter((column) =>
    result.rows.some((row) => typeof row[column] === "string"),
  );
}

function createFallbackChart(
  question: string,
  sqlResult: z.infer<typeof chinookQueryResultSchema>,
): GraphAgentOutput {
  const numericColumns = getNumericColumns(sqlResult);
  const textColumns = getTextColumns(sqlResult);
  const yKeys = numericColumns.slice(0, 5);
  const xKey =
    textColumns[0] ?? sqlResult.columns.find((column) => !yKeys.includes(column)) ?? null;
  const chartType =
    xKey && /date|month|year|time/i.test(xKey)
      ? "area"
      : xKey && yKeys.length > 0
        ? "bar"
        : "table";

  return {
    chartConfig: Object.fromEntries(
      yKeys.map((key, index) => [
        key,
        {
          color: `var(--chart-${(index % 5) + 1})`,
          label: key.replaceAll("_", " "),
        },
      ]),
    ),
    chartType,
    data: sqlResult.rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          typeof value === "boolean" ? String(value) : value,
        ]),
      ),
    ),
    description: `Generated from ${sqlResult.rowCount.toLocaleString()} Chinook result row${
      sqlResult.rowCount === 1 ? "" : "s"
    } for: ${question}`,
    title: "Chinook Data",
    xKey,
    yKeys,
  };
}

export function createNoDataGraphResult(
  sqlResult: z.infer<typeof chinookQueryResultSchema>,
): VisualizeNoData {
  return {
    description:
      "The query completed successfully, but it did not return any rows to visualize. Try broadening the filters or asking for a different Chinook slice.",
    kind: "no-data",
    rowCount: 0,
    sql: sqlResult.sql,
    title: "No available data",
  };
}

function isUsableChart(
  chart: GraphAgentOutput,
  sqlResult: z.infer<typeof chinookQueryResultSchema>,
) {
  if (chart.chartType === "table") {
    return chart.data.length > 0;
  }

  return (
    chart.data.length > 0 &&
    chart.yKeys.length > 0 &&
    chart.yKeys.every((key) => chart.data.some((row) => typeof row[key] === "number")) &&
    (!chart.xKey || chart.data.some((row) => row[chart.xKey as string] !== undefined)) &&
    chart.data.length <= sqlResult.rows.length
  );
}

export function createVisualizeAgent({ model, providerOptions }: CreateVisualizeAgentInput) {
  let latestSqlResult: z.infer<typeof chinookQueryResultSchema> | null = null;

  const sqlGenerator = new ToolLoopAgent({
    id: "chinook-sql-generator",
    instructions: SQL_GENERATOR_INSTRUCTIONS,
    maxOutputTokens: 1200,
    maxRetries: 0,
    model,
    output: Output.object({
      schema: sqlAgentOutputSchema,
      name: "sql_agent_result",
    }),
    providerOptions,
    stopWhen: stepCountIs(3),
    tools: {
      executeReadonlyChinookQuery: tool({
        description: "Execute one safe read-only SQLite SELECT query against the Chinook database.",
        inputSchema: z.object({
          query: z.string().describe("A single SQLite SELECT query with LIMIT 200 or lower."),
        }),
        outputSchema: chinookQueryResultSchema,
        execute: ({ query }) => executeChinookSelectQuery(query),
      }),
    },
  });

  const graphGenerator = new ToolLoopAgent({
    id: "chinook-graph-generator",
    instructions: GRAPH_GENERATOR_INSTRUCTIONS,
    maxOutputTokens: 1600,
    maxRetries: 0,
    model,
    output: Output.object({
      schema: graphAgentOutputSchema,
      name: "graph_agent_result",
    }),
    providerOptions,
    stopWhen: stepCountIs(2),
  });

  return new ToolLoopAgent({
    id: "chinook-orchestrator",
    instructions: ORCHESTRATOR_INSTRUCTIONS,
    maxOutputTokens: 1800,
    maxRetries: 0,
    model,
    providerOptions,
    stopWhen: [
      ({ steps }) =>
        steps.some((step) =>
          step.toolResults.some((toolResult) => toolResult.toolName === "buildChinookGraph"),
        ),
      stepCountIs(4),
    ],
    tools: {
      extractChinookData: tool({
        description:
          "Delegate a Chinook data extraction or statistics request to the SQL generator agent.",
        inputSchema: z.object({
          request: z.string().describe("The Chinook-only data request to answer."),
        }),
        outputSchema: sqlAgentOutputSchema,
        execute: async ({ request }) => {
          const result = await sqlGenerator.generate({
            prompt: `User data request: ${request}`,
          });
          latestSqlResult = executeChinookSelectQuery(result.output.query);

          return {
            ...result.output,
            result: latestSqlResult,
          };
        },
      }),
      buildChinookGraph: tool({
        description:
          "Delegate SQL result analysis to the graph generator and return frontend chart data.",
        inputSchema: z.object({
          question: z
            .string()
            .describe("Short description of the chart to create from the latest SQL result."),
        }),
        outputSchema: visualizeGraphToolOutputSchema,
        execute: async ({ question }) => {
          if (!latestSqlResult) {
            throw new Error("No Chinook SQL result is available. Call extractChinookData first.");
          }

          if (latestSqlResult.rowCount === 0) {
            return createNoDataGraphResult(latestSqlResult);
          }

          try {
            const result = await graphGenerator.generate({
              prompt: JSON.stringify(
                {
                  question,
                  sqlResult: latestSqlResult,
                },
                null,
                2,
              ),
            });

            if (isUsableChart(result.output, latestSqlResult)) {
              return result.output;
            }
          } catch {
            return createFallbackChart(question, latestSqlResult);
          }

          return createFallbackChart(question, latestSqlResult);
        },
      }),
    },
  });
}

export async function createVisualizeResponse({
  messages,
  model,
  providerOptions,
  request,
}: {
  messages: unknown[];
  model: LanguageModel;
  providerOptions?: ConstructorParameters<typeof ToolLoopAgent>[0]["providerOptions"];
  request: Request;
}) {
  return await createAgentUIStreamResponse({
    agent: createVisualizeAgent({ model, providerOptions }),
    abortSignal: request.signal,
    sendReasoning: false,
    timeout: { totalMs: 60_000 },
    uiMessages: messages,
  });
}

export { MODEL_ID as VISUALIZE_MODEL_ID };
