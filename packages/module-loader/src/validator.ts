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
   * @see docs/specs/module_api.md §2–§3
   * @see docs/specs/formal_governance.md §5 (I1, I7)
   */
  validateManifest(manifest: unknown): ValidationResult<ModuleManifest> {
    const errors: ValidationError[] = [];

    // Step 1: manifest must be a non-null object
    if (manifest === null || manifest === undefined || typeof manifest !== 'object') {
      return { ok: false, errors: [{ message: 'Manifest must be a non-null object' }] };
    }

    const m = manifest as Record<string, unknown>;

    // Step 2: validate all required string fields
    const requiredStringFields = [
      'module_id', 'module_name', 'version', 'description', 'author', 'license',
    ] as const;

    for (const field of requiredStringFields) {
      if (typeof m[field] !== 'string' || m[field] === '') {
        errors.push({
          message: `"${field}" must be a non-empty string`,
          context: `manifest.${field}`,
        });
      }
    }

    // Step 3: validate version is valid semver (X.Y.Z pattern)
    if (typeof m['version'] === 'string' && m['version'] !== '') {
      if (!/^\d+\.\d+\.\d+$/.test(m['version'])) {
        errors.push({
          message: `"version" must be valid semver (X.Y.Z)`,
          context: `manifest.version = "${m['version']}"`,
        });
      }
    }

    // Step 4: validate capability_descriptors is a non-empty array
    if (!Array.isArray(m['capability_descriptors']) || m['capability_descriptors'].length === 0) {
      errors.push({
        message: '"capability_descriptors" must be a non-empty array',
        context: 'manifest.capability_descriptors',
      });
      // Cannot proceed with descriptor-level validation
      return { ok: false, errors };
    }

    const descriptors = m['capability_descriptors'] as CapabilityDescriptor[];

    // Step 5: validate capability types against taxonomy (I7)
    const typeResult = this.validateCapabilityTypes(descriptors);
    if (!typeResult.ok) {
      errors.push(...typeResult.errors);
    }

    // Step 6: validate all default_enabled fields are false (I1)
    for (const descriptor of descriptors) {
      if (descriptor.default_enabled) {
        errors.push({
          message: `Capability "${descriptor.capability_id}" declares default_enabled: true (Invariant I1 violation)`,
          context: `module_id: ${descriptor.module_id}, capability_id: ${descriptor.capability_id}`,
        });
      }
    }

    // Step 7: validate params_schema for each descriptor is a non-null object
    for (const descriptor of descriptors) {
      if (
        descriptor.params_schema === null ||
        descriptor.params_schema === undefined ||
        typeof descriptor.params_schema !== 'object' ||
        Array.isArray(descriptor.params_schema)
      ) {
        errors.push({
          message: `Capability "${descriptor.capability_id}" has invalid params_schema: must be a non-null object`,
          context: `module_id: ${descriptor.module_id}, capability_id: ${descriptor.capability_id}`,
        });
      }
    }

    // Step 8: validate intrinsic_restrictions are strings (if present)
    if (m['intrinsic_restrictions'] !== undefined) {
      if (!Array.isArray(m['intrinsic_restrictions'])) {
        errors.push({
          message: '"intrinsic_restrictions" must be an array of strings',
          context: 'manifest.intrinsic_restrictions',
        });
      } else {
        for (let i = 0; i < m['intrinsic_restrictions'].length; i++) {
          if (typeof m['intrinsic_restrictions'][i] !== 'string') {
            errors.push({
              message: `intrinsic_restrictions[${i}] must be a string`,
              context: 'manifest.intrinsic_restrictions',
            });
          }
        }
      }
    }

    // Step 9: validate hazard_declarations reference known capability types
    if (m['hazard_declarations'] !== undefined && Array.isArray(m['hazard_declarations'])) {
      const validTypes = new Set<string>(Object.values(CapabilityType));
      for (let i = 0; i < m['hazard_declarations'].length; i++) {
        const decl = m['hazard_declarations'][i] as { type_a?: string; type_b?: string };
        if (decl.type_a !== undefined && !validTypes.has(decl.type_a)) {
          errors.push({
            message: `hazard_declarations[${i}].type_a references unknown capability type: "${decl.type_a}"`,
            context: 'manifest.hazard_declarations',
          });
        }
        if (decl.type_b !== undefined && !validTypes.has(decl.type_b)) {
          errors.push({
            message: `hazard_declarations[${i}].type_b references unknown capability type: "${decl.type_b}"`,
            context: 'manifest.hazard_declarations',
          });
        }
      }
    }

    if (errors.length > 0) {
      return { ok: false, errors };
    }

    return { ok: true, value: manifest as ModuleManifest };
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
