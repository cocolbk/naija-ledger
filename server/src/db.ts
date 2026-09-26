import "dotenv/config";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";
import * as authSchema from "./auth-schema.js";

const client = postgres(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema: { ...schema, ...authSchema } });
