/**
 * Archon Kernel — Module Types
 *
 * Defines the module identity, manifest, and lifecycle status types.
 *
 * All modules — first-party and third-party — are external to the kernel
 * boundary and governed identically. There are no internal modules.
 * Modules are declarative: they declare capabilities and restrictions,
 * they do not execute kernel logic.
 *
 * @see docs/specs/module_api.md (module API contract)
 * @see docs/specs/formal_governance.md §11 (module contract formalism)
 * @see docs/specs/authority_and_composition_spec.md §9 (CCM requirements)
 */

import type { CapabilityDescriptor } from './capability.js';
import type { RestrictionPredicate, SuggestedProfile } from './restriction.js';

// ---------------------------------------------------------------------------
// Branded Types
// ---------------------------------------------------------------------------

/**
 * Opaque brand symbol for ModuleHash.
 * Prevents plain strings from being used as module content hashes.
 */
declare const __moduleHashBrand: unique symbol;

/**
 * A branded string representing the content hash of a module bundle.
 *
 * Computed by the Archon module loader at load time.
 * Modules cannot self-report their hash — the loader computes and stores it.
 *
 * @see docs/specs/module_api.md §2
 */
export type ModuleHash = string & {
  readonly [__moduleHashBrand]: 'ModuleHash';
};

// ---------------------------------------------------------------------------
// Module Identity
// ---------------------------------------------------------------------------

/**
 * The stable identity fields required of every module.
 *
 * The `hash` field is a branded type — it is never a plain string.
 * The kernel loader computes and sets the hash; modules cannot claim their
 * own hash.
 *
 * @see docs/specs/module_api.md §2 (module identity)
 * @see docs/specs/authority_and_composition_spec.md §9
 */
export interface ModuleIdentity {
  /** Stable globally unique module identifier. Reverse-domain format recommended. */
  readonly module_id: string;
  /** Human-readable module name. */
  readonly module_name: string;
  /** Semantic version string (semver). */
  readonly version: string;
  /** Non-marketing, precise description of what the module does. */
  readonly description: string;
  /** Author identifier. */
  readonly author: string;
  /** SPDX license identifier. */
  readonly license: string;
  /**
   * Content hash of the module bundle, computed by the Archon loader.
   * Branded type — cannot be a plain string. Prevents hash self-reporting.
   */
  readonly hash: ModuleHash;
}

// ---------------------------------------------------------------------------
// Module Manifest
// ---------------------------------------------------------------------------

/**
 * The full manifest of a compiled capability module.
 *
 * A manifest is the complete, declarative description of what a module
 * contributes to the Archon system. The kernel validates manifests at
 * load time and rejects invalid ones.
 *
 * Manifest invariants enforced at load time:
 * - All capability types must exist in the core taxonomy (Invariant I7)
 * - No capability may have default_enabled: true (Invariant I1)
 * - Intrinsic restrictions must be valid Archon Restriction DSL
 * - Module hash must be verified before the manifest is accepted
 *
 * @see docs/specs/module_api.md §2–§5
 * @see docs/specs/formal_governance.md §11
 */
export interface ModuleManifest extends ModuleIdentity {
  /** Declared capability descriptors. At least one is required. */
  readonly capability_descriptors: ReadonlyArray<CapabilityDescriptor>;
  /**
   * Optional intrinsic restrictions expressed as Archon Restriction DSL source strings.
   * The kernel validates and compiles these at load time.
   * Modules interact with DSL source only — they never produce or consume IR.
   *
   * @see docs/specs/module_api.md §5 (intrinsic restrictions)
   * @see docs/specs/reestriction-dsl-spec.md
   */
  readonly intrinsic_restrictions: ReadonlyArray<string>;
  /**
   * Resolved intrinsic restriction predicates — set by the kernel at load time
   * after compiling the DSL source strings. Not present in the raw module bundle.
   */
  readonly compiled_restrictions?: ReadonlyArray<RestrictionPredicate> | undefined;
  /**
   * Hazard pair declarations for capability types this module contributes.
   * Hazards trigger explicit operator confirmation when the combination is enabled.
   *
   * @see docs/specs/formal_governance.md §8 (hazard composition model)
   */
  readonly hazard_declarations: ReadonlyArray<{
    readonly type_a: import('@archon/restriction-dsl').CapabilityType;
    readonly type_b: import('@archon/restriction-dsl').CapabilityType;
    readonly description?: string | undefined;
  }>;
  /**
   * Non-authoritative profile suggestions from the module author.
   * Profiles must still go through the full Confirm-on-Change flow.
   * Modules cannot auto-apply profiles.
   *
   * @see docs/specs/module_api.md §7 (proposals and configuration hooks)
   * @see docs/specs/profiles.md §1
   */
  readonly suggested_profiles: ReadonlyArray<SuggestedProfile>;
}

// ---------------------------------------------------------------------------
// Module Lifecycle Status
// ---------------------------------------------------------------------------

/**
 * The lifecycle status of a module in the kernel registry.
 *
 * State transitions:
 * - Unloaded → Loaded (on successful load by ModuleLoader)
 * - Loaded → Disabled (initial state after registration — Invariant I1)
 * - Disabled → Enabled (requires explicit operator action + Confirm-on-Change)
 * - Enabled → Disabled (operator disablement)
 * - Any → Rejected (validation failure at load time)
 *
 * Invariant: modules start in Disabled state after registration.
 * The registry enforces this. There is no path from Loaded directly to Enabled.
 *
 * @see docs/specs/formal_governance.md §5 (I1: deny-by-default)
 * @see docs/specs/module_api.md §9.2 (enablement)
 */
export enum ModuleStatus {
  /** Module is not in the registry. */
  Unloaded = 'Unloaded',
  /** Module has been loaded and hash-verified but not yet registered. */
  Loaded = 'Loaded',
  /** Module is registered and enabled by the operator. */
  Enabled = 'Enabled',
  /**
   * Module is registered but disabled.
   * This is the initial state for all newly registered modules (Invariant I1).
   */
  Disabled = 'Disabled',
  /** Module failed validation at load time and was rejected. */
  Rejected = 'Rejected',
}
