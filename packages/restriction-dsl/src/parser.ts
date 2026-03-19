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
 * Grammar (§3–§4 of restriction-dsl-spec.md):
 *
 *   restriction_block := 'restrict' <capability_type> '{' condition+ '}'
 *   condition          := <field_path> <operator> <value>
 *   field_path         := IDENT ('.' IDENT)*
 *   operator           := '==' | '!=' | '<=' | '>=' | '<' | '>' | 'in' | 'not_in' | 'matches' | 'is_defined' | 'is_null'
 *   value              := string_lit | number_lit | boolean_lit | list_lit | context_ref | string_concat
 *   string_lit         := '"' chars '"'
 *   number_lit         := ['-'] DIGITS ['_' DIGITS]* ['.' DIGITS ['_' DIGITS]*]
 *   boolean_lit        := 'true' | 'false'
 *   list_lit           := '[' value (',' value)* ']'
 *   context_ref        := ('workspace' | 'context' | 'capability') '.' IDENT ('.' IDENT)*
 *   string_concat      := value '+' value
 *
 * @see docs/specs/restriction-dsl-spec.md §3–§4 (expression model, condition syntax)
 * @see docs/specs/restriction-dsl-spec.md §7 (compilation and IR)
 */

import type {
  ASTCondition,
  ASTValue,
  CapabilityType,
  ParseError,
  ParseResult,
} from './types.js';
import { ConditionOperator } from './types.js';

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

type TokenType =
  | 'keyword_restrict'
  | 'ident'
  | 'string'
  | 'number'
  | 'boolean'
  | 'lbrace'
  | 'rbrace'
  | 'lbracket'
  | 'rbracket'
  | 'comma'
  | 'plus'
  | 'op_eq'
  | 'op_neq'
  | 'op_lte'
  | 'op_gte'
  | 'op_lt'
  | 'op_gt'
  | 'op_in'
  | 'op_not_in'
  | 'op_matches'
  | 'op_is_defined'
  | 'op_is_null'
  | 'eof';

interface Token {
  readonly type: TokenType;
  readonly value: string;
  readonly line: number;
  readonly column: number;
}

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

const KEYWORDS: Record<string, TokenType> = {
  restrict: 'keyword_restrict',
  true: 'boolean',
  false: 'boolean',
  in: 'op_in',
  not_in: 'op_not_in',
  matches: 'op_matches',
  is_defined: 'op_is_defined',
  is_null: 'op_is_null',
};

function tokenize(source: string): { tokens: Token[]; errors: ParseError[] } {
  const tokens: Token[] = [];
  const errors: ParseError[] = [];
  let pos = 0;
  let line = 1;
  let lineStart = 0;

  function col(): number {
    return pos - lineStart + 1;
  }

  function peek(): string {
    return pos < source.length ? source[pos]! : '';
  }

  function advance(): string {
    const ch = source[pos]!;
    if (ch === '\n') {
      line++;
      lineStart = pos + 1;
    }
    pos++;
    return ch;
  }

  function skipWhitespaceAndComments(): void {
    while (pos < source.length) {
      const ch = peek();
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        advance();
      } else if (ch === '/' && pos + 1 < source.length && source[pos + 1] === '/') {
        // Line comment: skip to end of line
        while (pos < source.length && peek() !== '\n') advance();
      } else {
        break;
      }
    }
  }

  while (pos < source.length) {
    skipWhitespaceAndComments();
    if (pos >= source.length) break;

    const startLine = line;
    const startCol = col();
    const ch = peek();

    // Single-char tokens
    if (ch === '{') { advance(); tokens.push({ type: 'lbrace', value: '{', line: startLine, column: startCol }); continue; }
    if (ch === '}') { advance(); tokens.push({ type: 'rbrace', value: '}', line: startLine, column: startCol }); continue; }
    if (ch === '[') { advance(); tokens.push({ type: 'lbracket', value: '[', line: startLine, column: startCol }); continue; }
    if (ch === ']') { advance(); tokens.push({ type: 'rbracket', value: ']', line: startLine, column: startCol }); continue; }
    if (ch === ',') { advance(); tokens.push({ type: 'comma', value: ',', line: startLine, column: startCol }); continue; }
    if (ch === '+') { advance(); tokens.push({ type: 'plus', value: '+', line: startLine, column: startCol }); continue; }

    // Two-char operators
    if (ch === '=' && pos + 1 < source.length && source[pos + 1] === '=') {
      advance(); advance();
      tokens.push({ type: 'op_eq', value: '==', line: startLine, column: startCol });
      continue;
    }
    if (ch === '!' && pos + 1 < source.length && source[pos + 1] === '=') {
      advance(); advance();
      tokens.push({ type: 'op_neq', value: '!=', line: startLine, column: startCol });
      continue;
    }
    if (ch === '<' && pos + 1 < source.length && source[pos + 1] === '=') {
      advance(); advance();
      tokens.push({ type: 'op_lte', value: '<=', line: startLine, column: startCol });
      continue;
    }
    if (ch === '>' && pos + 1 < source.length && source[pos + 1] === '=') {
      advance(); advance();
      tokens.push({ type: 'op_gte', value: '>=', line: startLine, column: startCol });
      continue;
    }
    // Single-char < and > (only if not followed by =)
    if (ch === '<') { advance(); tokens.push({ type: 'op_lt', value: '<', line: startLine, column: startCol }); continue; }
    if (ch === '>') { advance(); tokens.push({ type: 'op_gt', value: '>', line: startLine, column: startCol }); continue; }

    // String literal
    if (ch === '"') {
      advance(); // consume opening quote
      let str = '';
      let terminated = false;
      while (pos < source.length) {
        const c = peek();
        if (c === '"') {
          advance(); // consume closing quote
          terminated = true;
          break;
        }
        if (c === '\\' && pos + 1 < source.length) {
          advance(); // consume backslash
          const escaped = advance();
          if (escaped === '"') str += '"';
          else if (escaped === '\\') str += '\\';
          else if (escaped === 'n') str += '\n';
          else if (escaped === 't') str += '\t';
          else str += escaped;
        } else if (c === '\n') {
          errors.push({ line: startLine, column: startCol, message: 'Unterminated string literal' });
          break;
        } else {
          str += advance();
        }
      }
      if (!terminated && errors.length === 0) {
        errors.push({ line: startLine, column: startCol, message: 'Unterminated string literal' });
      }
      tokens.push({ type: 'string', value: str, line: startLine, column: startCol });
      continue;
    }

    // Number literal (with optional underscores and decimal)
    if (ch === '-' || (ch >= '0' && ch <= '9')) {
      let num = '';
      if (ch === '-') num += advance();
      while (pos < source.length && ((peek() >= '0' && peek() <= '9') || peek() === '_' || peek() === '.')) {
        const c = peek();
        if (c === '_') { advance(); continue; } // skip underscores
        num += advance();
      }
      if (num === '-') {
        errors.push({ line: startLine, column: startCol, message: 'Expected digit after minus sign' });
        continue;
      }
      tokens.push({ type: 'number', value: num, line: startLine, column: startCol });
      continue;
    }

    // Identifier or keyword
    if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
      let ident = '';
      while (pos < source.length) {
        const c = peek();
        if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_' || c === '.') {
          ident += advance();
        } else {
          break;
        }
      }
      const kwType = KEYWORDS[ident];
      if (kwType !== undefined) {
        tokens.push({ type: kwType, value: ident, line: startLine, column: startCol });
      } else {
        tokens.push({ type: 'ident', value: ident, line: startLine, column: startCol });
      }
      continue;
    }

    // Unknown character
    errors.push({ line: startLine, column: startCol, message: `Unexpected character: ${JSON.stringify(ch)}` });
    advance();
  }

  tokens.push({ type: 'eof', value: '', line, column: col() });
  return { tokens, errors };
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
  private readonly tokens: ReadonlyArray<Token>;
  private pos = 0;
  private readonly errors: ParseError[] = [];

  constructor(tokens: ReadonlyArray<Token>) {
    this.tokens = tokens;
  }

  private current(): Token {
    return this.tokens[this.pos] ?? this.tokens[this.tokens.length - 1]!;
  }

  private advance(): Token {
    const tok = this.current();
    if (this.pos < this.tokens.length - 1) this.pos++;
    return tok;
  }

  private expect(type: TokenType, context: string): Token | null {
    const tok = this.current();
    if (tok.type !== type) {
      this.errors.push({
        line: tok.line,
        column: tok.column,
        message: `Expected ${type} ${context}, got ${tok.type} (${JSON.stringify(tok.value)})`,
      });
      return null;
    }
    return this.advance();
  }

  private isOperator(type: TokenType): boolean {
    return type.startsWith('op_');
  }

  private tokenTypeToOperator(type: TokenType): ConditionOperator | null {
    switch (type) {
      case 'op_eq': return ConditionOperator.Eq;
      case 'op_neq': return ConditionOperator.Neq;
      case 'op_lte': return ConditionOperator.Lte;
      case 'op_gte': return ConditionOperator.Gte;
      case 'op_lt': return ConditionOperator.Lt;
      case 'op_gt': return ConditionOperator.Gt;
      case 'op_in': return ConditionOperator.In;
      case 'op_not_in': return ConditionOperator.NotIn;
      case 'op_matches': return ConditionOperator.Matches;
      case 'op_is_defined': return ConditionOperator.IsDefined;
      case 'op_is_null': return ConditionOperator.IsNull;
      default: return null;
    }
  }

  parseRestriction(expectedType: CapabilityType): ParseResult {
    // 'restrict'
    if (this.expect('keyword_restrict', 'at start of restriction block') === null) {
      return { ok: false, errors: this.errors };
    }

    // <capability_type> — parsed as ident (dot-notation: fs.write)
    const typeTok = this.expect('ident', 'for capability type');
    if (typeTok === null) {
      return { ok: false, errors: this.errors };
    }

    if (typeTok.value !== expectedType) {
      this.errors.push({
        line: typeTok.line,
        column: typeTok.column,
        message: `Capability type mismatch: source declares "${typeTok.value}" but expected "${expectedType}"`,
      });
      return { ok: false, errors: this.errors };
    }

    // '{'
    if (this.expect('lbrace', 'after capability type') === null) {
      return { ok: false, errors: this.errors };
    }

    // Parse conditions until '}'
    const conditions: ASTCondition[] = [];
    while (this.current().type !== 'rbrace' && this.current().type !== 'eof') {
      const condition = this.parseCondition();
      if (condition === null) {
        // Error already recorded; try to recover by skipping to next line-like boundary
        while (
          this.current().type !== 'rbrace' &&
          this.current().type !== 'eof' &&
          this.current().type !== 'ident'
        ) {
          this.advance();
        }
        continue;
      }
      conditions.push(condition);
    }

    // '}'
    if (this.expect('rbrace', 'at end of restriction block') === null) {
      return { ok: false, errors: this.errors };
    }

    // Expect EOF
    if (this.current().type !== 'eof') {
      const tok = this.current();
      this.errors.push({
        line: tok.line,
        column: tok.column,
        message: `Unexpected content after restriction block: ${JSON.stringify(tok.value)}`,
      });
    }

    if (this.errors.length > 0) {
      return { ok: false, errors: this.errors };
    }

    if (conditions.length === 0) {
      this.errors.push({
        line: this.current().line,
        column: this.current().column,
        message: 'Restriction block must contain at least one condition',
      });
      return { ok: false, errors: this.errors };
    }

    return {
      ok: true,
      ast: {
        capabilityType: expectedType,
        conditions,
      },
    };
  }

  private parseCondition(): ASTCondition | null {
    // <field_path>
    const fieldTok = this.current();
    if (fieldTok.type !== 'ident') {
      this.errors.push({
        line: fieldTok.line,
        column: fieldTok.column,
        message: `Expected field path, got ${fieldTok.type} (${JSON.stringify(fieldTok.value)})`,
      });
      return null;
    }
    const fieldPath = this.advance().value;

    // <operator>
    const opTok = this.current();
    if (!this.isOperator(opTok.type)) {
      this.errors.push({
        line: opTok.line,
        column: opTok.column,
        message: `Expected operator after field "${fieldPath}", got ${opTok.type} (${JSON.stringify(opTok.value)})`,
      });
      return null;
    }
    const operator = this.tokenTypeToOperator(opTok.type);
    if (operator === null) {
      this.errors.push({
        line: opTok.line,
        column: opTok.column,
        message: `Unknown operator: ${JSON.stringify(opTok.value)}`,
      });
      return null;
    }
    this.advance();

    // Unary operators (is_defined, is_null) have no value
    if (operator === ConditionOperator.IsDefined || operator === ConditionOperator.IsNull) {
      return { fieldPath, operator, value: { kind: 'boolean', value: true } };
    }

    // <value>
    const value = this.parseValue();
    if (value === null) {
      return null;
    }

    return { fieldPath, operator, value };
  }

  private parseValue(): ASTValue | null {
    const tok = this.current();

    let left: ASTValue | null = null;

    switch (tok.type) {
      case 'string':
        this.advance();
        left = { kind: 'string', value: tok.value };
        break;

      case 'number': {
        this.advance();
        const num = Number(tok.value);
        if (Number.isNaN(num)) {
          this.errors.push({
            line: tok.line,
            column: tok.column,
            message: `Invalid number: ${JSON.stringify(tok.value)}`,
          });
          return null;
        }
        left = { kind: 'number', value: num };
        break;
      }

      case 'boolean':
        this.advance();
        left = { kind: 'boolean', value: tok.value === 'true' };
        break;

      case 'lbracket':
        left = this.parseList();
        break;

      case 'ident': {
        // Context reference: workspace.*, context.*, capability.*
        const path = tok.value;
        if (
          path.startsWith('workspace.') ||
          path.startsWith('context.') ||
          path.startsWith('capability.')
        ) {
          this.advance();
          left = { kind: 'context_ref', path };
        } else {
          this.errors.push({
            line: tok.line,
            column: tok.column,
            message: `Expected value, got identifier "${path}". Context references must start with workspace., context., or capability.`,
          });
          return null;
        }
        break;
      }

      default:
        this.errors.push({
          line: tok.line,
          column: tok.column,
          message: `Expected value, got ${tok.type} (${JSON.stringify(tok.value)})`,
        });
        return null;
    }

    // Check for string concatenation: value '+' value
    if (left !== null && this.current().type === 'plus') {
      this.advance(); // consume '+'
      const right = this.parseValue();
      if (right === null) return null;
      return { kind: 'string_concat', left, right };
    }

    return left;
  }

  private parseList(): ASTValue | null {
    this.advance(); // consume '['
    const values: ASTValue[] = [];

    if (this.current().type === 'rbracket') {
      this.advance(); // consume ']'
      return { kind: 'list', values };
    }

    const first = this.parseValue();
    if (first === null) return null;
    values.push(first);

    while (this.current().type === 'comma') {
      this.advance(); // consume ','
      // Allow trailing comma
      if (this.current().type === 'rbracket') break;
      const val = this.parseValue();
      if (val === null) return null;
      values.push(val);
    }

    if (this.expect('rbracket', 'at end of list') === null) {
      return null;
    }

    return { kind: 'list', values };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
 */
export function parse(
  source: string,
  capabilityType: CapabilityType,
): ParseResult {
  const { tokens, errors: tokenErrors } = tokenize(source);
  if (tokenErrors.length > 0) {
    return { ok: false, errors: tokenErrors };
  }

  const parser = new Parser(tokens);
  return parser.parseRestriction(capabilityType);
}
