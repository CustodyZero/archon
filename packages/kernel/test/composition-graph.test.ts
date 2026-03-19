/**
 * Archon Kernel — Composition Graph Tests
 *
 * Verifies DAG construction, cycle detection, and topological sort
 * for module composition graphs.
 *
 * All tests are pure: no I/O.
 *
 * @see docs/specs/module_api.md §4.1 (graph must be acyclic)
 * @see docs/specs/formal_governance.md §5 (I4: snapshot determinism)
 */

import { describe, it, expect } from 'vitest';
import {
  buildCompositionGraph,
  detectCycles,
  topologicalSort,
} from '../src/composition/graph.js';

// ---------------------------------------------------------------------------
// buildCompositionGraph
// ---------------------------------------------------------------------------

describe('composition-graph/build', () => {
  it('empty module set produces empty graph', () => {
    const graph = buildCompositionGraph([]);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges.size).toBe(0);
  });

  it('modules with no dependencies produce graph with no edges', () => {
    const graph = buildCompositionGraph([
      { module_id: 'b' },
      { module_id: 'a' },
    ]);
    expect(graph.nodes).toEqual(['a', 'b']); // sorted
    expect(graph.edges.get('a')).toEqual([]);
    expect(graph.edges.get('b')).toEqual([]);
  });

  it('modules with undefined module_dependencies produce empty edges', () => {
    const graph = buildCompositionGraph([
      { module_id: 'x', module_dependencies: undefined },
    ]);
    expect(graph.edges.get('x')).toEqual([]);
  });

  it('linear chain A→B→C produces correct edges', () => {
    const graph = buildCompositionGraph([
      { module_id: 'a', module_dependencies: ['b'] },
      { module_id: 'b', module_dependencies: ['c'] },
      { module_id: 'c' },
    ]);
    expect(graph.edges.get('a')).toEqual(['b']);
    expect(graph.edges.get('b')).toEqual(['c']);
    expect(graph.edges.get('c')).toEqual([]);
  });

  it('diamond dependency produces correct edges', () => {
    const graph = buildCompositionGraph([
      { module_id: 'a', module_dependencies: ['b', 'c'] },
      { module_id: 'b', module_dependencies: ['d'] },
      { module_id: 'c', module_dependencies: ['d'] },
      { module_id: 'd' },
    ]);
    expect(graph.edges.get('a')).toEqual(['b', 'c']); // sorted
    expect(graph.edges.get('b')).toEqual(['d']);
    expect(graph.edges.get('c')).toEqual(['d']);
    expect(graph.edges.get('d')).toEqual([]);
  });

  it('node list is sorted lexicographically (I4)', () => {
    const graph = buildCompositionGraph([
      { module_id: 'zeta' },
      { module_id: 'alpha' },
      { module_id: 'mid' },
    ]);
    expect(graph.nodes).toEqual(['alpha', 'mid', 'zeta']);
  });

  it('dependency edges are sorted lexicographically (I4)', () => {
    const graph = buildCompositionGraph([
      { module_id: 'a', module_dependencies: ['z', 'b', 'm'] },
    ]);
    expect(graph.edges.get('a')).toEqual(['b', 'm', 'z']);
  });
});

// ---------------------------------------------------------------------------
// detectCycles
// ---------------------------------------------------------------------------

describe('composition-graph/cycles', () => {
  it('acyclic graph: no cycle detected', () => {
    const graph = buildCompositionGraph([
      { module_id: 'a', module_dependencies: ['b'] },
      { module_id: 'b' },
    ]);
    const result = detectCycles(graph);
    expect(result.hasCycle).toBe(false);
    expect(result.cyclePath).toBeUndefined();
  });

  it('self-dependency detected as cycle', () => {
    const graph = buildCompositionGraph([
      { module_id: 'a', module_dependencies: ['a'] },
    ]);
    const result = detectCycles(graph);
    expect(result.hasCycle).toBe(true);
    expect(result.cyclePath).toEqual(['a', 'a']);
  });

  it('triangle cycle A→B→C→A detected', () => {
    const graph = buildCompositionGraph([
      { module_id: 'a', module_dependencies: ['b'] },
      { module_id: 'b', module_dependencies: ['c'] },
      { module_id: 'c', module_dependencies: ['a'] },
    ]);
    const result = detectCycles(graph);
    expect(result.hasCycle).toBe(true);
    // The cycle path should contain the cycle and start/end with same node.
    expect(result.cyclePath![0]).toBe(result.cyclePath![result.cyclePath!.length - 1]);
  });

  it('diamond dependency (no cycle)', () => {
    const graph = buildCompositionGraph([
      { module_id: 'a', module_dependencies: ['b', 'c'] },
      { module_id: 'b', module_dependencies: ['d'] },
      { module_id: 'c', module_dependencies: ['d'] },
      { module_id: 'd' },
    ]);
    expect(detectCycles(graph).hasCycle).toBe(false);
  });

  it('empty graph: no cycle', () => {
    const graph = buildCompositionGraph([]);
    expect(detectCycles(graph).hasCycle).toBe(false);
  });

  it('disconnected components with one cycle', () => {
    const graph = buildCompositionGraph([
      { module_id: 'a', module_dependencies: ['b'] },
      { module_id: 'b' },
      { module_id: 'x', module_dependencies: ['y'] },
      { module_id: 'y', module_dependencies: ['x'] },
    ]);
    const result = detectCycles(graph);
    expect(result.hasCycle).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// topologicalSort
// ---------------------------------------------------------------------------

describe('composition-graph/topological-sort', () => {
  it('empty graph produces empty ordering', () => {
    const graph = buildCompositionGraph([]);
    expect(topologicalSort(graph)).toEqual([]);
  });

  it('independent modules sorted lexicographically', () => {
    const graph = buildCompositionGraph([
      { module_id: 'c' },
      { module_id: 'a' },
      { module_id: 'b' },
    ]);
    expect(topologicalSort(graph)).toEqual(['a', 'b', 'c']);
  });

  it('linear chain A→B→C produces dependencies-first order', () => {
    const graph = buildCompositionGraph([
      { module_id: 'a', module_dependencies: ['b'] },
      { module_id: 'b', module_dependencies: ['c'] },
      { module_id: 'c' },
    ]);
    const order = topologicalSort(graph);
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
  });

  it('diamond A→B,C→D produces valid topological order', () => {
    const graph = buildCompositionGraph([
      { module_id: 'a', module_dependencies: ['b', 'c'] },
      { module_id: 'b', module_dependencies: ['d'] },
      { module_id: 'c', module_dependencies: ['d'] },
      { module_id: 'd' },
    ]);
    const order = topologicalSort(graph);
    // d must come before b and c; b and c must come before a
    expect(order.indexOf('d')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('d')).toBeLessThan(order.indexOf('c'));
    expect(order.indexOf('b')).toBeLessThan(order.indexOf('a'));
    expect(order.indexOf('c')).toBeLessThan(order.indexOf('a'));
  });

  it('throws on cyclic graph', () => {
    const graph = buildCompositionGraph([
      { module_id: 'a', module_dependencies: ['b'] },
      { module_id: 'b', module_dependencies: ['a'] },
    ]);
    expect(() => topologicalSort(graph)).toThrow('cycle');
  });

  it('determinism: same input in different order produces identical output', () => {
    const modules1 = [
      { module_id: 'x', module_dependencies: ['y'] },
      { module_id: 'y' },
      { module_id: 'z', module_dependencies: ['y'] },
    ];
    const modules2 = [
      { module_id: 'z', module_dependencies: ['y'] },
      { module_id: 'y' },
      { module_id: 'x', module_dependencies: ['y'] },
    ];
    const order1 = topologicalSort(buildCompositionGraph(modules1));
    const order2 = topologicalSort(buildCompositionGraph(modules2));
    expect(order1).toEqual(order2);
  });

  it('single node produces single-element array', () => {
    const graph = buildCompositionGraph([{ module_id: 'solo' }]);
    expect(topologicalSort(graph)).toEqual(['solo']);
  });
});
