#!/usr/bin/env tsx
/**
 * Archon Factory — Baseline Loader (READ-ONLY)
 *
 * Loads factory/baseline.json and exposes baseline surfaces.
 * This is an initialization-only reader. It does NOT:
 *   - Create packets
 *   - Create completion records
 *   - Mark anything as completed
 *   - Mutate baseline.json
 *   - Generate packet history
 *
 * Usage:
 *   npx tsx tools/factory/load-baseline.ts              # print summary
 *   npx tsx tools/factory/load-baseline.ts --json        # print full JSON
 *   npx tsx tools/factory/load-baseline.ts --followup    # list surfaces needing governed work
 *
 * @see archon-factory-baseline.md §5 (Baseline Limitations)
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Classification =
  | 'baseline_present'
  | 'baseline_needs_governed_followup'
  | 'baseline_out_of_scope_for_v0.1';

interface Surface {
  readonly id: string;
  readonly name: string;
  readonly classification: Classification;
  readonly notes: string;
}

interface Baseline {
  readonly version: string;
  readonly created_at: string;
  readonly repo_commit: string;
  readonly repo_branch: string;
  readonly note: string;
  readonly surfaces: ReadonlyArray<Surface>;
}

// ---------------------------------------------------------------------------
// Loader (pure read)
// ---------------------------------------------------------------------------

function loadBaseline(): Baseline {
  const baselinePath = join(process.cwd(), 'factory', 'baseline.json');

  if (!existsSync(baselinePath)) {
    console.error('ERROR: factory/baseline.json not found.');
    console.error('The factory baseline has not been initialized.');
    process.exit(1);
  }

  const raw = readFileSync(baselinePath, 'utf-8');
  const data: unknown = JSON.parse(raw);

  // Minimal structural check (not full schema validation — that is validate.ts's job)
  if (
    data == null ||
    typeof data !== 'object' ||
    !('version' in data) ||
    !('surfaces' in data) ||
    !Array.isArray((data as Record<string, unknown>)['surfaces'])
  ) {
    console.error('ERROR: factory/baseline.json has invalid structure.');
    process.exit(1);
  }

  return data as Baseline;
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function surfacesByClassification(
  baseline: Baseline,
  classification: Classification,
): ReadonlyArray<Surface> {
  return baseline.surfaces.filter((s) => s.classification === classification);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function main(): void {
  const baseline = loadBaseline();

  const present = surfacesByClassification(baseline, 'baseline_present');
  const followup = surfacesByClassification(baseline, 'baseline_needs_governed_followup');
  const outOfScope = surfacesByClassification(baseline, 'baseline_out_of_scope_for_v0.1');

  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(baseline, null, 2) + '\n');
    return;
  }

  if (process.argv.includes('--followup')) {
    console.log('Surfaces requiring governed followup for v0.1:');
    console.log('');
    for (const s of followup) {
      console.log(`  ${s.id}: ${s.name}`);
      console.log(`    ${s.notes}`);
      console.log('');
    }
    console.log(`Total: ${followup.length} surface(s)`);
    return;
  }

  // Default: summary
  console.log('Archon Factory Baseline');
  console.log('=======================');
  console.log(`  Version:    ${baseline.version}`);
  console.log(`  Commit:     ${baseline.repo_commit.slice(0, 12)}`);
  console.log(`  Branch:     ${baseline.repo_branch}`);
  console.log(`  Created:    ${baseline.created_at}`);
  console.log('');
  console.log(`  Total surfaces:              ${baseline.surfaces.length}`);
  console.log(`  baseline_present:            ${present.length}`);
  console.log(`  needs_governed_followup:     ${followup.length}`);
  console.log(`  out_of_scope_for_v0.1:       ${outOfScope.length}`);
  console.log('');
  console.log(`  NOTE: ${baseline.note}`);
}

main();
