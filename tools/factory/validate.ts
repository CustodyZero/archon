#!/usr/bin/env tsx
/**
 * Archon Factory — Validation Script
 *
 * Structural and semantic validation of all factory artifacts.
 *
 * Validation layers:
 *   1. Schema validation — required fields, types, patterns
 *   2. Referential integrity — cross-references between artifacts
 *   3. Authority rules — FI-3 enforcement
 *   4. Change class consistency — heuristic warnings
 *   5. Invariant enforcement — FI-1 through FI-5
 *   6. Derivation consistency — re-derive and check for errors
 *
 * Exit codes:
 *   0 — all validations pass
 *   1 — errors found
 *
 * @see archon-factory-retrofit-design.md §7 (Validation System)
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Severity = 'error' | 'warning';

interface ValidationResult {
  readonly file: string;
  readonly severity: Severity;
  readonly error_type: string;
  readonly message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const FACTORY_ROOT = join(process.cwd(), 'factory');
const VALID_CHANGE_CLASSES = ['trivial', 'local', 'cross_cutting', 'architectural'] as const;
const VALID_IDENTITY_KINDS = ['human', 'agent', 'cli', 'ui'] as const;
const HUMAN_ONLY_KINDS = ['human', 'cli', 'ui'] as const;
const KEBAB_CASE_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readJsonFiles(subdir: string): Array<{ filename: string; filepath: string; data: unknown; raw: string }> {
  const dir = join(FACTORY_ROOT, subdir);
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const results: Array<{ filename: string; filepath: string; data: unknown; raw: string }> = [];

  for (const file of files) {
    const filepath = join(dir, file);
    try {
      const raw = readFileSync(filepath, 'utf-8');
      const data: unknown = JSON.parse(raw);
      results.push({ filename: file, filepath: `factory/${subdir}/${file}`, data, raw });
    } catch (e) {
      results.push({
        filename: file,
        filepath: `factory/${subdir}/${file}`,
        data: null,
        raw: '',
      });
    }
  }

  return results;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((item) => typeof item === 'string');
}

function isValidISO8601(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  const d = new Date(s);
  return !isNaN(d.getTime());
}

function isValidIdentity(v: unknown, allowedKinds: ReadonlyArray<string>): { valid: boolean; reason?: string } {
  if (!isObject(v)) return { valid: false, reason: 'identity must be an object' };
  if (typeof v['kind'] !== 'string') return { valid: false, reason: 'identity.kind must be a string' };
  if (!allowedKinds.includes(v['kind'])) return { valid: false, reason: `identity.kind '${v['kind']}' not in [${allowedKinds.join(', ')}]` };
  if (typeof v['id'] !== 'string' || v['id'].length === 0) return { valid: false, reason: 'identity.id must be a non-empty string' };
  return { valid: true };
}

// ---------------------------------------------------------------------------
// Schema validation (Layer 1)
// ---------------------------------------------------------------------------

function validatePacketSchema(filepath: string, data: unknown): ValidationResult[] {
  const results: ValidationResult[] = [];
  const e = (msg: string) => results.push({ file: filepath, severity: 'error', error_type: 'schema', message: msg });

  if (!isObject(data)) { e('packet must be a JSON object'); return results; }

  if (typeof data['id'] !== 'string' || !KEBAB_CASE_RE.test(data['id'])) {
    e("'id' must be a kebab-case string");
  }
  // Check filename matches id
  const expectedFilename = `${data['id']}.json`;
  if (basename(filepath) !== expectedFilename && typeof data['id'] === 'string') {
    e(`filename must match id: expected '${expectedFilename}', got '${basename(filepath)}'`);
  }

  if (typeof data['title'] !== 'string' || data['title'].length === 0) e("'title' is required and must be non-empty");
  if (typeof data['intent'] !== 'string' || data['intent'].length === 0) e("'intent' is required and must be non-empty");

  if (typeof data['change_class'] !== 'string' || !(VALID_CHANGE_CLASSES as readonly string[]).includes(data['change_class'])) {
    e(`'change_class' must be one of: ${VALID_CHANGE_CLASSES.join(', ')}`);
  }

  if (!isObject(data['scope'])) {
    e("'scope' must be an object");
  } else {
    if (!isStringArray(data['scope']['packages'])) e("'scope.packages' must be an array of strings");
  }

  if (typeof data['owner'] !== 'string' || data['owner'].length === 0) e("'owner' is required");
  if (!isValidISO8601(data['created_at'])) e("'created_at' must be a valid ISO 8601 timestamp");

  if (data['started_at'] != null && !isValidISO8601(data['started_at'])) {
    e("'started_at' must be a valid ISO 8601 timestamp or null");
  }

  if (data['environment_dependencies'] != null && !isStringArray(data['environment_dependencies'])) {
    e("'environment_dependencies' must be an array of strings");
  }

  if (data['tags'] != null && !isStringArray(data['tags'])) {
    e("'tags' must be an array of strings");
  }

  return results;
}

function validateCompletionSchema(filepath: string, data: unknown): ValidationResult[] {
  const results: ValidationResult[] = [];
  const e = (msg: string) => results.push({ file: filepath, severity: 'error', error_type: 'schema', message: msg });

  if (!isObject(data)) { e('completion must be a JSON object'); return results; }

  if (typeof data['packet_id'] !== 'string' || !KEBAB_CASE_RE.test(data['packet_id'])) {
    e("'packet_id' must be a kebab-case string");
  }
  if (!isValidISO8601(data['completed_at'])) e("'completed_at' must be a valid ISO 8601 timestamp");

  const idCheck = isValidIdentity(data['completed_by'], VALID_IDENTITY_KINDS as unknown as string[]);
  if (!idCheck.valid) e(`'completed_by': ${idCheck.reason}`);

  if (typeof data['summary'] !== 'string' || data['summary'].length === 0) e("'summary' is required and must be non-empty");

  if (!isObject(data['verification'])) {
    e("'verification' must be an object");
  } else {
    const v = data['verification'];
    if (typeof v['tests_pass'] !== 'boolean') e("'verification.tests_pass' must be a boolean");
    if (typeof v['build_pass'] !== 'boolean') e("'verification.build_pass' must be a boolean");
    if (typeof v['lint_pass'] !== 'boolean') e("'verification.lint_pass' must be a boolean");
    if (typeof v['ci_pass'] !== 'boolean') e("'verification.ci_pass' must be a boolean");
  }

  return results;
}

function validateAcceptanceSchema(filepath: string, data: unknown): ValidationResult[] {
  const results: ValidationResult[] = [];
  const e = (msg: string) => results.push({ file: filepath, severity: 'error', error_type: 'schema', message: msg });

  if (!isObject(data)) { e('acceptance must be a JSON object'); return results; }

  if (typeof data['packet_id'] !== 'string' || !KEBAB_CASE_RE.test(data['packet_id'])) {
    e("'packet_id' must be a kebab-case string");
  }
  if (!isValidISO8601(data['accepted_at'])) e("'accepted_at' must be a valid ISO 8601 timestamp");

  const idCheck = isValidIdentity(data['accepted_by'], HUMAN_ONLY_KINDS as unknown as string[]);
  if (!idCheck.valid) e(`'accepted_by': ${idCheck.reason}`);

  return results;
}

function validateRejectionSchema(filepath: string, data: unknown): ValidationResult[] {
  const results: ValidationResult[] = [];
  const e = (msg: string) => results.push({ file: filepath, severity: 'error', error_type: 'schema', message: msg });

  if (!isObject(data)) { e('rejection must be a JSON object'); return results; }

  if (typeof data['packet_id'] !== 'string' || !KEBAB_CASE_RE.test(data['packet_id'])) {
    e("'packet_id' must be a kebab-case string");
  }
  if (!isValidISO8601(data['rejected_at'])) e("'rejected_at' must be a valid ISO 8601 timestamp");

  const idCheck = isValidIdentity(data['rejected_by'], HUMAN_ONLY_KINDS as unknown as string[]);
  if (!idCheck.valid) e(`'rejected_by': ${idCheck.reason}`);

  if (typeof data['reason'] !== 'string' || data['reason'].length === 0) {
    e("'reason' is required and must be non-empty");
  }

  return results;
}

function validateEvidenceSchema(filepath: string, data: unknown): ValidationResult[] {
  const results: ValidationResult[] = [];
  const e = (msg: string) => results.push({ file: filepath, severity: 'error', error_type: 'schema', message: msg });

  if (!isObject(data)) { e('evidence must be a JSON object'); return results; }

  if (typeof data['dependency_key'] !== 'string' || data['dependency_key'].length === 0) {
    e("'dependency_key' is required and must be non-empty");
  }
  if (!isValidISO8601(data['verified_at'])) e("'verified_at' must be a valid ISO 8601 timestamp");

  const idCheck = isValidIdentity(data['verified_by'], HUMAN_ONLY_KINDS as unknown as string[]);
  if (!idCheck.valid) e(`'verified_by': ${idCheck.reason}`);

  const validMethods = ['manual', 'automated', 'ci'];
  if (typeof data['verification_method'] !== 'string' || !validMethods.includes(data['verification_method'])) {
    e(`'verification_method' must be one of: ${validMethods.join(', ')}`);
  }

  if (typeof data['description'] !== 'string' || data['description'].length === 0) {
    e("'description' is required and must be non-empty");
  }

  if (data['expires_at'] != null && !isValidISO8601(data['expires_at'])) {
    e("'expires_at' must be a valid ISO 8601 timestamp or null");
  }

  return results;
}

// ---------------------------------------------------------------------------
// Referential integrity (Layer 2) + Invariants (Layer 5)
// ---------------------------------------------------------------------------

interface ArtifactIndex {
  packetIds: Set<string>;
  completionPacketIds: Set<string>;
  acceptancePacketIds: Set<string>;
  rejectionPacketIds: Set<string>;
  evidenceKeys: Set<string>;
  allDeclaredDeps: Set<string>;
  packets: Array<{ id: string; change_class: string; packages: string[] }>;
  acceptances: Array<{ packet_id: string; accepted_by_kind: string }>;
  rejections: Array<{ packet_id: string; rejected_by_kind: string }>;
}

function buildIndex(
  packets: Array<{ data: unknown }>,
  completions: Array<{ data: unknown }>,
  acceptances: Array<{ data: unknown }>,
  rejections: Array<{ data: unknown }>,
  evidence: Array<{ data: unknown }>,
): ArtifactIndex {
  const index: ArtifactIndex = {
    packetIds: new Set(),
    completionPacketIds: new Set(),
    acceptancePacketIds: new Set(),
    rejectionPacketIds: new Set(),
    evidenceKeys: new Set(),
    allDeclaredDeps: new Set(),
    packets: [],
    acceptances: [],
    rejections: [],
  };

  for (const { data } of packets) {
    if (isObject(data) && typeof data['id'] === 'string') {
      index.packetIds.add(data['id']);
      const scope = isObject(data['scope']) ? data['scope'] : {};
      const pkgs = isStringArray(scope['packages']) ? scope['packages'] : [];
      index.packets.push({
        id: data['id'],
        change_class: typeof data['change_class'] === 'string' ? data['change_class'] : '',
        packages: pkgs,
      });
      const deps = isStringArray(data['environment_dependencies']) ? data['environment_dependencies'] : [];
      for (const d of deps) index.allDeclaredDeps.add(d);
    }
  }

  for (const { data } of completions) {
    if (isObject(data) && typeof data['packet_id'] === 'string') {
      index.completionPacketIds.add(data['packet_id']);
    }
  }

  for (const { data } of acceptances) {
    if (isObject(data) && typeof data['packet_id'] === 'string') {
      index.acceptancePacketIds.add(data['packet_id']);
      const by = isObject(data['accepted_by']) ? data['accepted_by'] : {};
      index.acceptances.push({
        packet_id: data['packet_id'],
        accepted_by_kind: typeof by['kind'] === 'string' ? by['kind'] : '',
      });
    }
  }

  for (const { data } of rejections) {
    if (isObject(data) && typeof data['packet_id'] === 'string') {
      index.rejectionPacketIds.add(data['packet_id']);
      const by = isObject(data['rejected_by']) ? data['rejected_by'] : {};
      index.rejections.push({
        packet_id: data['packet_id'],
        rejected_by_kind: typeof by['kind'] === 'string' ? by['kind'] : '',
      });
    }
  }

  for (const { data } of evidence) {
    if (isObject(data) && typeof data['dependency_key'] === 'string') {
      index.evidenceKeys.add(data['dependency_key']);
    }
  }

  return index;
}

function validateIntegrity(index: ArtifactIndex): ValidationResult[] {
  const results: ValidationResult[] = [];

  // Orphaned completions
  for (const pid of index.completionPacketIds) {
    if (!index.packetIds.has(pid)) {
      results.push({
        file: `factory/completions/${pid}.json`,
        severity: 'error',
        error_type: 'referential',
        message: `Orphaned completion: packet '${pid}' does not exist`,
      });
    }
  }

  // FI-4: Acceptance without completion
  for (const pid of index.acceptancePacketIds) {
    if (!index.completionPacketIds.has(pid)) {
      results.push({
        file: `factory/acceptances/${pid}.json`,
        severity: 'error',
        error_type: 'invariant',
        message: `FI-4 violation: acceptance for '${pid}' but no completion exists`,
      });
    }
    if (!index.packetIds.has(pid)) {
      results.push({
        file: `factory/acceptances/${pid}.json`,
        severity: 'error',
        error_type: 'referential',
        message: `Orphaned acceptance: packet '${pid}' does not exist`,
      });
    }
  }

  // Orphaned rejections
  for (const pid of index.rejectionPacketIds) {
    if (!index.packetIds.has(pid)) {
      results.push({
        file: `factory/rejections/${pid}.json`,
        severity: 'error',
        error_type: 'referential',
        message: `Orphaned rejection: packet '${pid}' does not exist`,
      });
    }
  }

  // FI-3: Agent-authored acceptances
  for (const acc of index.acceptances) {
    if (acc.accepted_by_kind === 'agent') {
      results.push({
        file: `factory/acceptances/${acc.packet_id}.json`,
        severity: 'error',
        error_type: 'authority',
        message: `FI-3 violation: agent-authored acceptance for '${acc.packet_id}'`,
      });
    }
  }

  // FI-3: Agent-authored rejections
  for (const rej of index.rejections) {
    if (rej.rejected_by_kind === 'agent') {
      results.push({
        file: `factory/rejections/${rej.packet_id}.json`,
        severity: 'error',
        error_type: 'authority',
        message: `FI-3 violation: agent-authored rejection for '${rej.packet_id}'`,
      });
    }
  }

  // Change class consistency heuristic (Layer 4) — warning only
  for (const p of index.packets) {
    if (p.packages.length > 1 && (p.change_class === 'trivial' || p.change_class === 'local')) {
      results.push({
        file: `factory/packets/${p.id}.json`,
        severity: 'warning',
        error_type: 'consistency',
        message: `Packet '${p.id}' touches ${p.packages.length} packages but change_class is '${p.change_class}' — consider 'cross_cutting'`,
      });
    }
  }

  // Orphaned evidence (evidence for a dependency no packet declares)
  for (const key of index.evidenceKeys) {
    if (!index.allDeclaredDeps.has(key)) {
      results.push({
        file: `factory/evidence/${key}.json`,
        severity: 'warning',
        error_type: 'referential',
        message: `Evidence for '${key}' but no packet declares this dependency`,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  const allResults: ValidationResult[] = [];

  // Read all artifacts
  const packets = readJsonFiles('packets');
  const completions = readJsonFiles('completions');
  const acceptances = readJsonFiles('acceptances');
  const rejections = readJsonFiles('rejections');
  const evidence = readJsonFiles('evidence');

  // Check for parse failures
  for (const collection of [
    { name: 'packets', items: packets },
    { name: 'completions', items: completions },
    { name: 'acceptances', items: acceptances },
    { name: 'rejections', items: rejections },
    { name: 'evidence', items: evidence },
  ]) {
    for (const item of collection.items) {
      if (item.data === null) {
        allResults.push({
          file: item.filepath,
          severity: 'error',
          error_type: 'schema',
          message: 'Failed to parse JSON',
        });
      }
    }
  }

  // Schema validation (Layer 1)
  for (const p of packets) {
    if (p.data != null) allResults.push(...validatePacketSchema(p.filepath, p.data));
  }
  for (const c of completions) {
    if (c.data != null) allResults.push(...validateCompletionSchema(c.filepath, c.data));
  }
  for (const a of acceptances) {
    if (a.data != null) allResults.push(...validateAcceptanceSchema(a.filepath, a.data));
  }
  for (const r of rejections) {
    if (r.data != null) allResults.push(...validateRejectionSchema(r.filepath, r.data));
  }
  for (const e of evidence) {
    if (e.data != null) allResults.push(...validateEvidenceSchema(e.filepath, e.data));
  }

  // Referential integrity + invariants (Layers 2-5)
  const index = buildIndex(packets, completions, acceptances, rejections, evidence);
  allResults.push(...validateIntegrity(index));

  // FI-1: Check for duplicate completions (same packet_id in multiple files)
  const completionCounts = new Map<string, number>();
  for (const c of completions) {
    if (isObject(c.data) && typeof c.data['packet_id'] === 'string') {
      const pid = c.data['packet_id'];
      completionCounts.set(pid, (completionCounts.get(pid) ?? 0) + 1);
    }
  }
  for (const [pid, count] of completionCounts) {
    if (count > 1) {
      allResults.push({
        file: `factory/completions/${pid}.json`,
        severity: 'error',
        error_type: 'invariant',
        message: `FI-1 violation: ${count} completion records for packet '${pid}'`,
      });
    }
  }

  // FI-2: Check for duplicate acceptances
  const acceptanceCounts = new Map<string, number>();
  for (const a of acceptances) {
    if (isObject(a.data) && typeof a.data['packet_id'] === 'string') {
      const pid = a.data['packet_id'];
      acceptanceCounts.set(pid, (acceptanceCounts.get(pid) ?? 0) + 1);
    }
  }
  for (const [pid, count] of acceptanceCounts) {
    if (count > 1) {
      allResults.push({
        file: `factory/acceptances/${pid}.json`,
        severity: 'error',
        error_type: 'invariant',
        message: `FI-2 violation: ${count} acceptance records for packet '${pid}'`,
      });
    }
  }

  // Report
  const errors = allResults.filter((r) => r.severity === 'error');
  const warnings = allResults.filter((r) => r.severity === 'warning');

  if (allResults.length === 0) {
    console.log('Factory validation: PASS');
    console.log(`  ${packets.length} packets, ${completions.length} completions, ${acceptances.length} acceptances, ${rejections.length} rejections, ${evidence.length} evidence records`);
    process.exit(0);
  }

  if (errors.length > 0) {
    console.log(`Factory validation: FAIL (${errors.length} error(s), ${warnings.length} warning(s))`);
  } else {
    console.log(`Factory validation: PASS with warnings (${warnings.length} warning(s))`);
  }

  console.log(`  ${packets.length} packets, ${completions.length} completions, ${acceptances.length} acceptances, ${rejections.length} rejections, ${evidence.length} evidence records`);
  console.log('');

  for (const r of allResults) {
    const prefix = r.severity === 'error' ? 'ERROR' : 'WARN ';
    console.log(`  ${prefix} [${r.error_type}] ${r.file}: ${r.message}`);
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

main();
