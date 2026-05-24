import { describe, expect, it } from "vitest";

import { sanitizeVisualizeMessages } from "./visualize.ts";

describe("sanitizeVisualizeMessages", () => {
  it("removes provider tool call protocol parts from follow-up history", () => {
    const messages = [
      {
        id: "user-1",
        parts: [{ text: "Top 10 artists by invoice revenue.", type: "text" }],
        role: "user",
      },
      {
        id: "assistant-1",
        parts: [
          {
            input: { request: "Top 10 artists by invoice revenue." },
            output: {
              explanation: "Grouped invoice lines by artist.",
              query:
                "SELECT Artist.Name, SUM(InvoiceLine.UnitPrice) AS revenue FROM Artist LIMIT 10",
              result: {
                columns: ["Name", "revenue"],
                rowCount: 10,
                rows: [{ Name: "Iron Maiden", revenue: 138.6 }],
                sql: "SELECT Artist.Name, SUM(InvoiceLine.UnitPrice) AS revenue FROM Artist LIMIT 10",
                truncated: false,
              },
            },
            state: "output-available",
            toolCallId: "fc_083acf6be9beeff9006a127083f124819488f6f9a61e47dde2",
            type: "tool-extractChinookData",
          },
          {
            input: { question: "Top artist revenue chart" },
            output: {
              chartConfig: { revenue: { color: "var(--chart-1)", label: "Revenue" } },
              chartType: "bar",
              data: [{ Name: "Iron Maiden", revenue: 138.6 }],
              description: "Top artists ranked by invoice revenue.",
              title: "Top Artists by Revenue",
              xKey: "Name",
              yKeys: ["revenue"],
            },
            state: "output-available",
            toolCallId: "fc_chart",
            type: "tool-buildChinookGraph",
          },
          {
            text: "Iron Maiden leads revenue in this result.",
            type: "text",
          },
        ],
        role: "assistant",
      },
      {
        id: "user-2",
        parts: [{ text: "can you explain it to me further", type: "text" }],
        role: "user",
      },
    ];

    const sanitized = sanitizeVisualizeMessages(messages);

    expect(sanitized).toEqual([
      {
        id: "user-1",
        parts: [{ text: "Top 10 artists by invoice revenue.", type: "text" }],
        role: "user",
      },
      {
        id: "assistant-1",
        parts: [
          {
            text: expect.stringContaining("Generated chart: Top Artists by Revenue."),
            type: "text",
          },
        ],
        role: "assistant",
      },
      {
        id: "user-2",
        parts: [{ text: "can you explain it to me further", type: "text" }],
        role: "user",
      },
    ]);
    expect(JSON.stringify(sanitized)).not.toContain(
      "fc_083acf6be9beeff9006a127083f124819488f6f9a61e47dde2",
    );
  });
});
