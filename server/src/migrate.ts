import "dotenv/config";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db } from "./db.js";

await migrate(db as never, { migrationsFolder: "./drizzle" });
console.log("Migrations applied.");
process.exit(0);
