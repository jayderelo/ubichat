import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as appSchema from "../../database/schema/app-schema";
import * as authSchema from "../../database/schema/auth-schema";

export const schema = {
  ...authSchema,
  ...appSchema,
};

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });

export { appSchema, authSchema };
