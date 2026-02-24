/**
 * Archon First-Party Filesystem Module — Manifest
 *
 * Declares the filesystem capability module. This is a typed constant —
 * the loader's hash verification step is bypassed for first-party typed
 * constants via DEV_SKIP_HASH_VERIFICATION in the CLI catalog.
 *
 * DEV: module hash is a placeholder ('' as ModuleHash). First-party modules
 * loaded from typed catalog constants do not go through bundle hash verification
 * for P0. This is explicitly labeled and isolated to the first-party catalog.
 * The loader's I7 and I1 checks still apply.
 *
 * @see docs/specs/module_api.md §2 (module identity)
 * @see docs/specs/capabilities.md §3.B (filesystem capabilities)
 */

import type { ModuleManifest, ModuleHash } from '@archon/kernel';
import { CapabilityType, RiskTier } from '@archon/kernel';

/**
 * Filesystem module manifest.
 *
 * Declares: fs.read (T1), fs.list (T1), fs.write (T2), fs.delete (T3).
 * All default_enabled: false — deny-by-default is enforced (Invariant I1).
 */
export const FILESYSTEM_MANIFEST: ModuleManifest = {
  module_id: 'filesystem',
  module_name: 'Archon Filesystem Module',
  version: '0.0.1',
  description: 'First-party filesystem capability module for read, list, write, and delete operations.',
  author: 'CustodyZero',
  license: 'Apache-2.0',
  // DEV: placeholder hash for first-party typed constant.
  // Hash verification is bypassed via DEV_SKIP_HASH_VERIFICATION in the CLI catalog.
  hash: '' as ModuleHash,
  capability_descriptors: [
    {
      module_id: 'filesystem',
      capability_id: 'fs.read',
      type: CapabilityType.FsRead,
      tier: RiskTier.T1,
      params_schema: { path_glob: 'string', max_bytes: 'number' },
      ack_required: false,
      default_enabled: false,
      hazards: [],
    },
    {
      module_id: 'filesystem',
      capability_id: 'fs.list',
      type: CapabilityType.FsList,
      tier: RiskTier.T1,
      params_schema: { path_glob: 'string' },
      ack_required: false,
      default_enabled: false,
      hazards: [],
    },
    {
      module_id: 'filesystem',
      capability_id: 'fs.write',
      type: CapabilityType.FsWrite,
      tier: RiskTier.T2,
      params_schema: { path_glob: 'string', max_bytes: 'number', overwrite_allowed: 'boolean' },
      ack_required: false,
      default_enabled: false,
      hazards: [],
    },
    {
      module_id: 'filesystem',
      capability_id: 'fs.delete',
      type: CapabilityType.FsDelete,
      tier: RiskTier.T3,
      params_schema: { path_glob: 'string' },
      ack_required: true,
      default_enabled: false,
      hazards: [],
    },
  ],
  intrinsic_restrictions: [],
  hazard_declarations: [],
  suggested_profiles: [],
};
