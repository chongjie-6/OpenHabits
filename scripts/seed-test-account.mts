/**
 * Seeds a verified account that owns every creature line past its last
 * evolution, with three daily habits to claim exp against (§5.5). Re-running
 * resets the password, the creatures and the habits. Needs DATABASE_URL.
 * With `owned`, it owns only the first that many lines instead, one good day
 * short of the next find: complete today's habits and the next one arrives.
 *
 *   npx tsx --conditions=react-server --env-file=.env scripts/seed-test-account.mts <email> <password> [owned]
 */

import { createLocalAccountIssuer } from "@better-auth/core/db";
import { eq } from "drizzle-orm";
import {
  COGLING_LINES,
  expForLevel,
  goodDaysToFind,
  LINES,
  MAX_LEVEL,
  PARTY_SIZE,
  payout,
} from "@/lib/creatures";
import { addDays, todayKey } from "@/lib/dates";
import { getAuth } from "@/lib/server/better-auth";
import { getDb } from "@/lib/server/db";
import { creatureDays, creatures } from "@/lib/server/schema";
import { asUser } from "@/lib/server/scope";
import { ensureUser, runSync } from "@/lib/server/sync-store";
import type { Habit } from "@/lib/types";

const [email, password, ownedArg] = process.argv.slice(2);
const owned = ownedArg === undefined ? null : Number(ownedArg);
if (
  !email ||
  !password ||
  password.length < 10 ||
  (owned !== null &&
    !(Number.isInteger(owned) && owned >= 1 && owned < LINES.length))
) {
  console.error(
    `usage: seed-test-account.mts <email> <password, 10+ chars> [owned, 1-${LINES.length - 1}]`,
  );
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
// Cogling's line comes last, resting.
const rows =
  owned === null
    ? [...LINES, ...COGLING_LINES].map((line, i) => {
        const level =
          i === 0
            ? MAX_LEVEL
            : Math.min(
                MAX_LEVEL,
                (line.evolvesAt.at(-1) ?? 1) + ((i * 5) % 17),
              );
        return {
          userId: user.id,
          line: line.id,
          exp: expForLevel(level) + (level === MAX_LEVEL ? 0 : 40),
          slot: i < PARTY_SIZE ? i : null,
        };
      })
    : LINES.slice(0, owned).map((line, i) => ({
        userId: user.id,
        line: line.id,
        exp: 0,
        slot: i < PARTY_SIZE ? i : null,
      }));

// Starting two days back leaves today unclaimed even before `dayStartHour`.
const goodDays = owned === null ? 0 : goodDaysToFind(owned) - 1;
const days = Array.from({ length: goodDays }, (_, i) => ({
  userId: user.id,
  day: addDays(todayKey(), -2 - i),
  completed: habits.length,
  scheduled: habits.length,
  expPaid: payout(habits.length, habits.length),
}));

await asUser(db, user.id, async (tx) => {
  await ensureUser(tx, sync);
  await tx.delete(creatures).where(eq(creatures.userId, user.id));
  await tx.delete(creatureDays).where(eq(creatureDays.userId, user.id));
  await tx.insert(creatures).values(rows);
  if (days.length > 0) await tx.insert(creatureDays).values(days);
});

console.log(
  `Seeded ${email}: ${rows.length} creatures, ${goodDays} good days, ${habits.length} habits.`,
);
process.exit(0);
