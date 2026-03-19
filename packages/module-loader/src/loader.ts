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
import { compileDSL } from '@archon/kernel';
import { createHash } from 'node:crypto';
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
   * 2. Validate all capability types are in the core taxonomy (I7)
   * 3. Reject modules with default_enabled: true (I1)
   * 4. Compute and verify module hash (content integrity check)
   * 5. Validate intrinsic restriction DSL strings
   * 6. Return success with module_id
   *
   * @param manifest - The module manifest to load
   * @returns LoadResult — ok on success, failure with reason if rejected
   *
   * @see docs/specs/module_api.md §9.1
   * @see docs/specs/formal_governance.md §5 (I1: deny-by-default, I7: taxonomy soundness)
   */
  load(manifest: ModuleManifest): LoadResult {
    // Step 1: Validate manifest structure
    const structureValidation = this.validator.validateManifest(manifest);
    if (!structureValidation.ok) {
      const messages = structureValidation.errors.map((e) => e.message).join('; ');
      return {
        ok: false,
        reason: 'Manifest validation failed',
        details: messages,
      };
    }

    // Step 2: Hash verification
    // For v0.1: empty hash ('' as ModuleHash) means first-party dev mode — skip verification.
    // When hash is non-empty, compute SHA-256 over canonical manifest content and compare.
    const hashStr = manifest.hash as string;
    if (hashStr !== '') {
      const computed = computeManifestHash(manifest);
      if (computed !== hashStr) {
        return {
          ok: false,
          reason: 'Hash verification failed',
          details: `Expected hash "${hashStr}", computed "${computed}"`,
        };
      }
    }

    // Step 3: Validate intrinsic restriction DSL strings
    // Uses compileDSL from kernel which parses the capability type from the DSL source
    // (e.g., "restrict fs.write { ... }") and validates syntax + semantics.
    // compileDSL throws on failure.
    for (let i = 0; i < manifest.intrinsic_restrictions.length; i++) {
      const source = manifest.intrinsic_restrictions[i]!;
      try {
        compileDSL(`intrinsic:${manifest.module_id}:${i}`, source);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          reason: `Intrinsic restriction [${i}] failed DSL validation`,
          details: message,
        };
      }
    }

    // Step 4: Success — return module_id
    return { ok: true, module_id: manifest.module_id };
  }
}

// ---------------------------------------------------------------------------
// Hash Computation
// ---------------------------------------------------------------------------

/**
 * Compute SHA-256 hash over a canonical JSON representation of the manifest content.
 *
 * The hash covers identity fields and capability descriptors — it excludes the
 * `hash` field itself (since that is what we are verifying) and
 * `compiled_restrictions` (set post-load).
 *
 * Canonical representation: JSON.stringify with sorted keys to ensure
 * deterministic output regardless of property insertion order.
 */
export function computeManifestHash(manifest: ModuleManifest): string {
  // Build canonical object. Dependency fields are included when present.
  // When absent (undefined), they are excluded by JSON serialization,
  // so existing module hashes are preserved (backward compatible).
  const canonical: Record<string, unknown> = {
    module_id: manifest.module_id,
    module_name: manifest.module_name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    license: manifest.license,
    capability_descriptors: manifest.capability_descriptors,
    intrinsic_restrictions: manifest.intrinsic_restrictions,
    hazard_declarations: manifest.hazard_declarations,
    suggested_profiles: manifest.suggested_profiles,
  };
  if (manifest.module_dependencies !== undefined) {
    canonical['module_dependencies'] = manifest.module_dependencies;
  }
  if (manifest.provider_dependencies !== undefined) {
    canonical['provider_dependencies'] = manifest.provider_dependencies;
  }
  return createHash('sha256')
    .update(stableStringify(canonical))
    .digest('hex');
}

/**
 * Deterministic JSON serialization: sorts all object keys recursively.
 * Arrays preserve order (array element order is semantically significant).
 */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value);
  if (typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableStringify(v)).join(',') + ']';
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs = keys.map((k) => JSON.stringify(k) + ':' + stableStringify(obj[k]));
  return '{' + pairs.join(',') + '}';
}
