/**
 * The decidable half of `lib/server/email-queue.ts`: whether this deployment
 * has a queue at all, and whether an envelope read back out of Redis is one
 * worth mailing. See DESIGN.md §13.16.
 *
 * Neither needs QStash or a store, which is why both take their environment as
 * a parameter — the same arrangement as `base-url.ts`.
 */

import { describe, expect, it } from "vitest";
import { parseEmailJob, queueConfigured, workerURL } from "@/lib/server/email-queue";
import { mailableOrigin } from "@/lib/server/base-url";

const site = "https://openhabits.app";

/** A configured deployment: a token, a store, and a public origin. */
const configured = {
  NODE_ENV: "production",
  QSTASH_TOKEN: "qstash-token",
  UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "redis-token",
  SITE_URL: site,
  BETTER_AUTH_URL: site,
} as NodeJS.ProcessEnv;

describe("queueConfigured", () => {
  it("is on when the token, the store and a public origin are all present", () => {
    expect(queueConfigured(configured)).toBe(true);
  });

  it("is off with no QStash token", () => {
    expect(queueConfigured({ ...configured, QSTASH_TOKEN: undefined })).toBe(false);
  });

  /** The envelope store is Redis, so a queue without one has nowhere to put the
   * link — which is the whole reason the link does not travel in the message. */
  it("is off with no store, even holding a token", () => {
    expect(queueConfigured({ ...configured, UPSTASH_REDIS_REST_URL: undefined })).toBe(false);
    expect(queueConfigured({ ...configured, UPSTASH_REDIS_REST_TOKEN: undefined })).toBe(false);
  });

  /**
   * The clause worth a test of its own. QStash delivers by making a request from
   * its own network, so a laptop is unreachable and a real token on one would
   * enqueue messages that fail their way into the DLQ while no mail arrives.
   * Answering "not configured" sends inline instead, which is what a developer
   * wants anyway.
   */
  it("is off on localhost, where QStash cannot call back", () => {
    const local = { ...configured, SITE_URL: "http://localhost:3000" };
    expect(queueConfigured(local)).toBe(false);
    expect(queueConfigured({ ...configured, SITE_URL: "http://127.0.0.1:3000" })).toBe(false);
  });
});

describe("workerURL", () => {
  it("hangs the worker off the deployment's own origin", () => {
    expect(workerURL(configured).toString()).toBe(`${site}/api/email`);
  });
});

describe("parseEmailJob", () => {
  const job = { kind: "verification", to: "someone@example.com", url: `${site}/verify-email?token=abc` };

  it("accepts both kinds", () => {
    expect(parseEmailJob(job, configured)).toEqual(job);
    const reset = { ...job, kind: "reset", url: `${site}/reset-password?token=abc` };
    expect(parseEmailJob(reset, configured)).toEqual(reset);
  });

  it("rejects a kind it does not know", () => {
    expect(parseEmailJob({ ...job, kind: "invoice" }, configured)).toBeNull();
    expect(parseEmailJob({ ...job, kind: undefined }, configured)).toBeNull();
  });

  it("rejects anything that is not an object", () => {
    expect(parseEmailJob(null, configured)).toBeNull();
    expect(parseEmailJob("verification", configured)).toBeNull();
    expect(parseEmailJob([job], configured)).toBeNull();
  });

  it("rejects a missing or over-long address", () => {
    expect(parseEmailJob({ ...job, to: "" }, configured)).toBeNull();
    expect(parseEmailJob({ ...job, to: `${"a".repeat(320)}@example.com` }, configured)).toBeNull();
  });

  it("rejects an over-long URL", () => {
    expect(parseEmailJob({ ...job, url: `${site}/?t=${"a".repeat(2048)}` }, configured)).toBeNull();
  });

  /**
   * The check the whole indirection exists for: a compromised envelope store
   * buys a refused send rather than this app mailing a genuine, branded link
   * into somebody else's origin. See §13.12.
   */
  it("refuses a URL this deployment could not have produced", () => {
    expect(parseEmailJob({ ...job, url: "https://attacker.example/verify-email?token=abc" }, configured)).toBeNull();
  });

  it("refuses a URL that is not a URL", () => {
    expect(parseEmailJob({ ...job, url: "javascript:alert(1)" }, configured)).toBeNull();
    expect(parseEmailJob({ ...job, url: "not a url" }, configured)).toBeNull();
  });
});

describe("mailableOrigin", () => {
  it("pins to BETTER_AUTH_URL's origin when one is configured", () => {
    const env = { NODE_ENV: "production", BETTER_AUTH_URL: site } as NodeJS.ProcessEnv;
    expect(mailableOrigin(`${site}/verify-email`, env)).toBe(true);
    expect(mailableOrigin("https://openhabits.app.attacker.example/x", env)).toBe(false);
    expect(mailableOrigin("http://openhabits.app/x", env)).toBe(false);
  });

  it("accepts any host on the allow-list, and refuses the rest", () => {
    const env = {
      NODE_ENV: "production",
      BETTER_AUTH_ALLOWED_HOSTS: "openhabits.app, *.vercel.app",
    } as NodeJS.ProcessEnv;
    expect(mailableOrigin("https://openhabits.app/x", env)).toBe(true);
    expect(mailableOrigin("https://habit-a.vercel.app/x", env)).toBe(true);
    expect(mailableOrigin("https://attacker.example/x", env)).toBe(false);
  });

  /** A wildcard is matched at the label boundary, not as a suffix of the string. */
  it("does not let a wildcard admit a lookalike host or the bare apex", () => {
    const env = { NODE_ENV: "production", BETTER_AUTH_ALLOWED_HOSTS: "*.vercel.app" } as NodeJS.ProcessEnv;
    expect(mailableOrigin("https://evilvercel.app/x", env)).toBe(false);
    expect(mailableOrigin("https://vercel.app/x", env)).toBe(false);
  });

  /** `resolveBaseURL` forces https on the allow-list path; so does this. */
  it("refuses plain http against an allow-list", () => {
    const env = { NODE_ENV: "production", BETTER_AUTH_ALLOWED_HOSTS: "openhabits.app" } as NodeJS.ProcessEnv;
    expect(mailableOrigin("http://openhabits.app/x", env)).toBe(false);
  });

  it("allows only localhost when neither is set, and only outside production", () => {
    const dev = { NODE_ENV: "development" } as NodeJS.ProcessEnv;
    expect(mailableOrigin("http://localhost:3000/verify-email", dev)).toBe(true);
    expect(mailableOrigin("https://attacker.example/x", dev)).toBe(false);
    expect(mailableOrigin("http://localhost:3000/x", { NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(
      false,
    );
  });
});
