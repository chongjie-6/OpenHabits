/**
 * Better Auth's own tables. See DESIGN.md §13.6.
 *
 * Deliberately separate from `schema.ts:users`, and the separation is the whole
 * design. Two tables that both sound like "the user table" is a smell worth
 * justifying:
 *
 * - `user` here is the *identity* — credentials, verification state, whatever a
 *   provider needs to recognise someone across devices. Better Auth owns every
 *   column and will add more as plugins are enabled.
 * - `users` in `schema.ts` is the *account* sync rows hang off. It holds an id
 *   and an email and nothing else, because it exists to be the left half of
 *   every primary key.
 *
 * Merging them would hand Better Auth's migrations authority over a table that
 * `habits`, `entries` and `settings` all reference with `onDelete: "cascade"` —
 * a schema change in a dependency could take years of history with it. The link
 * between the two is `users.id === user.id`, established by the upsert in
 * `sync-store.ts` on first sync. No foreign key: the upsert already guarantees
 * the row exists, and a cross-owner constraint would fail migrations in
 * whichever order they happened to run.
 *
 * Field *names* here must match Better Auth's model exactly — the Drizzle
 * adapter looks up properties by name, so `emailVerified` cannot be spelled
 * `verified`. Column names are snake_case to match the rest of this schema.
 * These definitions were taken from `@better-auth/core/dist/db/schema/*`;
 * re-read them when upgrading, since new fields arrive with new versions
 * (`account.issuer` did, in 1.7).
 */

import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

const createdAt = timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt,
  updatedAt,
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** The opaque value in the session cookie. Unique because it is looked up by. */
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt,
  updatedAt,
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  /** The provider's id for this identity — the OAuth `sub`, or the user id for credentials. */
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  issuer: text("issuer").notNull(),
  /** Set for credential accounts only, and already hashed by Better Auth (scrypt). */
  password: text("password"),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  createdAt,
  updatedAt,
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt,
  updatedAt,
});
