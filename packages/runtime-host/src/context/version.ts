/**
 * Archon Runtime Host — Engine Version
 *
 * Single source of truth for the Archon engine version string.
 * Used in all emitted event envelopes (ACM-001).
 *
 * Replaces the duplicated ENGINE_VERSION constants in cli/demo.ts and
 * desktop/main/index.ts — both now import from here.
 */

/** Archon engine version. Incremented with each release. */
export const ARCHON_VERSION = '0.0.1';
