/**
 * @archon/module-loader
 *
 * Archon module loader — manifest validation, hash verification, and
 * module registry.
 *
 * @see docs/specs/module_api.md
 * @see docs/specs/formal_governance.md §12 (taxonomy soundness)
 */

export type { LoadResult } from './loader.js';
export { ModuleLoader } from './loader.js';

export { ModuleRegistry } from './registry.js';
export { ModuleValidator } from './validator.js';
export { CapabilityRegistry } from './capability-registry.js';
export { RestrictionRegistry } from './restriction-registry.js';
