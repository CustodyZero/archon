/**
 * Archon Kernel — Composition Graph
 *
 * Pure functions for constructing, validating, and traversing
 * module dependency graphs.
 *
 * All functions are deterministic: identical inputs produce identical outputs.
 * No I/O, no ambient state. Ordering is lexicographic by module_id for I4
 * (snapshot determinism) compliance.
 *
 * @see docs/specs/module_api.md §3 (composition traversal)
 * @see docs/specs/module_api.md §4.1 (graph must be acyclic)
 * @see docs/specs/formal_governance.md §5 (I4: snapshot determinism)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A directed graph of module dependencies.
 *
 * Nodes are module_ids. Edges point from a module to its dependencies.
 * The graph is constructed from ModuleManifest.module_dependencies fields.
 */
export interface CompositionGraph {
  /** All module_ids in the graph, sorted lexicographically. */
  readonly nodes: ReadonlyArray<string>;
  /** Adjacency list: module_id → list of dependency module_ids. */
  readonly edges: ReadonlyMap<string, ReadonlyArray<string>>;
}

/**
 * Result of cycle detection on a composition graph.
 */
export interface CycleDetectionResult {
  /** True if the graph contains at least one cycle. */
  readonly hasCycle: boolean;
  /** The module_ids forming the cycle, if one was found. First and last element are the same. */
  readonly cyclePath?: ReadonlyArray<string> | undefined;
}

// ---------------------------------------------------------------------------
// Graph Construction
// ---------------------------------------------------------------------------

/**
 * Input shape for graph construction.
 * Accepts any object with module_id and optional module_dependencies —
 * does not require full ModuleManifest.
 */
interface GraphInput {
  readonly module_id: string;
  readonly module_dependencies?: ReadonlyArray<string> | undefined;
}

/**
 * Build a composition graph from a set of modules.
 *
 * Modules without module_dependencies (undefined or empty) have no outgoing edges.
 * The node list is sorted lexicographically for determinism (I4).
 *
 * @param modules - Modules to include in the graph
 * @returns CompositionGraph with sorted nodes and adjacency list
 */
export function buildCompositionGraph(
  modules: ReadonlyArray<GraphInput>,
): CompositionGraph {
  const nodeSet = new Set<string>();
  const edgeMap = new Map<string, ReadonlyArray<string>>();

  for (const m of modules) {
    nodeSet.add(m.module_id);
    const deps = m.module_dependencies ?? [];
    // Sort dependency list for deterministic edge ordering (I4).
    edgeMap.set(m.module_id, [...deps].sort());
  }

  const sortedNodes = [...nodeSet].sort();
  return { nodes: sortedNodes, edges: edgeMap };
}

// ---------------------------------------------------------------------------
// Cycle Detection
// ---------------------------------------------------------------------------

/** DFS coloring: white = unvisited, gray = in current path, black = fully explored. */
const enum Color {
  White = 0,
  Gray = 1,
  Black = 2,
}

/**
 * Detect cycles in a composition graph using DFS with gray/black coloring.
 *
 * Processes nodes in sorted order for deterministic cycle reporting (I4).
 * Returns the first cycle found (not all cycles).
 *
 * @param graph - The composition graph to check
 * @returns CycleDetectionResult with hasCycle and optional cyclePath
 */
export function detectCycles(graph: CompositionGraph): CycleDetectionResult {
  const color = new Map<string, Color>();
  for (const node of graph.nodes) {
    color.set(node, Color.White);
  }

  const path: string[] = [];

  function dfs(node: string): ReadonlyArray<string> | undefined {
    color.set(node, Color.Gray);
    path.push(node);

    const neighbors = graph.edges.get(node) ?? [];
    for (const neighbor of neighbors) {
      const neighborColor = color.get(neighbor);

      if (neighborColor === Color.Gray) {
        // Found a back edge — extract the cycle from path.
        const cycleStart = path.indexOf(neighbor);
        return [...path.slice(cycleStart), neighbor];
      }

      if (neighborColor === Color.White || neighborColor === undefined) {
        const cycle = dfs(neighbor);
        if (cycle !== undefined) return cycle;
      }
      // Black nodes are fully explored — skip.
    }

    path.pop();
    color.set(node, Color.Black);
    return undefined;
  }

  // Process in sorted order for deterministic results.
  for (const node of graph.nodes) {
    if (color.get(node) === Color.White) {
      const cycle = dfs(node);
      if (cycle !== undefined) {
        return { hasCycle: true, cyclePath: cycle };
      }
    }
  }

  return { hasCycle: false };
}

// ---------------------------------------------------------------------------
// Topological Sort
// ---------------------------------------------------------------------------

/**
 * Produce a deterministic topological ordering of the composition graph.
 *
 * Uses Kahn's algorithm (BFS-based). Ties among nodes with in-degree 0
 * are broken by lexicographic module_id sort, ensuring I4 determinism.
 *
 * The output order is "dependencies first": if A depends on B, B appears
 * before A in the result. This is the natural load order.
 *
 * @param graph - The composition graph to sort (must be acyclic)
 * @returns Topologically sorted module_ids (dependencies first)
 * @throws {Error} If the graph contains a cycle
 */
export function topologicalSort(graph: CompositionGraph): ReadonlyArray<string> {
  // Compute in-degrees.
  const inDegree = new Map<string, number>();
  for (const node of graph.nodes) {
    inDegree.set(node, 0);
  }

  for (const node of graph.nodes) {
    const deps = graph.edges.get(node) ?? [];
    for (const dep of deps) {
      // dep might not be in graph.nodes if it references an unregistered module.
      // In that case we still track it to detect the missing dependency downstream.
      inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
    }
  }

  // Wait — the edges point from a module to its dependencies.
  // If A depends on B, the edge is A→B.
  // In topological sort, B must come before A.
  // In-degree should count incoming edges. Since A→B means "A depends on B",
  // B is a dependency of A. For topological ordering (dependencies first),
  // we need to reverse: B should come first.
  //
  // With Kahn's on the original graph (A→B), in-degree of B is 1.
  // We start with nodes that have in-degree 0 (no one depends on them? No,
  // that's wrong — no one *points to* them means no one lists them as a dep).
  //
  // Actually: edges are A→B meaning "A lists B in module_dependencies".
  // In-degree of B = count of modules that depend on B.
  // Kahn's on this graph gives us: nodes with no incoming edges first,
  // which are modules that no one depends on — that's the *wrong* order.
  //
  // We need the REVERSE: dependencies first, dependents last.
  // So we should either:
  // 1. Reverse the result of Kahn's on the original graph, or
  // 2. Run Kahn's on the reversed graph.
  //
  // Let's re-compute with reversed edges for clarity.

  // Re-compute: reverse the edge direction.
  // Original: A→B means "A depends on B"
  // Reversed: B→A means "B is depended on by A"
  // Kahn's on reversed graph: start with nodes no one depends on... no.
  //
  // Actually, let me just think clearly:
  // We want: if A depends on B, output B before A.
  // Standard topological sort: if edge U→V, output U before V.
  // Our edges: A→B (A depends on B).
  // If we reverse to B→A, then standard topo sort outputs B before A. Correct.

  const reversedInDegree = new Map<string, number>();
  const reversedEdges = new Map<string, string[]>();
  for (const node of graph.nodes) {
    reversedInDegree.set(node, 0);
    reversedEdges.set(node, []);
  }

  for (const node of graph.nodes) {
    const deps = graph.edges.get(node) ?? [];
    for (const dep of deps) {
      // Only consider deps that are in the node set.
      if (reversedEdges.has(dep)) {
        reversedEdges.get(dep)!.push(node);
        reversedInDegree.set(node, (reversedInDegree.get(node) ?? 0) + 1);
      }
    }
  }

  // Kahn's algorithm with lexicographic tie-breaking.
  const queue: string[] = [];
  for (const node of graph.nodes) {
    if ((reversedInDegree.get(node) ?? 0) === 0) {
      queue.push(node);
    }
  }
  queue.sort(); // Lexicographic order for determinism (I4).

  const result: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    const dependents = reversedEdges.get(current) ?? [];
    for (const dependent of dependents) {
      const deg = (reversedInDegree.get(dependent) ?? 1) - 1;
      reversedInDegree.set(dependent, deg);
      if (deg === 0) {
        queue.push(dependent);
        // Re-sort to maintain lexicographic tie-breaking.
        queue.sort();
      }
    }
  }

  if (result.length !== graph.nodes.length) {
    throw new Error(
      'Composition graph contains a cycle — topological sort is not possible. ' +
        'Use detectCycles() for diagnostics.',
    );
  }

  return result;
}
