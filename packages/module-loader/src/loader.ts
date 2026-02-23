/**
 * Archon Module Loader — Module Loader
 *
 * The ModuleLoader validates, hashes, and loads module manifests into
 * the kernel registry.
 *
 * Loading is a multi-step process:
 * 1. Validate manifest structure (ModuleValidator.validateManifest)
 * 2. Validate capability types against taxonomy (Invariant I7)
 * 3. Validate intrinsic restriction DSL (if present)
 * 4. Compute and verify module hash (content integrity)
 * 5. Refuse modules with default_enabled: true (Invariant I1)
 * 6. Register in ModuleRegistry as Disabled
 *
 * @see docs/specs/module_api.md §9.1 (module loading)
 * @see docs/specs/formal_governance.md §5 (I1, I7)
 */

import type { ModuleManifest } from '@archon/kernel';
import { NotImplementedError } from '@archon/kernel';
import { ModuleValidator } from './validator.js';

// ---------------------------------------------------------------------------
// Load Result
// ---------------------------------------------------------------------------

/**
 * The result of a module load attempt.
 * A discriminated union: either success with the loaded module_id, or
 * failure with a structured reason.
 */
export type LoadResult =
  | { readonly ok: true; readonly module_id: string }
  | { readonly ok: false; readonly reason: string; readonly details?: string | undefined };

// ---------------------------------------------------------------------------
// Module Loader
// ---------------------------------------------------------------------------

/**
 * Loads module manifests through the full validation and registration pipeline.
 *
 * @see docs/specs/module_api.md §9.1
 */
export class ModuleLoader {
  private readonly validator: ModuleValidator;

  constructor() {
    this.validator = new ModuleValidator();
  }

  /**
   * Load a module manifest through the full validation pipeline.
   *
   * Steps performed:
   * 1. Validate manifest structure via ModuleValidator.validateManifest()
   * 2. Validate all capability types are in the core taxonomy (I7 — implemented)
   * 3. Reject modules with default_enabled: true (I1)
   * 4. Compute and verify module hash (content integrity check)
   * 5. Validate intrinsic restriction DSL strings
   * 6. Register in ModuleRegistry as Disabled
   *
   * Step 2 (capability type validation) is complete.
   * Steps 4 (hash verification) and 5 (DSL validation) are stubs.
   *
   * @param manifest - The module manifest to load
   * @returns LoadResult — ok on success, failure with reason if rejected
   *
   * @throws {NotImplementedError} — stub for hash verification
   *   Will implement: compute SHA-256 over module bundle, compare against manifest.hash
   *
   * @see docs/specs/module_api.md §9.1
   * @see docs/specs/formal_governance.md §5 (I1: deny-by-default, I7: taxonomy soundness)
   */
  load(manifest: ModuleManifest): LoadResult {
    // Step 1: Validate capability types (I7 — fully implemented)
    const typeValidation = this.validator.validateCapabilityTypes(
      manifest.capability_descriptors,
    );
    if (!typeValidation.ok) {
      const messages = typeValidation.errors.map((e) => e.message).join('; ');
      return {
        ok: false,
        reason: 'Capability type validation failed (Invariant I7)',
        details: messages,
      };
    }

    // Step 2: Refuse modules declaring default_enabled: true (I1)
    const hasDefaultEnabled = manifest.capability_descriptors.some(
      (d) => d.default_enabled,
    );
    if (hasDefaultEnabled) {
      return {
        ok: false,
        reason: 'Module declares default_enabled: true (Invariant I1 violation)',
        details: 'No capability may be default-enabled. ' +
          'All modules start Disabled. See formal_governance.md §5 I1.',
      };
    }

    // Step 3: Hash verification — STUB
    // TODO: compute SHA-256 over the module bundle content
    // TODO: compare computed hash against manifest.hash (branded ModuleHash)
    // TODO: reject module if hashes do not match
    throw new NotImplementedError(
      'module_api.md §9.1 step 4 (module hash verification)',
    );

    // Step 4 (not yet reached): validate intrinsic DSL strings
    // TODO: call restriction-dsl validate() for each intrinsic_restriction string
    // TODO: reject module if any DSL string fails validation
    // TODO: compile DSL strings to IR and store as compiled_restrictions
    //
    // Step 5 (not yet reached): register in registry as Disabled
    // TODO: call ModuleRegistry.register(manifest) — starts Disabled (I1)
    // TODO: return { ok: true, module_id: manifest.module_id }
  }
}
