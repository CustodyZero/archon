/**
 * archon log — Query decision log
 *
 * Reads the project's persisted decision log (decisions.jsonl) and
 * displays entries with optional filters.
 *
 * The log is read from disk via StateIO + LogReader, not from the
 * in-memory DecisionLogger (which only holds entries from the current
 * process). This means the command works across sessions — any decision
 * ever recorded for the active project is queryable.
 *
 * @see docs/specs/architecture.md §6 (logging and replay)
 */

import { Command } from 'commander';
import type { LogEvent } from '@archon/runtime-host';
import { readLog } from '@archon/runtime-host';

// Lazy import to avoid circular initialization — buildRuntime() is defined
// in demo.ts and shared across commands.
type BuildRuntime = typeof import('./demo.js')['buildRuntime'];

export const logCommand = new Command('log')
  .description('Query the decision log')
  .option('--agent <id>', 'Filter by agent ID')
  .option('--outcome <outcome>', 'Filter by outcome (Permit|Deny|Escalate)')
  .option('--since <iso-date>', 'Filter to entries after this ISO 8601 timestamp')
  .option('--until <iso-date>', 'Filter to entries before this ISO 8601 timestamp')
  .option('--json', 'Output as JSON array')
  .option('--limit <n>', 'Maximum number of entries to return', '100')
  .option('--offset <n>', 'Number of entries to skip', '0')
  .action(async (options: {
    agent?: string;
    outcome?: string;
    since?: string;
    until?: string;
    json?: boolean;
    limit?: string;
    offset?: string;
  }) => {
    // Lazy import: buildRuntime has side effects (disk I/O, project resolution)
    // and must not execute at module load time.
    const { buildRuntime } = await import('./demo.js') as { buildRuntime: BuildRuntime };
    const { stateIO } = buildRuntime();

    // Read raw JSONL from project's decisions.jsonl
    let rawContent: string;
    try {
      rawContent = stateIO.readLogRaw('decisions.jsonl');
    } catch {
      // No log file yet — empty result
      rawContent = '';
    }

    const { events, stats } = readLog(rawContent);

    // Apply filters (AND semantics)
    let filtered: ReadonlyArray<LogEvent> = events;

    if (options.agent !== undefined) {
      const agentId = options.agent;
      filtered = filtered.filter((e) =>
        e.agent_id === agentId || (e as Record<string, unknown>)['agentId'] === agentId,
      );
    }

    if (options.outcome !== undefined) {
      const outcome = options.outcome;
      filtered = filtered.filter((e) =>
        e['decision'] === outcome || (e as Record<string, unknown>)['decision'] === outcome,
      );
    }

    if (options.since !== undefined) {
      const since = options.since;
      filtered = filtered.filter((e) =>
        e.timestamp !== undefined && e.timestamp >= since,
      );
    }

    if (options.until !== undefined) {
      const until = options.until;
      filtered = filtered.filter((e) =>
        e.timestamp !== undefined && e.timestamp <= until,
      );
    }

    // Pagination
    const limit = parseInt(options.limit ?? '100', 10);
    const offset = parseInt(options.offset ?? '0', 10);
    const paginated = filtered.slice(offset, offset + limit);

    // Output
    if (options.json === true) {
      process.stdout.write(JSON.stringify(paginated, null, 2) + '\n');
    } else {
      if (paginated.length === 0) {
        console.log('No decision log entries match the given filters.');
        console.log(`  Total entries in log: ${stats.parsedEvents}`);
        if (filtered.length !== events.length) {
          console.log(`  Entries matching filters: ${filtered.length}`);
        }
        process.exitCode = 1;
        return;
      }

      console.log(`Decision log: ${paginated.length} entries (of ${filtered.length} matching, ${stats.parsedEvents} total)\n`);

      for (const entry of paginated) {
        const decision = (entry as Record<string, unknown>)['decision'] ?? '?';
        const agentId = entry.agent_id ?? (entry as Record<string, unknown>)['agentId'] ?? '?';
        const capType = (entry as Record<string, unknown>)['capabilityType'] ?? '?';
        const ts = entry.timestamp ?? '?';
        const rsHash = entry.rs_hash ?? '?';

        const decisionStr = String(decision);
        const pad = decisionStr === 'Permit' ? '  ' : decisionStr === 'Deny' ? '    ' : '';

        console.log(`  ${String(ts)}  ${pad}${decisionStr}  ${String(capType)}  agent=${String(agentId)}  rs=${String(rsHash).slice(0, 12)}...`);
      }
      console.log('');
    }
  });
