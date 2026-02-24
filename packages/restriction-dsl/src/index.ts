/**
 * @archon/restriction-dsl
 *
 * Archon Restriction DSL — parser, compiler, and type definitions.
 *
 * This package is the base layer of the Archon type system. It defines:
 * - The canonical capability taxonomy (CapabilityType enum)
 * - Condition operators for the DSL (ConditionOperator enum)
 * - All AST and IR type definitions
 * - The parse(), compile(), validate(), and hash() functions
 * - NotImplementedError for stub implementations
 *
 * All other Archon packages depend on this package. This package has no
 * internal Archon dependencies.
 *
 * @see docs/specs/reestriction-dsl-spec.md
 * @see docs/specs/capabilities.md
 */

// Types
export type {
  ASTCondition,
  ASTValue,
  CompiledDRR,
  DRRCondition,
  DRREffect,
  IRCondition,
  IRValue,
  ParseError,
  ParseResult,
  RestrictionAST,
  RestrictionIR,
  StructuredRestrictionRule,
  ValidationError,
  ValidationResult,
} from './types.js';

export { CapabilityType, ConditionOperator, NotImplementedError } from './types.js';

// Functions
export { compile, compileDSL, compileStructured, hash, validate } from './compiler.js';
export { matchesGlob } from './glob.js';
export { parse } from './parser.js';
