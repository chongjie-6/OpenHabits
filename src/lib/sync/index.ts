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
