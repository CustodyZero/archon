/**
 * Archon Kernel Tests — DSL Parser & Compiler
 *
 * Tests the restriction DSL parse → compile → validate pipeline.
 * Exercises the full grammar: restrict blocks, all operators,
 * all value types, error reporting.
 *
 * @see docs/specs/restriction-dsl-spec.md
 * @see packages/restriction-dsl/src/parser.ts
 * @see packages/restriction-dsl/src/compiler.ts
 */

import { describe, it, expect } from 'vitest';
import {
  parse,
  compile,
  validate,
  hash,
  CapabilityType,
  ConditionOperator,
} from '@archon/restriction-dsl';

// ---------------------------------------------------------------------------
// Parser: valid DSL
// ---------------------------------------------------------------------------

describe('DSL Parser — valid input', () => {
  it('parses a simple restrict block with matches operator', () => {
    const source = `restrict fs.write {
      path matches "./docs/**"
    }`;
    const result = parse(source, CapabilityType.FsWrite);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ast.capabilityType).toBe(CapabilityType.FsWrite);
    expect(result.ast.conditions).toHaveLength(1);
    expect(result.ast.conditions[0]!.fieldPath).toBe('path');
    expect(result.ast.conditions[0]!.operator).toBe(ConditionOperator.Matches);
    expect(result.ast.conditions[0]!.value).toEqual({ kind: 'string', value: './docs/**' });
  });

  it('parses multiple conditions (AND composition)', () => {
    const source = `restrict fs.write {
      path matches "./src/**"
      max_bytes <= 10485760
      overwrite_allowed == false
    }`;
    const result = parse(source, CapabilityType.FsWrite);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ast.conditions).toHaveLength(3);
    expect(result.ast.conditions[1]!.operator).toBe(ConditionOperator.Lte);
    expect(result.ast.conditions[1]!.value).toEqual({ kind: 'number', value: 10485760 });
    expect(result.ast.conditions[2]!.operator).toBe(ConditionOperator.Eq);
    expect(result.ast.conditions[2]!.value).toEqual({ kind: 'boolean', value: false });
  });

  it('parses string concatenation for glob construction', () => {
    const source = `restrict fs.write {
      path matches workspace.root + "/**"
    }`;
    const result = parse(source, CapabilityType.FsWrite);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ast.conditions[0]!.value).toEqual({
      kind: 'string_concat',
      left: { kind: 'context_ref', path: 'workspace.root' },
      right: { kind: 'string', value: '/**' },
    });
  });

  it('parses list values for in operator', () => {
    const source = `restrict net.fetch.http {
      method in ["GET", "HEAD", "OPTIONS"]
    }`;
    const result = parse(source, CapabilityType.NetFetchHttp);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ast.conditions[0]!.operator).toBe(ConditionOperator.In);
    const val = result.ast.conditions[0]!.value;
    expect(val.kind).toBe('list');
    if (val.kind !== 'list') return;
    expect(val.values).toHaveLength(3);
    expect(val.values[0]).toEqual({ kind: 'string', value: 'GET' });
  });

  it('parses numbers with underscores', () => {
    const source = `restrict fs.write {
      max_bytes <= 10_485_760
    }`;
    const result = parse(source, CapabilityType.FsWrite);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ast.conditions[0]!.value).toEqual({ kind: 'number', value: 10485760 });
  });

  it('parses all comparison operators', () => {
    const source = `restrict fs.write {
      size == 100
      name != "bad"
      count < 10
      count > 0
      score <= 99
      score >= 1
    }`;
    const result = parse(source, CapabilityType.FsWrite);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const ops = result.ast.conditions.map((c) => c.operator);
    expect(ops).toEqual([
      ConditionOperator.Eq,
      ConditionOperator.Neq,
      ConditionOperator.Lt,
      ConditionOperator.Gt,
      ConditionOperator.Lte,
      ConditionOperator.Gte,
    ]);
  });

  it('parses unary operators (is_defined, is_null)', () => {
    const source = `restrict fs.write {
      path is_defined
      backup_path is_null
    }`;
    const result = parse(source, CapabilityType.FsWrite);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ast.conditions[0]!.operator).toBe(ConditionOperator.IsDefined);
    expect(result.ast.conditions[1]!.operator).toBe(ConditionOperator.IsNull);
  });

  it('parses not_in operator', () => {
    const source = `restrict exec.run {
      cmd not_in ["rm", "shutdown", "reboot"]
    }`;
    const result = parse(source, CapabilityType.ExecRun);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ast.conditions[0]!.operator).toBe(ConditionOperator.NotIn);
  });

  it('handles line comments', () => {
    const source = `// Restrict file writes to workspace
restrict fs.write {
  // Only allow writes under docs
  path matches "./docs/**"
}`;
    const result = parse(source, CapabilityType.FsWrite);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ast.conditions).toHaveLength(1);
  });

  it('parses context references', () => {
    const source = `restrict fs.read {
      path matches context.agent.workspace
    }`;
    const result = parse(source, CapabilityType.FsRead);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.ast.conditions[0]!.value).toEqual({
      kind: 'context_ref',
      path: 'context.agent.workspace',
    });
  });
});

// ---------------------------------------------------------------------------
// Parser: invalid DSL
// ---------------------------------------------------------------------------

describe('DSL Parser — invalid input', () => {
  it('rejects empty source', () => {
    const result = parse('', CapabilityType.FsWrite);
    expect(result.ok).toBe(false);
  });

  it('rejects missing restrict keyword', () => {
    const result = parse('fs.write { path matches "/**" }', CapabilityType.FsWrite);
    expect(result.ok).toBe(false);
  });

  it('rejects capability type mismatch', () => {
    const source = `restrict fs.read { path matches "/**" }`;
    const result = parse(source, CapabilityType.FsWrite);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.message).toContain('mismatch');
  });

  it('rejects empty restriction block', () => {
    const source = `restrict fs.write { }`;
    const result = parse(source, CapabilityType.FsWrite);
    expect(result.ok).toBe(false);
  });

  it('rejects unterminated string', () => {
    const source = `restrict fs.write { path matches "unterminated }`;
    const result = parse(source, CapabilityType.FsWrite);
    expect(result.ok).toBe(false);
  });

  it('reports line and column on error', () => {
    const source = `restrict fs.write {
  path matches
}`;
    const result = parse(source, CapabilityType.FsWrite);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.line).toBeGreaterThan(0);
    expect(result.errors[0]!.column).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Compiler: compile()
// ---------------------------------------------------------------------------

describe('DSL Compiler — compile()', () => {
  it('compiles valid DSL to RestrictionIR', () => {
    const source = `restrict fs.write {
      path matches "./docs/**"
      max_bytes <= 1048576
    }`;
    const ir = compile(source, CapabilityType.FsWrite);
    expect(ir.capabilityType).toBe(CapabilityType.FsWrite);
    expect(ir.conditions).toHaveLength(2);
  });

  it('produces deterministic IR (same source → same output)', () => {
    const source = `restrict fs.write {
      max_bytes <= 100
      path matches "./src/**"
    }`;
    const ir1 = compile(source, CapabilityType.FsWrite);
    const ir2 = compile(source, CapabilityType.FsWrite);
    expect(ir1).toEqual(ir2);
  });

  it('produces deterministic hash (I4)', () => {
    const source = `restrict fs.write {
      path matches "./docs/**"
    }`;
    const ir = compile(source, CapabilityType.FsWrite);
    const h1 = hash(ir);
    const h2 = hash(ir);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64); // SHA-256 hex
  });

  it('sorts conditions canonically regardless of input order', () => {
    const source1 = `restrict fs.write {
      path matches "./src/**"
      max_bytes <= 100
    }`;
    const source2 = `restrict fs.write {
      max_bytes <= 100
      path matches "./src/**"
    }`;
    const ir1 = compile(source1, CapabilityType.FsWrite);
    const ir2 = compile(source2, CapabilityType.FsWrite);
    expect(hash(ir1)).toBe(hash(ir2));
  });

  it('throws on invalid DSL', () => {
    expect(() => compile('invalid', CapabilityType.FsWrite)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// Compiler: validate()
// ---------------------------------------------------------------------------

describe('DSL Compiler — validate()', () => {
  it('returns ok for valid DSL', () => {
    const source = `restrict fs.write {
      path matches "./docs/**"
    }`;
    const result = validate(source, CapabilityType.FsWrite);
    expect(result.ok).toBe(true);
  });

  it('returns errors for invalid syntax', () => {
    const result = validate('not valid dsl', CapabilityType.FsWrite);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('returns errors for semantic violations (numeric op on string)', () => {
    const source = `restrict fs.write {
      path <= "not a number"
    }`;
    const result = validate(source, CapabilityType.FsWrite);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.message).toContain('numeric');
  });

  it('returns errors for in operator on non-list', () => {
    const source = `restrict fs.write {
      path in "not-a-list"
    }`;
    const result = validate(source, CapabilityType.FsWrite);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.message).toContain('list');
  });

  it('returns errors for empty list with in operator', () => {
    const source = `restrict net.fetch.http {
      method in []
    }`;
    const result = validate(source, CapabilityType.NetFetchHttp);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.message).toContain('non-empty');
  });

  it('returns errors for matches operator on non-string value', () => {
    const source = `restrict fs.write {
      path matches 42
    }`;
    const result = validate(source, CapabilityType.FsWrite);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.message).toContain('string');
  });
});

// ---------------------------------------------------------------------------
// Round-trip: parse → compile → hash determinism
// ---------------------------------------------------------------------------

describe('DSL Round-trip — parse → compile → hash', () => {
  it('full pipeline produces deterministic output', () => {
    const source = `restrict net.fetch.http {
      domain in ["api.example.com", "cdn.example.com"]
      method in ["GET", "HEAD"]
      max_bytes <= 1048576
    }`;

    // Parse
    const parsed = parse(source, CapabilityType.NetFetchHttp);
    expect(parsed.ok).toBe(true);

    // Compile
    const ir = compile(source, CapabilityType.NetFetchHttp);
    expect(ir.capabilityType).toBe(CapabilityType.NetFetchHttp);

    // Hash
    const h1 = hash(ir);
    const h2 = hash(compile(source, CapabilityType.NetFetchHttp));
    expect(h1).toBe(h2);
  });

  it('different DSL sources produce different hashes', () => {
    const source1 = `restrict fs.write { path matches "./docs/**" }`;
    const source2 = `restrict fs.write { path matches "./src/**" }`;
    const h1 = hash(compile(source1, CapabilityType.FsWrite));
    const h2 = hash(compile(source2, CapabilityType.FsWrite));
    expect(h1).not.toBe(h2);
  });
});
