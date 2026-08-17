import { defineConfig } from "drizzle-kit";

/**
 * Migrations are generated, reviewed, and committed — never pushed straight to a
 * database. `drizzle-kit push` diffs a live schema and applies the result, which
 * is convenient right up to the first time it decides the way to reconcile a
 * renamed column is to drop it. The tables here hold years of habit history that
 * exists nowhere else once a device has been wiped, so every change goes through
 * a file a human has read.
 *
 *   npx drizzle-kit generate   # write the SQL
 *   npx drizzle-kit migrate    # apply it
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/server/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
