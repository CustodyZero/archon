/**
 * Archon Restriction DSL — Parser
 *
 * Parses DSL source text into an Abstract Syntax Tree (AST).
 *
 * The parser is responsible for syntactic analysis only. It does not validate
 * field references, operator applicability, or value types — those are the
 * compiler's responsibility.
 *
 * Parser guarantees:
 * - Deterministic: identical source produces identical AST
 * - Rejecting: invalid syntax produces ParseError[], never a partial AST
 * - Non-Turing-complete: the grammar does not permit recursion, unbounded
 *   iteration, or dynamic dispatch
 *
 * @see docs/specs/reestriction-dsl-spec.md §3–§4 (expression model, condition syntax)
 * @see docs/specs/reestriction-dsl-spec.md §7 (compilation and IR)
 */

import type { CapabilityType, ParseResult } from './types.js';
import { NotImplementedError } from './types.js';

/**
 * Parse a Restriction DSL source string for a specific capability type.
 *
 * The source must be a `restrict <capability_type> { ... }` block.
 * The capability type in the source must match the `capabilityType` parameter.
 *
 * Returns a discriminated union:
 * - `{ ok: true, ast: RestrictionAST }` on success
 * - `{ ok: false, errors: ParseError[] }` on any parse failure
 *
 * Parse failures are never partial: if any error is encountered, no AST
 * is returned. Invalid DSL must not partially apply.
 *
 * @param source - DSL source text for one restriction block
 * @param capabilityType - The capability type this restriction targets.
 *   Must match the type declared in the source.
 * @returns ParseResult — AST on success, errors on failure
 *
 * @throws {NotImplementedError} — stub implementation
 *   Will implement: tokenization, recursive descent parsing per §3–§4 grammar
 *
 * @see docs/specs/reestriction-dsl-spec.md §3 (expression model)
 * @see docs/specs/reestriction-dsl-spec.md §4 (condition syntax)
 * @see docs/specs/reestriction-dsl-spec.md §7.2 (compiler rejection criteria)
 */
export function parse(
  _source: string,
  _capabilityType: CapabilityType,
): ParseResult {
  // TODO: implement tokenizer for DSL source
  // TODO: implement recursive descent parser for `restrict <type> { <conditions> }` grammar
  // TODO: validate that capability_type in source matches `capabilityType` param
  // TODO: parse field references (capability.params.*, context.agent.*, context.session.*, workspace.*)
  // TODO: parse all operators from ConditionOperator enum
  // TODO: parse all value forms from ASTValue (string, number, boolean, list, context_ref, string_concat)
  // TODO: open design: resolve glob semantics (see reestriction-dsl-spec.md §9.1)
  // TODO: open design: stabilize context reference scope (see reestriction-dsl-spec.md §9.2)
  // TODO: open design: error message format (see reestriction-dsl-spec.md §9.3)
  throw new NotImplementedError('reestriction-dsl-spec.md §3–§4 (parser implementation)');
}
