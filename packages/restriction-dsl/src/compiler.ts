/**
 * Archon Restriction DSL — Compiler
 *
 * Compiles parsed DSL source into a canonical Internal Representation (IR)
 * for consumption by the kernel validation engine.
 *
 * Compiler guarantees:
 * - Deterministic: identical source MUST produce identical IR. This is a
 *   hard requirement — IR is included in the rule snapshot hash, and any
 *   non-determinism here breaks snapshot determinism (Invariant I4).
 * - Rejecting: invalid DSL fails at compile time, never at evaluation.
 * - Monotone: the compiler MUST reject any construct that could expand
 *   capability. There is no OR between restriction sources (Invariant I2).
 *
 * @see docs/specs/reestriction-dsl-spec.md §7 (compilation and IR)
 * @see docs/specs/reestriction-dsl-spec.md §7.1 (compiler responsibilities)
 * @see docs/specs/reestriction-dsl-spec.md §7.2 (compiler rejection criteria)
 * @see docs/specs/formal_governance.md §4 (restriction monotonicity)
 * @see docs/specs/formal_governance.md §10 (snapshot determinism)
 */

import { createHash } from 'node:crypto';
import type {
  ASTCondition,
  ASTValue,
  CompiledDRR,
  DRRCondition,
  DRREffect,
  IRCondition,
  IRValue,
  RestrictionIR,
  StructuredRestrictionRule,
  ValidationError,
  ValidationResult,
} from './types.js';
import { CapabilityType, ConditionOperator } from './types.js';
import { parse } from './parser.js';

// ---------------------------------------------------------------------------
// Internal: Canonical JSON serialization for deterministic hashing
// ---------------------------------------------------------------------------

/**
 * Produces a canonical JSON string with deterministic key ordering.
 *
 * Standard JSON.stringify does not guarantee key ordering. This function
 * recursively sorts object keys alphabetically to produce a stable,
 * canonical representation suitable for cryptographic hashing.
 *
 * Used by hash() to hash RestrictionIR for inclusion in the rule snapshot.
 */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + (value as unknown[]).map(canonicalize).join(',') + ']';
  }
  // Plain object: sort keys for canonical ordering
  const obj = value as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const pairs = sortedKeys.map((k) => {
    const v = obj[k];
    return `${JSON.stringify(k)}:${canonicalize(v)}`;
  });
  return '{' + pairs.join(',') + '}';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compile a Restriction DSL source string to the canonical Internal Representation.
 *
 * The caller must call validate() first if they want structured errors.
 * compile() throws on invalid input.
 *
 * Compilation is:
 * - Deterministic: identical source produces identical IR
 * - Rejecting: invalid DSL throws, it does not return a partial IR
 * - Canonical: IR has stable key and condition ordering
 *
 * @param source - DSL source for one restriction block
 * @param capabilityType - The capability type this restriction targets
 * @returns RestrictionIR — canonical compiled representation
 *
 * @throws {NotImplementedError} — stub implementation
 *   Will implement: call parse(), semantic validation, IR lowering per §7.1
 *
 * @see docs/specs/reestriction-dsl-spec.md §7 (compilation)
 * @see docs/specs/reestriction-dsl-spec.md §7.1 (compiler responsibilities)
 */
export function compile(
  source: string,
  capabilityType: CapabilityType,
): RestrictionIR {
  // Step 1: Parse DSL source to AST
  const parseResult = parse(source, capabilityType);
  if (!parseResult.ok) {
    const msgs = parseResult.errors.map((e) => `${e.line}:${e.column}: ${e.message}`);
    throw new Error(`DSL parse error:\n${msgs.join('\n')}`);
  }

  // Step 2: Semantic validation
  const validationErrors = validateSemantics(parseResult.ast.conditions);
  if (validationErrors.length > 0) {
    const msgs = validationErrors.map((e) => e.message);
    throw new Error(`DSL semantic error:\n${msgs.join('\n')}`);
  }

  // Step 3: Lower AST to IR with stable condition ordering
  const irConditions = parseResult.ast.conditions
    .map(lowerCondition)
    .sort((a, b) => a.field.localeCompare(b.field) || JSON.stringify(a.value).localeCompare(JSON.stringify(b.value)));

  return {
    capabilityType,
    conditions: irConditions,
  };
}

/**
 * Validate a Restriction DSL source string without producing IR.
 *
 * Returns a ValidationResult indicating whether the source is valid and,
 * if not, what errors were found. Validation is a superset of parsing:
 * it also checks semantic constraints (field references, operator applicability,
 * value types) and rejects constructs outside the permitted grammar.
 *
 * @param source - DSL source for one restriction block
 * @param capabilityType - The capability type this restriction targets
 * @returns ValidationResult<void> — ok on success, errors on failure
 *
 * @throws {NotImplementedError} — stub implementation
 *   Will implement: call parse(), run all semantic checks, return structured errors
 *
 * @see docs/specs/reestriction-dsl-spec.md §7.2 (rejection criteria)
 */
export function validate(
  source: string,
  capabilityType: CapabilityType,
): ValidationResult<void> {
  // Step 1: Parse
  const parseResult = parse(source, capabilityType);
  if (!parseResult.ok) {
    return {
      ok: false,
      errors: parseResult.errors.map((e) => ({
        message: `${e.line}:${e.column}: ${e.message}`,
        context: 'parse',
      })),
    };
  }

  // Step 2: Semantic validation
  const semanticErrors = validateSemantics(parseResult.ast.conditions);
  if (semanticErrors.length > 0) {
    return { ok: false, errors: semanticErrors };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Internal: Semantic validation
// ---------------------------------------------------------------------------

/**
 * Validate semantic constraints on parsed conditions.
 *
 * Checks:
 * - Numeric operators require numeric or context_ref values
 * - 'in' / 'not_in' operators require list values
 * - 'matches' operator requires string, context_ref, or string_concat values
 * - 'is_defined' / 'is_null' are unary (no meaningful value check needed)
 * - List values must not be empty for 'in' / 'not_in'
 * - List size limit: 100 elements (v0.1 pragmatic bound)
 */
function validateSemantics(conditions: ReadonlyArray<ASTCondition>): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const cond of conditions) {
    const op = cond.operator;
    const val = cond.value;

    // Numeric operators require numeric or context_ref values
    if (
      op === ConditionOperator.Lt ||
      op === ConditionOperator.Gt ||
      op === ConditionOperator.Lte ||
      op === ConditionOperator.Gte
    ) {
      if (val.kind !== 'number' && val.kind !== 'context_ref') {
        errors.push({
          message: `Operator "${op}" requires a numeric value, got ${val.kind} on field "${cond.fieldPath}"`,
          context: 'semantic',
        });
      }
    }

    // Set operators require list values
    if (op === ConditionOperator.In || op === ConditionOperator.NotIn) {
      if (val.kind !== 'list') {
        errors.push({
          message: `Operator "${op}" requires a list value, got ${val.kind} on field "${cond.fieldPath}"`,
          context: 'semantic',
        });
      } else if (val.values.length === 0) {
        errors.push({
          message: `Operator "${op}" requires a non-empty list on field "${cond.fieldPath}"`,
          context: 'semantic',
        });
      } else if (val.values.length > 100) {
        errors.push({
          message: `List value exceeds maximum size of 100 elements (got ${val.values.length}) on field "${cond.fieldPath}"`,
          context: 'semantic',
        });
      }
    }

    // Matches operator requires string-like values
    if (op === ConditionOperator.Matches) {
      if (val.kind !== 'string' && val.kind !== 'context_ref' && val.kind !== 'string_concat') {
        errors.push({
          message: `Operator "matches" requires a string, context reference, or string concatenation, got ${val.kind} on field "${cond.fieldPath}"`,
          context: 'semantic',
        });
      }
    }

    // Equality operators accept any value type (no restriction)
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Internal: AST → IR lowering
// ---------------------------------------------------------------------------

function lowerValue(ast: ASTValue): IRValue {
  switch (ast.kind) {
    case 'string': return { kind: 'string', value: ast.value };
    case 'number': return { kind: 'number', value: ast.value };
    case 'boolean': return { kind: 'boolean', value: ast.value };
    case 'context_ref': return { kind: 'context_ref', path: ast.path };
    case 'string_concat': return {
      kind: 'string_concat',
      left: lowerValue(ast.left),
      right: lowerValue(ast.right),
    };
    case 'list': return {
      kind: 'list',
      values: ast.values.map(lowerValue),
    };
  }
}

function lowerCondition(ast: ASTCondition): IRCondition {
  return {
    field: ast.fieldPath,
    operator: ast.operator,
    value: lowerValue(ast.value),
  };
}

/**
 * Compute the SHA-256 hash of a compiled RestrictionIR.
 *
 * This function IS implemented (not a stub). The hash has no governance
 * implications on its own — it is a pure deterministic function over the IR.
 *
 * The hash is included in the rule snapshot hash (RS_hash) to ensure that
 * any change to a restriction's IR changes the snapshot identity, making
 * all prior decisions non-applicable to the new rule state.
 *
 * Implementation note: uses canonical JSON serialization (sorted keys) to
 * guarantee that structurally identical IR objects produce identical hashes
 * regardless of property insertion order.
 *
 * @param ir - Compiled RestrictionIR
 * @returns SHA-256 hex digest of the canonical IR
 *
 * @see docs/specs/reestriction-dsl-spec.md §7 (IR hashing)
 * @see docs/specs/formal_governance.md §10 (snapshot determinism)
 */
export function hash(ir: RestrictionIR): string {
  const canonical = canonicalize(ir as unknown);
  return createHash('sha256').update(canonical).digest('hex');
}

// ---------------------------------------------------------------------------
// DRR Compilation (structured JSON input)
// ---------------------------------------------------------------------------

/**
 * Compile a StructuredRestrictionRule to a CompiledDRR.
 *
 * The ir_hash covers (capabilityType + conditions + effect) — not id.
 * Two rules with identical effect/type/conditions produce the same ir_hash,
 * regardless of their id (satisfying test U3: structured + DSL equivalence).
 *
 * Conditions are sorted by field then value for canonical ordering (I4).
 *
 * @param rule - Operator-authored structured rule
 * @returns CompiledDRR — kernel-ready compiled representation
 *
 * @see docs/specs/formal_governance.md §3 (restriction composition)
 */
export function compileStructured(rule: StructuredRestrictionRule): CompiledDRR {
  // Sort conditions for canonical ordering (Invariant I4).
  const sortedConditions: ReadonlyArray<DRRCondition> = [...rule.conditions].sort(
    (a, b) => a.field.localeCompare(b.field) || a.value.localeCompare(b.value),
  );

  // Hash covers semantic content only — not the operator-assigned id.
  const irHash = computeDRRHash(rule.effect, rule.capabilityType, sortedConditions);

  return {
    id: rule.id,
    effect: rule.effect,
    capabilityType: rule.capabilityType,
    conditions: sortedConditions,
    ir_hash: irHash,
  };
}

// ---------------------------------------------------------------------------
// DRR Compilation (minimal DSL text input)
// ---------------------------------------------------------------------------

/**
 * Compile a minimal DSL text string directly to a CompiledDRR.
 *
 * DSL grammar (v0.1):
 *   `allow <capability_type> where <field> matches "<glob_pattern>"`
 *   `deny  <capability_type> where <field> matches "<glob_pattern>"`
 *
 * Multiple conditions joined by ' and ':
 *   `allow fs.read where capability.params.path matches "./docs/**" and capability.params.path matches "./src/**"`
 *
 * The caller supplies the rule id (assigned by the registry).
 *
 * The ir_hash is computed from (effect + capabilityType + conditions) — identical
 * to compileStructured() for equivalent rules (satisfying test U3).
 *
 * @param id - Operator-assigned stable rule identifier
 * @param source - DSL text string
 * @returns CompiledDRR on success
 * @throws {Error} If the DSL source cannot be parsed
 *
 * @see docs/specs/reestriction-dsl-spec.md §3 (expression model)
 */
export function compileDSL(id: string, source: string): CompiledDRR {
  const parsed = parseDSLText(source);
  if (!parsed.ok) {
    throw new Error(`DSL parse error: ${parsed.error}`);
  }

  return compileStructured({
    id,
    capabilityType: parsed.capabilityType,
    effect: parsed.effect,
    conditions: parsed.conditions,
  });
}

// ---------------------------------------------------------------------------
// Internal: DSL text parser (minimal, v0.1)
// ---------------------------------------------------------------------------

/**
 * Minimal DSL text parser for v0.1 restriction rules.
 *
 * Returns the structural components of the rule without an id (id is
 * assigned by the caller/registry).
 *
 * @internal
 */
type DSLParseResult =
  | {
      readonly ok: true;
      readonly effect: DRREffect;
      readonly capabilityType: CapabilityType;
      readonly conditions: ReadonlyArray<DRRCondition>;
    }
  | { readonly ok: false; readonly error: string };

function parseDSLText(source: string): DSLParseResult {
  const trimmed = source.trim();

  // Top-level pattern: `allow|deny <type> where <conditions>`
  const topMatch = /^(allow|deny)\s+(\S+)\s+where\s+(.+)$/is.exec(trimmed);
  if (topMatch === null) {
    return {
      ok: false,
      error:
        'Expected: allow|deny <capability_type> where <conditions>. ' +
        `Got: ${JSON.stringify(trimmed)}`,
    };
  }

  const effect = topMatch[1]!.toLowerCase() as DRREffect;
  const rawType = topMatch[2]!;
  const conditionsStr = topMatch[3]!;

  // Validate capability type against the known taxonomy.
  // The kernel also validates at evaluation time (Invariant I7), but rejecting
  // unknown types at compile time surfaces errors earlier and is cleaner.
  const validTypes = new Set<string>(Object.values(CapabilityType));
  if (!validTypes.has(rawType)) {
    return {
      ok: false,
      error: `Unknown capability type: ${JSON.stringify(rawType)}. ` +
        `Must be one of: ${[...validTypes].sort().join(', ')}`,
    };
  }
  const capabilityType = rawType as CapabilityType;

  // Parse conditions: split by ' and ' (case-insensitive).
  const conditionParts = conditionsStr.split(/\s+and\s+/i);
  const conditions: DRRCondition[] = [];

  for (const part of conditionParts) {
    const condMatch = /^([\w.]+)\s+matches\s+"([^"]*)"$/.exec(part.trim());
    if (condMatch === null) {
      return {
        ok: false,
        error:
          `Invalid condition: ${JSON.stringify(part.trim())}. ` +
          'Expected: <field> matches "<glob_pattern>"',
      };
    }
    conditions.push({
      field: condMatch[1]!,
      op: 'matches',
      value: condMatch[2]!,
    });
  }

  if (conditions.length === 0) {
    return { ok: false, error: 'At least one condition is required' };
  }

  return { ok: true, effect, capabilityType, conditions };
}

// ---------------------------------------------------------------------------
// Internal: DRR hash computation
// ---------------------------------------------------------------------------

/**
 * Compute the SHA-256 hash of a DRR's semantic content.
 *
 * Covers (capabilityType + conditions + effect) — NOT id.
 * Conditions must be pre-sorted for canonical ordering.
 *
 * @internal
 */
function computeDRRHash(
  effect: DRREffect,
  capabilityType: CapabilityType,
  conditions: ReadonlyArray<DRRCondition>,
): string {
  const canonical = canonicalize({ capabilityType, conditions, effect } as unknown);
  return createHash('sha256').update(canonical).digest('hex');
}
