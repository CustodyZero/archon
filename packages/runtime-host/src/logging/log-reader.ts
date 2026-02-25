/**
 * Archon Runtime Host — LogReader
 *
 * Pure function for reading JSONL log files with dedupe-on-read.
 * Accepts raw JSONL text (string) and returns a structured LogReadResult.
 *
 * Guarantees:
 *   LOGR-U1: parse all valid JSONL events; drop malformed lines (counted in parseErrors)
 *   LOGR-U2: deduplicate events by event_id — first-seen wins; later occurrences counted in duplicates
 *   LOGR-U3: detect partial trailing line — content not ending with '\n'; last line dropped + flagged
 *   LOGR-U4: detect out-of-order events — > 1 consecutive timestamp regressions in file order
 *   LOGR-U5: output events are sorted by (timestamp asc, event_id asc)
 *   LOGR-U6: empty input returns empty result with zero stats
 *
 * This function has no I/O. Callers obtain raw content via StateIO.readLogRaw().
 *
 * @see docs/specs/architecture.md §P6 (Portability Integrity + Sync Conflict Posture)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single parsed log event from a JSONL log file.
 *
 * All fields beyond event_id are optional — different log files use different schemas.
 * The index signature allows callers to access any field without casting.
 */
export interface LogEvent {
  /** 26-character ULID (Crockford Base32) — the deduplication key. */
  event_id: string;
  /** ISO 8601 timestamp. Used for ordering and drift detection. */
  timestamp?: string;
  /** Project scope identifier. */
  project_id?: string;
  /** Rule snapshot hash at the time of the event. Used for drift detection. */
  rs_hash?: string;
  /** Event type identifier. Used for proposal state conflict detection. */
  event_type?: string;
  /** Proposal identifier. Used for proposal state conflict detection. */
  proposal_id?: string;
  /** Additional event-specific fields. */
  [key: string]: unknown;
}

/**
 * Statistics collected during log reading.
 *
 * All counts reflect the raw file content before deduplication and sorting.
 */
export interface LogReadStats {
  /** Number of non-empty lines processed (before filtering). */
  totalLines: number;
  /** Number of events successfully parsed and included in output (after dedup). */
  parsedEvents: number;
  /** Number of events dropped because their event_id was already seen. */
  duplicates: number;
  /** Number of lines dropped due to JSON parse error or missing event_id. */
  parseErrors: number;
  /**
   * True if the raw content did not end with '\n'.
   * Indicates a potentially mid-write truncation — the last line was dropped.
   */
  partialTrailingLine: boolean;
  /**
   * True if > 1 consecutive timestamp regression was detected in file order.
   * A single regression is permitted (clock skew); > 1 suggests reordering.
   */
  outOfOrder: boolean;
}

/** The result of reading and processing a JSONL log file. */
export interface LogReadResult {
  /** Deduplicated, time-sorted events. */
  events: ReadonlyArray<LogEvent>;
  /** Raw statistics about the file content. */
  stats: LogReadStats;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Parse, deduplicate, and sort a JSONL log file given its raw text content.
 *
 * Pure function — no I/O. Call StateIO.readLogRaw() to obtain the rawContent.
 *
 * @param rawContent - Raw JSONL text content of the log file
 * @returns Deduplicated, sorted events with collection statistics
 */
export function readLog(rawContent: string): LogReadResult {
  // Empty content — short-circuit
  if (rawContent.length === 0) {
    return {
      events: [],
      stats: {
        totalLines: 0,
        parsedEvents: 0,
        duplicates: 0,
        parseErrors: 0,
        partialTrailingLine: false,
        outOfOrder: false,
      },
    };
  }

  // Partial trailing line: raw content does not end with '\n'
  // The last element after split is an incomplete JSON object — drop it.
  const partialTrailingLine = !rawContent.endsWith('\n');

  const rawLines = rawContent.split('\n');

  // Build the list of lines to process:
  //   - Partial case: drop the last element (incomplete line), filter empty
  //   - Normal case: filter empty (trailing '\n' produces empty element at end)
  const lineList: string[] = partialTrailingLine
    ? rawLines.slice(0, -1).filter((l) => l.length > 0)
    : rawLines.filter((l) => l.length > 0);

  const totalLines = lineList.length;
  let parsedEvents = 0;
  let duplicates = 0;
  let parseErrors = 0;

  // First-seen deduplication: Map<event_id, LogEvent>
  const seen = new Map<string, LogEvent>();
  // Ordered list: insertion order = file order (before sort)
  const orderedEvents: LogEvent[] = [];

  for (const line of lineList) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      parseErrors++;
      continue;
    }

    // Must be a non-null object with a string event_id
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('event_id' in parsed) ||
      typeof (parsed as Record<string, unknown>)['event_id'] !== 'string'
    ) {
      parseErrors++;
      continue;
    }

    const event = parsed as LogEvent;
    const id = event.event_id;

    if (seen.has(id)) {
      duplicates++;
    } else {
      seen.set(id, event);
      orderedEvents.push(event);
      parsedEvents++;
    }
  }

  // Out-of-order detection: count consecutive timestamp regressions in file order.
  // A single regression is tolerated (clock skew); > 1 suggests reordering.
  let regressions = 0;
  for (let i = 1; i < orderedEvents.length; i++) {
    const prev = orderedEvents[i - 1]!.timestamp;
    const curr = orderedEvents[i]!.timestamp;
    if (prev !== undefined && curr !== undefined && curr < prev) {
      regressions++;
    }
  }
  const outOfOrder = regressions > 1;

  // Sort output: timestamp asc, event_id asc as tiebreaker
  const sorted = [...orderedEvents].sort((a, b) => {
    const ta = a.timestamp ?? '';
    const tb = b.timestamp ?? '';
    if (ta < tb) return -1;
    if (ta > tb) return 1;
    if (a.event_id < b.event_id) return -1;
    if (a.event_id > b.event_id) return 1;
    return 0;
  });

  return {
    events: sorted,
    stats: {
      totalLines,
      parsedEvents,
      duplicates,
      parseErrors,
      partialTrailingLine,
      outOfOrder,
    },
  };
}
