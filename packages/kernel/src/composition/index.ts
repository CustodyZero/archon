/**
 * Archon Kernel — Composition Module
 *
 * Re-exports all composition graph and capability resolution types/functions.
 *
 * @see docs/specs/module_api.md §3–§4
 */

export type {
  CompositionGraph,
  CycleDetectionResult,
} from './graph.js';

export {
  buildCompositionGraph,
  detectCycles,
  topologicalSort,
} from './graph.js';

export type { ResolvedCapabilitySet } from './resolver.js';

export {
  resolveEffectiveCapabilities,
  resolveAllEffectiveCapabilities,
} from './resolver.js';
