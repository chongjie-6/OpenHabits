/**
 * Seeds a verified account that owns every creature line past its last
 * evolution, with three daily habits to claim exp against (§5.5). Re-running
 * resets the password, the creatures and the habits. Needs DATABASE_URL.
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/seed-test-account.mts <email> <password>
 */

import { createLocalAccountIssuer } from "@better-auth/core/db";
import { eq } from "drizzle-orm";
import { expForLevel, LINES, MAX_LEVEL, PARTY_SIZE } from "@/lib/creatures";
import { addDays, todayKey } from "@/lib/dates";
import { getAuth } from "@/lib/server/better-auth";
import { getDb } from "@/lib/server/db";
import { creatures } from "@/lib/server/schema";
import { asUser } from "@/lib/server/scope";
import { ensureUser, runSync } from "@/lib/server/sync-store";
import type { Habit } from "@/lib/types";

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 10) {
  console.error("usage: seed-test-account.mts <email> <password, 10+ chars>");
  process.exit(1);
}

// Better Auth's own adapter, so the password hash and account row are exactly
// what sign-in expects, and no verification mail is sent.
const auth = await getAuth().$context;
const hash = await auth.password.hash(password);
const existing = await auth.internalAdapter.findUserByEmail(email);
const user =
  existing?.user ??
  (await auth.internalAdapter.createUser(
    { email, name: "Dex Tester", emailVerified: true },
    { method: "email-password" },
  ));
if (existing?.accounts.some((a) => a.providerId === "credential")) {
  await auth.internalAdapter.updatePassword(user.id, hash);
} else {
  await auth.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    issuer: createLocalAccountIssuer("credential"),
    accountId: user.id,
    password: hash,
  });
}
await auth.internalAdapter.updateUser(user.id, { emailVerified: true });

// A week back, so the habits are scheduled today in every timezone.
const createdAt = addDays(todayKey(), -7);
const habits: Habit[] = [
  ["seed-water", "Drink water", "💧", "blue"],
  ["seed-read", "Read ten pages", "📖", "violet"],
  ["seed-stretch", "Stretch", "🧘", "green"],
].map(([id, name, emoji, color], order) => ({
  id,
  name,
  emoji,
  color: color as Habit["color"],
  cadence: { kind: "daily" },
  target: 1,
  order,
  createdAt,
  archivedAt: null,
  updatedAt: Date.now(),
  deletedAt: null,
}));

const db = getDb();
const sync = { id: user.id, email };
await runSync(db, sync, {
  since: 0,
  accountId: null,
  habits,
  entries: [],
  settings: null,
});

// Every line at or past its last form, so the whole dex is seen; the buddy is
// at the top level, and the rest spread out so some moves are still to learn.
const rows = LINES.map((line, i) => {
  const level =
    i === 0
      ? MAX_LEVEL
      : Math.min(MAX_LEVEL, line.evolvesAt.at(-1)! + ((i * 5) % 17));
  return {
    userId: user.id,
    line: line.id,
    exp: expForLevel(level) + (level === MAX_LEVEL ? 0 : 40),
    slot: i < PARTY_SIZE ? i : null,
  };
});

await asUser(db, user.id, async (tx) => {
  await ensureUser(tx, sync);
  await tx.delete(creatures).where(eq(creatures.userId, user.id));
  await tx.insert(creatures).values(rows);
});

console.log(
  `Seeded ${email}: ${rows.length} creatures, ${habits.length} habits.`,
);
process.exit(0);
