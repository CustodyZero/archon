/**
 * Archon Runtime Host — Session Context (ACM-001)
 *
 * A session represents a single process lifetime (one CLI invocation, one
 * desktop launch). The session_id is generated fresh at each launch and is
 * used in all emitted event envelopes to correlate events within a session.
 *
 * Sessions are NOT loaded from disk — they are always created fresh.
 * On clean shutdown, endSession() writes the completed session record to:
 *   <archonDir>/sessions/<session_id>.json
 *
 * This provides a historical audit trail of operator sessions without
 * requiring upfront disk writes that could fail.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ulid } from '../logging/ulid.js';
import type { DeviceContext } from './device.js';
import type { UserContext } from './user.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-process session identity. Created fresh at each process launch. */
export interface SessionContext {
  /** ULID generated at session start. Unique per process lifetime. */
  readonly session_id: string;
  /** The device running this session. */
  readonly device_id: string;
  /** The user running this session. */
  readonly user_id: string;
  /** ISO 8601 timestamp when the session was created (process start). */
  readonly started_at: string;
  /** ISO 8601 timestamp when the session ended. Set by endSession(). */
  ended_at?: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new session for the current process lifetime.
 *
 * Pure function — no I/O. The session record is written to disk only when
 * endSession() is called on clean shutdown.
 *
 * @param device - Stable device context for the current machine
 * @param user - Stable user context for the current OS user
 * @returns New session with a fresh ULID session_id
 */
export function createSession(device: DeviceContext, user: UserContext): SessionContext {
  return {
    session_id: ulid(),
    device_id: device.device_id,
    user_id: user.user_id,
    started_at: new Date().toISOString(),
  };
}

/**
 * Record session end and persist the completed session to disk.
 *
 * Writes `<archonDir>/sessions/<session_id>.json` with the ended_at timestamp.
 * Called on clean shutdown (SIGINT in CLI, app.on('will-quit') in desktop).
 *
 * If the write fails (e.g. disk full), the error is silently suppressed —
 * a missing session record is not a governance invariant violation.
 *
 * @param session - The session to close
 * @param archonDir - Archon home directory (from getArchonDir())
 */
export function endSession(session: SessionContext, archonDir: string): void {
  try {
    const sessionsDir = join(archonDir, 'sessions');
    mkdirSync(sessionsDir, { recursive: true });

    const completed: SessionContext = {
      ...session,
      ended_at: new Date().toISOString(),
    };

    writeFileSync(
      join(sessionsDir, `${session.session_id}.json`),
      JSON.stringify(completed, null, 2),
      'utf-8',
    );
  } catch {
    // Best-effort: session record is informational, not a governance invariant.
  }
}
