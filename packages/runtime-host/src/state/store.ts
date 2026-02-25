/**
 * Archon Runtime Host — Legacy State Persistence Helpers
 *
 * Low-level helpers for reading and writing JSON state files relative to the
 * Archon state directory. These were the primary state I/O functions before
 * the P4 StateIO / project-scoping refactor.
 *
 * Active code paths now use StateIO (FileStateIO / MemoryStateIO) via the
 * project-store. These helpers are retained for any code that still uses the
 * legacy global state directory (e.g. migrateLegacyState in project-store.ts).
 *
 * Decision log and proposal event append functions have been removed — the
 * active path uses FileLogSink → StateIO.appendLine() and
 * ProposalQueue.appendProposalEvent() → StateIO.appendLine() respectively.
 *
 * @see packages/runtime-host/src/state/state-io.ts (active I/O abstraction)
 * @see packages/runtime-host/src/logging/file-log-sink.ts (active decision log)
 * @see docs/specs/architecture.md §3 (snapshot model)
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// State Directory
// ---------------------------------------------------------------------------

/**
 * Returns the resolved state directory path.
 *
 * Reads ARCHON_STATE_DIR from the environment. If unset, defaults to
 * `.archon/` in process.cwd(). All state files live under this directory.
 *
 * Note: new code should call getArchonDir() from project-store.ts, which
 * delegates to resolveArchonHome() and honors the full 5-level precedence chain.
 * This function is retained for legacy migration code only.
 */
export function getStateDir(): string {
  return process.env['ARCHON_STATE_DIR'] ?? join(process.cwd(), '.archon');
}

// ---------------------------------------------------------------------------
// JSON State I/O
// ---------------------------------------------------------------------------

/**
 * Read a JSON state file from the state directory.
 *
 * Returns `fallback` if the file does not exist or cannot be parsed.
 *
 * @param filename - Filename within the state subdirectory
 * @param fallback - Value to return if file is absent or unreadable
 */
export function readJsonState<T>(filename: string, fallback: T): T {
  const stateDir = getStateDir();
  const filePath = join(stateDir, 'state', filename);
  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    if (err instanceof SyntaxError || isNodeError(err, 'ENOENT')) {
      return fallback;
    }
    throw err;
  }
}

/**
 * Write a JSON state file to the state directory.
 *
 * Creates the state subdirectory if it does not exist.
 *
 * @param filename - Filename within the state subdirectory
 * @param value - Value to serialize and persist
 */
export function writeJsonState<T>(filename: string, value: T): void {
  const stateDir = getStateDir();
  const subDir = join(stateDir, 'state');
  mkdirSync(subDir, { recursive: true });
  const filePath = join(subDir, filename);
  writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isNodeError(err: unknown, code: string): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === code
  );
}
