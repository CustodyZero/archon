/**
 * Archon First-Party Exec Module — Manifest
 *
 * Declares the subprocess execution capability module. exec.run is T3
 * (high risk) — it enables arbitrary subprocess execution within the
 * CWD boundaries enforced by the ExecAdapter and P5 resource config.
 *
 * T3 capabilities require typed acknowledgment before enablement.
 * default_enabled is false (Invariant I1: deny-by-default).
 *
 * DEV: module hash is a placeholder ('' as ModuleHash). First-party modules
 * loaded from typed catalog constants do not go through bundle hash
 * verification for P0. The loader's I7 and I1 checks still apply.
 *
 * @see docs/specs/module_api.md §2 (module identity)
 * @see docs/specs/capabilities.md §3.D (exec capabilities)
 */

import type { ModuleManifest, ModuleHash } from '@archon/kernel';
import { CapabilityType, RiskTier } from '@archon/kernel';

/**
 * Exec module manifest.
 *
 * Declares: exec.run (T3).
 * ack_required: true — T3 typed acknowledgment is mandatory.
 * default_enabled: false — deny-by-default (Invariant I1).
 */
export const EXEC_MANIFEST: ModuleManifest = {
  module_id: 'exec',
  module_name: 'Archon Exec Module',
  version: '0.0.1',
  description: 'First-party subprocess execution module. T3 risk — requires typed acknowledgment.',
  author: 'CustodyZero',
  license: 'Apache-2.0',
  // DEV: placeholder hash for first-party typed constant.
  // Hash verification is bypassed via DEV_SKIP_HASH_VERIFICATION in the CLI catalog.
  hash: '' as ModuleHash,
  capability_descriptors: [
    {
      module_id: 'exec',
      capability_id: 'exec.run',
      type: CapabilityType.ExecRun,
      tier: RiskTier.T3,
      params_schema: {
        command: 'string',
        args: 'string[]',
        timeout_ms: 'number',
      },
      ack_required: true,
      default_enabled: false,
      hazards: [],
    },
  ],
  intrinsic_restrictions: [],
  hazard_declarations: [],
  suggested_profiles: [],
};
