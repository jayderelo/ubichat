import { constants, DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

const DEFAULT_ROW_LIMIT = 200;
const MAX_SQL_LENGTH = 12_000;
const MAX_COLUMNS = 40;
const MAX_CELLS = 8_000;

type DatabaseSyncOptionsWithLimits = ConstructorParameters<typeof DatabaseSync>[1] & {
  limits?: {
    attach?: number;
    column?: number;
    compoundSelect?: number;
    sqlLength?: number;
  };
};

const allowedTables = new Set([
  "Album",
  "Artist",
  "Customer",
  "Employee",
  "Genre",
  "Invoice",
  "InvoiceLine",
  "MediaType",
  "Playlist",
  "PlaylistTrack",
  "Track",
]);

const allowedFunctions = new Set([
  "avg",
  "cast",
  "coalesce",
  "count",
  "date",
  "datetime",
  "ifnull",
  "julianday",
  "length",
  "lower",
  "max",
  "min",
  "printf",
  "round",
  "strftime",
  "substr",
  "sum",
  "total",
  "trim",
  "upper",
]);

const unsafeKeywordPattern =
  /\b(attach|alter|analyze|create|delete|detach|drop|insert|pragma|reindex|replace|savepoint|transaction|update|vacuum)\b/i;

export const chinookCellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const chinookRowSchema = z.object({}).catchall(chinookCellSchema);

export const chinookQueryResultSchema = z.object({
  columns: z.array(z.string()),
  rowCount: z.number().int().nonnegative(),
  rows: z.array(chinookRowSchema),
  sql: z.string(),
  truncated: z.boolean(),
});

export type ChinookQueryResult = z.infer<typeof chinookQueryResultSchema>;

export const CHINOOK_SCHEMA_SUMMARY = `
Chinook SQLite database tables:
- Artist(ArtistId, Name)
- Album(AlbumId, Title, ArtistId -> Artist)
- Track(TrackId, Name, AlbumId -> Album, MediaTypeId -> MediaType, GenreId -> Genre, Composer, Milliseconds, Bytes, UnitPrice)
- Genre(GenreId, Name)
- MediaType(MediaTypeId, Name)
- Playlist(PlaylistId, Name)
- PlaylistTrack(PlaylistId -> Playlist, TrackId -> Track)
- Customer(CustomerId, FirstName, LastName, Company, Address, City, State, Country, PostalCode, Phone, Fax, Email, SupportRepId -> Employee)
- Employee(EmployeeId, LastName, FirstName, Title, ReportsTo -> Employee, BirthDate, HireDate, Address, City, State, Country, PostalCode, Phone, Fax, Email)
- Invoice(InvoiceId, CustomerId -> Customer, InvoiceDate, BillingAddress, BillingCity, BillingState, BillingCountry, BillingPostalCode, Total)
- InvoiceLine(InvoiceLineId, InvoiceId -> Invoice, TrackId -> Track, UnitPrice, Quantity)

Common analysis paths:
- Revenue: Invoice.Total, or InvoiceLine.UnitPrice * InvoiceLine.Quantity joined through Invoice.
- Artists/albums/tracks: Artist -> Album -> Track.
- Sales detail: Customer -> Invoice -> InvoiceLine -> Track.
- Classification: Track -> Genre and Track -> MediaType.
- Playlists: Playlist -> PlaylistTrack -> Track.
`.trim();

export function getChinookDatabasePath() {
  return resolve(process.env.CHINOOK_SQLITE_PATH ?? join(process.cwd(), "database", "chinook.sqlite"));
}

export function assertChinookDatabaseAvailable() {
  const path = getChinookDatabasePath();

  if (!existsSync(path)) {
    throw new Error(`Chinook SQLite database not found at ${path}.`);
  }

  return path;
}

function stripTrailingSemicolon(sql: string) {
  return sql.trim().replace(/;\s*$/, "");
}

function hasStatementSeparator(sql: string) {
  let quote: "'" | '"' | "`" | "[" | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (lineComment) {
      if (char === "\n" || char === "\r") {
        lineComment = false;
      }
      continue;
    }

    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }

    if (!quote && char === "-" && next === "-") {
      return true;
    }

    if (!quote && char === "/" && next === "*") {
      return true;
    }

    if (quote) {
      if (quote === "[" && char === "]") {
        quote = null;
        continue;
      }

      if (char === quote) {
        if (next === quote) {
          index += 1;
          continue;
        }
        quote = null;
      }
      continue;
    }

    if (char === "'" || char === '"' || char === "`" || char === "[") {
      quote = char;
      continue;
    }

    if (char === ";") {
      return index < sql.trimEnd().length - 1;
    }
  }

  return false;
}

function ensureSelectOnlySql(sql: string) {
  const normalized = stripTrailingSemicolon(sql);
  const lower = normalized.toLowerCase();

  if (normalized.length === 0) {
    throw new Error("SQL query is empty.");
  }

  if (normalized.length > MAX_SQL_LENGTH) {
    throw new Error("SQL query is too long.");
  }

  if (!/^(select|with)\b/i.test(normalized)) {
    throw new Error("Only SELECT queries are allowed.");
  }

  if (hasStatementSeparator(sql)) {
    throw new Error("Only one SQL statement is allowed.");
  }

  if (unsafeKeywordPattern.test(normalized)) {
    throw new Error("Query contains a prohibited SQL keyword.");
  }

  if (/\bcross\s+join\b/i.test(normalized)) {
    throw new Error("CROSS JOIN is not allowed for this demo.");
  }

  if (!/\blimit\s+\d+\b/i.test(lower)) {
    throw new Error(`Queries must include LIMIT ${DEFAULT_ROW_LIMIT} or lower.`);
  }

  const limitMatches = [...lower.matchAll(/\blimit\s+(\d+)\b/g)];
  const lastLimit = limitMatches.at(-1)?.[1];
  if (!lastLimit || Number(lastLimit) > DEFAULT_ROW_LIMIT) {
    throw new Error(`Query LIMIT must be ${DEFAULT_ROW_LIMIT} or lower.`);
  }

  return normalized;
}

function createReadonlyDatabase() {
  const options: DatabaseSyncOptionsWithLimits = {
    allowExtension: false,
    limits: {
      attach: 0,
      column: MAX_COLUMNS,
      compoundSelect: 2,
      sqlLength: MAX_SQL_LENGTH,
    },
    readOnly: true,
    timeout: 1000,
  };
  const db = new DatabaseSync(assertChinookDatabaseAvailable(), options);

  db.setAuthorizer((actionCode, arg1, arg2, dbName) => {
    if (dbName && dbName !== "main") {
      return constants.SQLITE_DENY;
    }

    if (actionCode === constants.SQLITE_SELECT) {
      return constants.SQLITE_OK;
    }

    if (actionCode === constants.SQLITE_READ) {
      return arg1 && allowedTables.has(arg1) ? constants.SQLITE_OK : constants.SQLITE_DENY;
    }

    if (actionCode === constants.SQLITE_FUNCTION) {
      return arg2 && allowedFunctions.has(arg2.toLowerCase())
        ? constants.SQLITE_OK
        : constants.SQLITE_DENY;
    }

    return constants.SQLITE_DENY;
  });

  return db;
}

export function executeChinookSelectQuery(sql: string): ChinookQueryResult {
  const safeSql = ensureSelectOnlySql(sql);
  const db = createReadonlyDatabase();

  try {
    const statement = db.prepare(safeSql);
    const rows = statement.all().map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [key, chinookCellSchema.parse(value)]),
      ),
    );
    const columns = statement.columns().map((column) => column.name);
    const maxRowsByCells = Math.max(1, Math.floor(MAX_CELLS / Math.max(1, columns.length)));
    const limitedRows = rows.slice(0, maxRowsByCells);

    return {
      columns,
      rowCount: rows.length,
      rows: limitedRows,
      sql: safeSql,
      truncated: limitedRows.length < rows.length,
    };
  } finally {
    db.close();
  }
}
