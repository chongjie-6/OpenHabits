/**
 * Sync — the seam, not yet the implementation.
 *
 * Replication is a later pass. What matters now is that the rest of the app asks
 * *one* question ("is sync available?") and gets a calm answer, so nothing
 * downstream has to distinguish "no server configured" from "server broken".
 * Both are simply off, and off is a supported state.
 *
 * The data model is already replication-ready: every record carries `updatedAt`
 * and `deletedAt`, entries use the natural key `habitId:date`, and `meta` holds a
 * `deviceId` and a `lastPulledSeq` cursor. Adding push/pull is a new file here,
 * not a migration of what is already on people's devices.
 *
 * ## The constraint any implementation has to meet
 *
 * **Sync is end-to-end encrypted, or it does not ship.** This is a settled
 * decision, written down here because this is the file that would break it.
 *
 * The promise on the front of this project is that your habits stay on your
 * device. A server that can read them retires that sentence, and no privacy
 * policy puts it back. So the server is a relay for ciphertext it cannot open:
 *
 *   - Records are encrypted on the device before they are pushed. The key is
 *     derived from the account passphrase and never leaves the device.
 *   - The server stores opaque blobs against `(accountId, seq)` and hands back
 *     everything after a cursor. It sorts and counts; it never inspects.
 *   - Conflict resolution therefore has to happen on the client, which the
 *     existing last-write-wins merge in `backup.ts` already does — that merge is
 *     the sync algorithm, and it runs on plaintext, after the pull is decrypted.
 *   - A lost passphrase means lost server data. Export stays the real backup, and
 *     the UI has to say so before anyone relies on the cloud copy.
 *
 * This costs a key-derivation flow and rules out server-side features that need
 * to read content (web push whose payload names a habit, for one — the push has
 * to be contentless and let the device fill in the text). That is the trade, and
 * it is worth it: encryption is far cheaper to design in now than to retrofit
 * onto an account system people are already using.
 */

export interface SyncStatus {
  available: boolean
  /** Plain-English explanation, shown to the user as-is. */
  reason: string
  lastSyncedAt: number | null
}

/**
 * Whether a sync endpoint is configured for this build.
 *
 * Reads a build-time variable rather than probing the network, so an offline
 * device never sits waiting on a request to decide what to render.
 */
export function syncStatus(): SyncStatus {
  const endpoint = import.meta.env.VITE_SYNC_URL as string | undefined

  if (!endpoint) {
    return {
      available: false,
      reason: 'No sync server is configured for this build.',
      lastSyncedAt: null,
    }
  }

  return {
    available: false,
    reason: 'Accounts are not enabled yet in this version.',
    lastSyncedAt: null,
  }
}
