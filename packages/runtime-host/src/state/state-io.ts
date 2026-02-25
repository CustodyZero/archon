/**
 * Archon Runtime Host — StateIO Interface
 *
 * A project-scoped, injectable I/O abstraction for reading/writing JSON state
 * files and appending to JSONL log files.
 *
 * Two implementations are provided:
 *   - FileStateIO   — durable file I/O under a specific project directory
 *   - MemoryStateIO — in-memory I/O for tests and embedded (non-persistent) use
 *
 * All registries and stateful classes inject StateIO rather than calling
 * readJsonState/writeJsonState from the global store. This ensures project
 * isolation: each project has its own StateIO bound to its directory, so
 * two projects cannot read or write each other's state.
 *
 * @see docs/specs/architecture.md §P4 (project scoping)
 * @see docs/specs/formal_governance.md §5 (I1: deny-by-default; I4: determinism)
 */

import { mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// StateIO Interface
// ---------------------------------------------------------------------------

/**
 * A project-scoped I/O abstraction for reading, writing, and appending state.
 *
 * All file paths are relative filenames — the StateIO implementation resolves
 * them to the correct project-specific absolute path. Callers never construct
 * absolute paths directly.
 *
 * Invariants:
 * - readJson and writeJson address the `state/` subdirectory of the project
 * - appendLine addresses the `logs/` subdirectory of the project
 * - Files from one StateIO instance cannot be accessed from another
 *
 * Implementations:
 *   FileStateIO   — durable file I/O under a project directory
 *   MemoryStateIO — in-memory I/O for unit tests and embedded use
 */
export interface StateIO {
  /**
   * Read a JSON file and parse it.
   *
   * Returns `fallback` if the file does not exist or cannot be parsed.
   * Type parameter T is trusted — callers are responsible for schema
   * compatibility of persisted JSON.
   *
   * @param filename - Filename within the state subdirectory (e.g. 'enabled-modules.json')
   * @param fallback - Value to return if the file is absent or unreadable
   */
  readJson<T>(filename: string, fallback: T): T;

  /**
   * Serialize a value as JSON and write it to a file.
   *
   * Creates the state subdirectory if it does not exist.
   * Overwrites any existing file at the given path.
   *
   * @param filename - Filename within the state subdirectory
   * @param value - Value to serialize and persist
   */
  writeJson<T>(filename: string, value: T): void;

  /**
   * Append a line to a log file.
   *
   * Creates the logs subdirectory if it does not exist.
   * A newline character is appended after the line content.
   *
   * @param logfilename - Filename within the logs subdirectory (e.g. 'decisions.jsonl')
   * @param line - Line content to append (without trailing newline)
   */
  appendLine(logfilename: string, line: string): void;

  /**
   * Return the raw text content of a log file.
   *
   * Returns an empty string if the file does not exist.
   * Content is returned as-is (no parsing). Used by LogReader for
   * dedupe-on-read and drift detection (P6).
   *
   * @param logfilename - Filename within the logs subdirectory (e.g. 'decisions.jsonl')
   */
  readLogRaw(logfilename: string): string;
}

// ---------------------------------------------------------------------------
// FileStateIO
// ---------------------------------------------------------------------------

/**
 * Durable file-system StateIO implementation for a specific project directory.
 *
 * Reads JSON state from  `<projectDir>/state/<filename>`.
 * Writes JSON state to   `<projectDir>/state/<filename>`.
 * Appends log lines to   `<projectDir>/logs/<logfilename>`.
 *
 * All directory creation is on-demand (recursive mkdir).
 * Synchronous I/O matches the CLI's single-process, synchronous design.
 * Error handling follows the same pattern as the legacy store.ts:
 *   ENOENT and SyntaxError are recoverable (return fallback).
 *   Other I/O errors are rethrown (operator must address them).
 */
export class FileStateIO implements StateIO {
  constructor(private readonly projectDir: string) {}

  readJson<T>(filename: string, fallback: T): T {
    const filePath = join(this.projectDir, 'state', filename);
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

  writeJson<T>(filename: string, value: T): void {
    const subDir = join(this.projectDir, 'state');
    mkdirSync(subDir, { recursive: true });
    const filePath = join(subDir, filename);
    writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf-8');
  }

  appendLine(logfilename: string, line: string): void {
    const logsDir = join(this.projectDir, 'logs');
    mkdirSync(logsDir, { recursive: true });
    const logPath = join(logsDir, logfilename);
    appendFileSync(logPath, line + '\n', 'utf-8');
  }

  readLogRaw(logfilename: string): string {
    const logPath = join(this.projectDir, 'logs', logfilename);
    try {
      return readFileSync(logPath, 'utf-8');
    } catch (err: unknown) {
      if (isNodeError(err, 'ENOENT')) {
        return '';
      }
      throw err;
    }
  }
}

// ---------------------------------------------------------------------------
// MemoryStateIO
// ---------------------------------------------------------------------------

/**
 * In-memory StateIO implementation.
 *
 * Stores state in a Map<string, unknown> and log lines in a Map<string, string[]>.
 * No file system access. Suitable for unit tests and embedded, non-persistent use.
 *
 * Isolation guarantee: multiple instances are completely isolated from each other,
 * matching the isolation guarantee of FileStateIO instances in separate directories.
 *
 * readJson round-trips through JSON serialization to match FileStateIO semantics
 * (e.g. undefined values become null, Dates become strings).
 */
export class MemoryStateIO implements StateIO {
  private readonly store: Map<string, unknown> = new Map();
  private readonly logs: Map<string, string[]> = new Map();

  readJson<T>(filename: string, fallback: T): T {
    if (!this.store.has(filename)) {
      return fallback;
    }
    return this.store.get(filename) as T;
  }

  writeJson<T>(filename: string, value: T): void {
    // Round-trip through JSON to match FileStateIO serialization semantics.
    // This ensures tests catch serialization issues (undefined → null, etc.).
    this.store.set(filename, JSON.parse(JSON.stringify(value)) as unknown);
  }

  appendLine(logfilename: string, line: string): void {
    const lines = this.logs.get(logfilename) ?? [];
    lines.push(line);
    this.logs.set(logfilename, lines);
  }

  /**
   * Return all lines appended to a log file.
   *
   * This method is specific to MemoryStateIO — it is not part of the StateIO
   * interface. Use it in tests to verify audit output without touching the
   * file system.
   *
   * @param logfilename - Log filename (e.g. 'decisions.jsonl')
   */
  readLines(logfilename: string): ReadonlyArray<string> {
    return this.logs.get(logfilename) ?? [];
  }

  readLogRaw(logfilename: string): string {
    const lines = this.logs.get(logfilename) ?? [];
    if (lines.length === 0) return '';
    // Match FileStateIO: each appendLine call adds 'line\n', so raw content is 'a\nb\n'
    return lines.join('\n') + '\n';
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Narrow an unknown error to a Node.js errno exception with a specific code. */
function isNodeError(err: unknown, code: string): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === code
  );
}
