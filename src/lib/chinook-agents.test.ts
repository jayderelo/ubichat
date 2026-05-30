import { describe, expect, it } from "vitest";

import { createNoDataGraphResult } from "./chinook-agents.ts";

describe("createNoDataGraphResult", () => {
  it("returns a no-data payload instead of empty chart data", () => {
    const output = createNoDataGraphResult({
      columns: ["Name", "revenue"],
      rowCount: 0,
      rows: [],
      sql: "SELECT Name, revenue FROM MissingRevenue LIMIT 10",
      truncated: false,
    });

    expect(output).toEqual({
      description: expect.stringContaining("did not return any rows"),
      kind: "no-data",
      rowCount: 0,
      sql: "SELECT Name, revenue FROM MissingRevenue LIMIT 10",
      title: "No available data",
    });
  });
});
