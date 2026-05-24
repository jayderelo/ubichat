import { describe, expect, it } from "vitest";
import { executeChinookSelectQuery } from "#/lib/chinook-db.ts";

describe("executeChinookSelectQuery", () => {
  it("executes bounded read-only aggregate queries", () => {
    const result = executeChinookSelectQuery(`
      SELECT strftime('%Y-%m', InvoiceDate) AS month, SUM(Total) AS revenue
      FROM Invoice
      GROUP BY month
      ORDER BY month
      LIMIT 5
    `);

    expect(result.columns).toEqual(["month", "revenue"]);
    expect(result.rows).toHaveLength(5);
    expect(result.rows[0]).toMatchObject({ month: "2009-01", revenue: 35.64 });
  });

  it("allows semicolons inside string literals", () => {
    const result = executeChinookSelectQuery("SELECT 'a;b' AS value LIMIT 1");

    expect(result.rows).toEqual([{ value: "a;b" }]);
  });

  it("rejects multi-statement SQL", () => {
    expect(() => executeChinookSelectQuery("SELECT 1 AS one; SELECT 2 AS two")).toThrow(
      "Only one SQL statement is allowed.",
    );
  });

  it("rejects unbounded queries", () => {
    expect(() => executeChinookSelectQuery("SELECT * FROM Track")).toThrow(
      "Queries must include LIMIT 200 or lower.",
    );
  });

  it("rejects mutation and metadata queries", () => {
    expect(() => executeChinookSelectQuery("DELETE FROM Track WHERE TrackId = 1 LIMIT 1")).toThrow(
      "Only SELECT queries are allowed.",
    );
    expect(() => executeChinookSelectQuery("PRAGMA table_info(Track)")).toThrow(
      "Only SELECT queries are allowed.",
    );
  });

  it("rejects prohibited functions through the SQLite authorizer", () => {
    expect(() => executeChinookSelectQuery("SELECT load_extension('x') AS value LIMIT 1")).toThrow(
      "not authorized",
    );
  });
});

