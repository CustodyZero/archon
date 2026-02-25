/**
 * Archon Runtime Host — StateIO.readLogRaw Contract Tests
 *
 * Verifies the three-case readLogRaw() contract for both implementations:
 *
 *   SIO-U1: MemoryStateIO returns '' for a log file that has never been written
 *   SIO-U2: MemoryStateIO returns correct JSONL content (lines joined with '\n')
 *   SIO-U3: FileStateIO returns '' for a non-existent log file (ENOENT)
 *   SIO-U4: FileStateIO returns correct raw content for an existing log file
 *
 * readLogRaw() is the I/O bridge feeding the drift-detection path.
 * A correct contract here prevents silent failures in dedupe-on-read.
 *
 * Isolation: MemoryStateIO tests have no I/O. FileStateIO tests use temp dirs.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { realpath } from 'node:fs/promises';
import { MemoryStateIO, FileStateIO } from '../src/state/state-io.js';

// ---------------------------------------------------------------------------
// SIO-U1: MemoryStateIO — never written
// ---------------------------------------------------------------------------

describe('StateIO.readLogRaw — SIO-U1: MemoryStateIO returns empty string for unwritten log', () => {
  it('returns empty string when no lines have been appended', () => {
    const stateIO = new MemoryStateIO();
    expect(stateIO.readLogRaw('decisions.jsonl')).toBe('');
  });

  it('returns empty string for any filename that has not been written', () => {
    const stateIO = new MemoryStateIO();
    stateIO.appendLine('other.jsonl', 'some line');
    // decisions.jsonl was never written
    expect(stateIO.readLogRaw('decisions.jsonl')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// SIO-U2: MemoryStateIO — populated log
// ---------------------------------------------------------------------------

describe('StateIO.readLogRaw — SIO-U2: MemoryStateIO returns correct JSONL content', () => {
  it('returns lines joined with newlines and a terminal newline', () => {
    const stateIO = new MemoryStateIO();
    stateIO.appendLine('decisions.jsonl', '{"event_id":"A","v":1}');
    stateIO.appendLine('decisions.jsonl', '{"event_id":"B","v":2}');

    const raw = stateIO.readLogRaw('decisions.jsonl');

    // Matches what FileStateIO would produce: 'line1\nline2\n'
    expect(raw).toBe('{"event_id":"A","v":1}\n{"event_id":"B","v":2}\n');
  });

  it('single-line log ends with a terminal newline', () => {
    const stateIO = new MemoryStateIO();
    stateIO.appendLine('decisions.jsonl', '{"event_id":"A"}');

    expect(stateIO.readLogRaw('decisions.jsonl')).toBe('{"event_id":"A"}\n');
  });

  it('readLogRaw output is stable across repeated calls (no mutation)', () => {
    const stateIO = new MemoryStateIO();
    stateIO.appendLine('decisions.jsonl', '{"event_id":"A"}');

    const first = stateIO.readLogRaw('decisions.jsonl');
    const second = stateIO.readLogRaw('decisions.jsonl');

    expect(first).toBe(second);
  });
});

// ---------------------------------------------------------------------------
// SIO-U3: FileStateIO — ENOENT
// ---------------------------------------------------------------------------

describe('StateIO.readLogRaw — SIO-U3: FileStateIO returns empty string on ENOENT', () => {
  it('returns empty string when the log directory does not exist', async () => {
    const projectDir = await realpath(mkdtempSync(`${tmpdir()}/archon-sio-u3-`));
    const stateIO = new FileStateIO(projectDir);
    // logs/ subdirectory has not been created; file does not exist
    expect(stateIO.readLogRaw('decisions.jsonl')).toBe('');
  });

  it('returns empty string when the logs dir exists but the file does not', async () => {
    const projectDir = await realpath(mkdtempSync(`${tmpdir()}/archon-sio-u3b-`));
    mkdirSync(join(projectDir, 'logs'));
    const stateIO = new FileStateIO(projectDir);
    expect(stateIO.readLogRaw('decisions.jsonl')).toBe('');
  });
});

// ---------------------------------------------------------------------------
// SIO-U4: FileStateIO — existing log file
// ---------------------------------------------------------------------------

describe('StateIO.readLogRaw — SIO-U4: FileStateIO returns correct raw content', () => {
  it('returns exact file content including terminal newlines', async () => {
    const projectDir = await realpath(mkdtempSync(`${tmpdir()}/archon-sio-u4-`));
    const logsDir = join(projectDir, 'logs');
    mkdirSync(logsDir, { recursive: true });
    const expected = '{"event_id":"A"}\n{"event_id":"B"}\n';
    writeFileSync(join(logsDir, 'decisions.jsonl'), expected, 'utf-8');

    const stateIO = new FileStateIO(projectDir);
    expect(stateIO.readLogRaw('decisions.jsonl')).toBe(expected);
  });

  it('FileStateIO.appendLine followed by readLogRaw round-trips correctly', async () => {
    const projectDir = await realpath(mkdtempSync(`${tmpdir()}/archon-sio-u4b-`));
    const stateIO = new FileStateIO(projectDir);
    stateIO.appendLine('decisions.jsonl', '{"event_id":"A"}');
    stateIO.appendLine('decisions.jsonl', '{"event_id":"B"}');

    const raw = stateIO.readLogRaw('decisions.jsonl');

    // Must exactly match what MemoryStateIO would produce for the same sequence
    expect(raw).toBe('{"event_id":"A"}\n{"event_id":"B"}\n');
  });

  it('FileStateIO and MemoryStateIO readLogRaw produce identical output for same append sequence', async () => {
    const projectDir = await realpath(mkdtempSync(`${tmpdir()}/archon-sio-u4c-`));
    const fileIO = new FileStateIO(projectDir);
    const memIO = new MemoryStateIO();

    const lines = ['{"event_id":"X","v":1}', '{"event_id":"Y","v":2}', '{"event_id":"Z","v":3}'];
    for (const line of lines) {
      fileIO.appendLine('decisions.jsonl', line);
      memIO.appendLine('decisions.jsonl', line);
    }

    expect(fileIO.readLogRaw('decisions.jsonl')).toBe(memIO.readLogRaw('decisions.jsonl'));
  });
});
