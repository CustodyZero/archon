/**
 * Archon Runtime Host — User Context (ACM-001)
 *
 * Provides a stable per-user identifier. The user_id persists across sessions
 * on the same machine and is used in every emitted event envelope.
 *
 * State layout:
 *   <archonDir>/user.json   — { user_id: string; created_at: string }
 *
 * Idempotent: if user.json already exists, the existing user_id is returned.
 * If it does not exist, a new ULID is generated and written.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ulid } from '../logging/ulid.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Stable per-user identity on a single machine. */
export interface UserContext {
  /** ULID generated once per user account. Never changes after first creation. */
  readonly user_id: string;
  /** ISO 8601 timestamp of user registration. */
  readonly created_at: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the existing user context or create it on first run.
 *
 * Reads `<archonDir>/user.json`. If the file does not exist or cannot be
 * parsed, generates a new user_id (ULID) and writes the file.
 *
 * @param archonDir - Archon home directory (from getArchonDir())
 * @returns Stable user context for the current OS user
 */
export function loadOrCreateUser(archonDir: string): UserContext {
  const userPath = join(archonDir, 'user.json');

  try {
    const raw = readFileSync(userPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'user_id' in parsed &&
      typeof (parsed as Record<string, unknown>)['user_id'] === 'string'
    ) {
      return parsed as UserContext;
    }
  } catch {
    // File missing or unparseable — create a new user record below.
  }

  const user: UserContext = {
    user_id: ulid(),
    created_at: new Date().toISOString(),
  };

  mkdirSync(archonDir, { recursive: true });
  writeFileSync(userPath, JSON.stringify(user, null, 2), 'utf-8');
  return user;
}
