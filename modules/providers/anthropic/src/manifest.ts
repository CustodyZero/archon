/**
 * Archon Anthropic Provider Module — Manifest
 *
 * Declares the Anthropic LLM provider module. This module provides the
 * llm.infer capability for inference via the Anthropic API.
 *
 * This module is NOT registered in the CLI first-party catalog for P0.
 * It is not enabled by default. Operator must explicitly load and enable it.
 *
 * DEV: module hash is a placeholder ('' as ModuleHash).
 * No network calls are made by this module in P0.
 *
 * @see docs/specs/module_api.md §12 (LLM provider modules)
 * @see docs/specs/capabilities.md §G (inference)
 */

import type { ModuleManifest, ModuleHash } from '@archon/kernel';
import { CapabilityType, RiskTier } from '@archon/kernel';

/**
 * Anthropic provider manifest.
 *
 * Declares: llm.infer (T1).
 * default_enabled: false — deny-by-default (Invariant I1).
 */
export const ANTHROPIC_MANIFEST: ModuleManifest = {
  module_id: 'provider.anthropic',
  module_name: 'Anthropic LLM Provider',
  version: '0.0.1',
  description: 'Anthropic API provider for LLM inference. Not enabled by default. Requires explicit operator enablement.',
  author: 'CustodyZero',
  license: 'Apache-2.0',
  // DEV: placeholder hash for skeleton module.
  hash: '' as ModuleHash,
  capability_descriptors: [
    {
      module_id: 'provider.anthropic',
      capability_id: 'llm.infer',
      type: CapabilityType.LlmInfer,
      tier: RiskTier.T1,
      params_schema: { model_id: 'string', temperature: 'number', max_tokens: 'number' },
      ack_required: false,
      default_enabled: false,
      hazards: [],
    },
  ],
  intrinsic_restrictions: [],
  hazard_declarations: [],
  suggested_profiles: [],
};
