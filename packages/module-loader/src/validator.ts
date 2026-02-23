/**
 * Archon Module Loader — Manifest Validator
 *
 * Validates module manifests and capability type declarations.
 *
 * The ModuleValidator is the primary enforcement point for Invariant I7
 * (taxonomy soundness): unknown capability types are rejected at module
 * load time. No module may introduce new capability types at runtime.
 *
 * The validateCapabilityTypes() method is fully implemented — it is
 * a complete enforcement of Invariant I7 and must not be stubbed.
 *
 * @see docs/specs/formal_governance.md §5 (I7: taxonomy soundness)
 * @see docs/specs/formal_governance.md §12 (taxonomy soundness formalism)
 * @see docs/specs/module_api.md §2 (module identity requirements)
 * @see docs/specs/module_api.md §3 (capability descriptor requirements)
 */

import {
  CapabilityType,
  NotImplementedError,
  type CapabilityDescriptor,
  type ModuleManifest,
  type ValidationError,
  type ValidationResult,
} from '@archon/kernel';

/**
 * Validates module manifests and capability type declarations.
 *
 * @see docs/specs/module_api.md §9.1 (module loading)
 * @see docs/specs/formal_governance.md §12 (taxonomy soundness)
 */
export class ModuleValidator {
  /**
   * Validate an unknown value as a ModuleManifest.
   *
   * Performs structural validation of all required manifest fields:
   * - module_id, module_name, version, description, author, license (required strings)
   * - capability_descriptors (non-empty array)
   * - All capability types must be in the core taxonomy (calls validateCapabilityTypes)
   * - No capability may have default_enabled: true (Invariant I1)
   *
   * @param manifest - Unknown value to validate as ModuleManifest
   * @returns ValidationResult<ModuleManifest> — typed manifest on success, errors on failure
   *
   * @throws {NotImplementedError} — stub implementation
   *   Will implement: full structural and semantic validation of all manifest fields
   *
   * @see docs/specs/module_api.md §2–§3
   * @see docs/specs/formal_governance.md §5 (I1, I7)
   */
  validateManifest(manifest: unknown): ValidationResult<ModuleManifest> {
    // TODO: validate manifest is a non-null object
    // TODO: validate all required string fields: module_id, module_name, version, description, author, license
    // TODO: validate version is valid semver
    // TODO: validate capability_descriptors is a non-empty array
    // TODO: call this.validateCapabilityTypes(capability_descriptors) — reject on unknown types
    // TODO: validate that all default_enabled fields are false (Invariant I1)
    // TODO: validate params_schema for each descriptor is a valid JSON Schema fragment
    // TODO: validate intrinsic_restrictions are syntactically valid DSL strings
    // TODO: validate hazard_declarations reference known capability types
    // TODO: cast to ModuleManifest and return { ok: true, value: manifest as ModuleManifest }
    throw new NotImplementedError(
      'module_api.md §2–§3, formal_governance.md §5 I1/I7 (manifest validation)',
    );
  }

  /**
   * Validate that all capability descriptors use known capability types.
   *
   * This method IS fully implemented. It enforces Invariant I7:
   * unknown capability types are rejected at module load time.
   *
   * For any capability c with type t: if t ∉ 𝓣 ⇒ reject module load.
   *
   * The valid capability types are the exhaustive set from CapabilityType enum.
   * No capability type may be introduced at runtime — new types require a
   * taxonomy PR updating docs/specs/capabilities.md.
   *
   * @param descriptors - Array of capability descriptors to validate
   * @returns ValidationResult<void> — ok if all types are known, errors if any are unknown
   *
   * @see docs/specs/formal_governance.md §5 (I7: taxonomy soundness)
   * @see docs/specs/formal_governance.md §12 (taxonomy soundness formalism)
   * @see docs/specs/capabilities.md §5 (taxonomy extension rule)
   */
  validateCapabilityTypes(
    descriptors: ReadonlyArray<CapabilityDescriptor>,
  ): ValidationResult<void> {
    // The valid taxonomy is the exhaustive set of CapabilityType enum values.
    // This set is fixed at compile time. Runtime extension is prohibited (I7).
    const validTypes = new Set<string>(Object.values(CapabilityType));
    const errors: ValidationError[] = [];

    for (const descriptor of descriptors) {
      if (!validTypes.has(descriptor.type)) {
        errors.push({
          message: `Unknown capability type: "${descriptor.type}". ` +
            `All capability types must exist in the core taxonomy. ` +
            `See docs/specs/capabilities.md. ` +
            `New types require a taxonomy PR (formal_governance.md §12).`,
          context: `capability_id: ${descriptor.capability_id}, module_id: ${descriptor.module_id}`,
        });
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }
    return { ok: true };
  }
}
