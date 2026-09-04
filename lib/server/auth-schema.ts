/**
 * Better Auth's own tables. See DESIGN.md §13.6.
 *
 * `user` here is the *identity* Better Auth owns; `users` in `schema.ts` is the
 * *account* sync rows hang off. Merging them would hand a dependency's migrations
 * authority over the table `habits`, `entries` and `settings` all cascade from —
 * a schema change could take years of history with it. The link is
 * `users.id === user.id`, established by the upsert in `sync-store.ts`. No
 * foreign key: the upsert already guarantees the row, and a cross-owner
 * constraint would fail migrations in whichever order they ran.
 *
 * Field *names* must match Better Auth's model exactly — the Drizzle adapter
 * looks up properties by name. Taken from `@better-auth/core/dist/db/schema/*`;
 * re-read on upgrade, since new fields arrive with new versions (`account.issuer`
 * did, in 1.7).
 */

import { boolean, pgSchema, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Better Auth's tables live in their own Postgres schema. See DESIGN.md §13.8 #9.
 *
 * §13.6 argues the *separation* of `user` and `users` is right, and it is. The
 * argument it never made is that one letter is enough to carry it: at 2am, in a
 * `psql` prompt, `user` and `users` are one typo apart and the wrong one is the
 * table every habit cascades from. A namespace states the boundary in the name
 * — `auth.user` is visibly a dependency's table, `public.users` visibly ours —
 * and it is the boundary that matters, not the plural.
 *
 * `pgSchema` rather than a prefix because the ownership is real: everything in
 * here is Better Auth's to migrate, and nothing in `schema.ts` is.
 */
const authSchema = pgSchema("auth");
const pgTable = authSchema.table;

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
