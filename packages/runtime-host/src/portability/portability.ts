/**
 * Archon Runtime Host — PortabilityStatus
 *
 * Pure function that derives a per-project portability contract from the
 * current secrets mode and the archon home path.
 *
 * Rules:
 *   PORT-U1: device mode → not portable (reason: SECRETS_DEVICE_BOUND)
 *   PORT-U2: portable mode → portable, requiresPassphrase = true
 *   PORT-U3: null mode (no secrets) → portable, no passphrase required
 *   PORT-U4..U7: suggestedSync inferred from archon home path patterns
 *
 * @see docs/specs/architecture.md §P6 (Portability Integrity + Sync Conflict Posture)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The encryption mode of the project secret store. */
export type SecretsMode = 'device' | 'portable';

/**
 * A detected or inferred cloud sync provider.
 * Derived from well-known path patterns on macOS, Windows, and Linux.
 */
export type SuggestedSync = 'onedrive' | 'gdrive' | 'icloud' | 'unknown';

/** Reason codes for non-portable status. */
export const PORTABILITY_REASONS = {
  /**
   * The project uses device-mode secrets, which are encrypted with a
   * machine-scoped key and cannot be decrypted on another device.
   */
  SECRETS_DEVICE_BOUND: 'SECRETS_DEVICE_BOUND',
} as const;

export type PortabilityReason = (typeof PORTABILITY_REASONS)[keyof typeof PORTABILITY_REASONS];

/** Details about the portability assessment. */
export interface PortabilityDetails {
  /** The secrets mode at assessment time (null if no secrets configured). */
  secretsMode: SecretsMode | null;
  /**
   * True if moving to another device requires a passphrase.
   * Only true in portable mode; false for device mode and null mode.
   */
  requiresPassphrase: boolean;
  /** Detected (or inferred) sync provider from the archon home path. */
  suggestedSync: SuggestedSync;
}

/** Input for portability assessment. */
export interface PortabilityInput {
  /** Current secrets mode, or null if no secrets have been configured. */
  secretsMode: SecretsMode | null;
  /** Absolute path to the archon home directory (used for sync provider detection). */
  archonHomePath: string;
}

/** The result of a portability assessment. */
export interface PortabilityStatus {
  /** True if the project can be opened on another device without data loss. */
  portable: boolean;
  /**
   * Reason codes explaining why the project is not portable.
   * Empty when portable = true.
   */
  reasonCodes: ReadonlyArray<PortabilityReason>;
  /** Detailed breakdown for diagnostic display. */
  details: PortabilityDetails;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Infer the likely cloud sync provider from the archon home path.
 *
 * Checks normalized path for well-known patterns:
 *   iCloud  — "mobile documents", "com~apple~clouddocs", "icloud"
 *   OneDrive — "onedrive"
 *   GDrive  — "google drive", "googledrive", "my drive"
 *
 * Returns 'unknown' if no pattern matches.
 */
function inferSuggestedSync(archonHomePath: string): SuggestedSync {
  const normalized = archonHomePath.toLowerCase();

  // iCloud Drive: ~/Library/Mobile Documents/com~apple~CloudDocs/
  if (
    normalized.includes('mobile documents') ||
    normalized.includes('com~apple~clouddocs') ||
    normalized.includes('icloud')
  ) {
    return 'icloud';
  }

  // Microsoft OneDrive: ~/OneDrive/
  if (normalized.includes('onedrive')) {
    return 'onedrive';
  }

  // Google Drive: ~/Google Drive/, ~/GoogleDrive/, ~/My Drive/
  if (
    normalized.includes('google drive') ||
    normalized.includes('googledrive') ||
    normalized.includes('my drive')
  ) {
    return 'gdrive';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive a portability contract from the current secrets mode and home path.
 *
 * Pure function — no I/O. All inputs must be provided by the caller.
 *
 * @param input - Secrets mode and archon home path
 * @returns PortabilityStatus with portable flag, reason codes, and details
 */
export function getPortabilityStatus(input: PortabilityInput): PortabilityStatus {
  const suggestedSync = inferSuggestedSync(input.archonHomePath);

  if (input.secretsMode === 'device') {
    return {
      portable: false,
      reasonCodes: [PORTABILITY_REASONS.SECRETS_DEVICE_BOUND],
      details: {
        secretsMode: 'device',
        requiresPassphrase: false,
        suggestedSync,
      },
    };
  }

  if (input.secretsMode === 'portable') {
    return {
      portable: true,
      reasonCodes: [],
      details: {
        secretsMode: 'portable',
        requiresPassphrase: true,
        suggestedSync,
      },
    };
  }

  // Exhaustion guard: TypeScript narrows input.secretsMode to null here after
  // the 'device' and 'portable' branches above. If SecretsMode gains a new member,
  // the narrowing will fail and the compiler will error on the next line —
  // catching the omission before it can silently return portable=true for an
  // unhandled mode.
  const _secretsModeIsNull: null = input.secretsMode;
  void _secretsModeIsNull;

  // null: no secrets configured — fully portable, no passphrase needed
  return {
    portable: true,
    reasonCodes: [],
    details: {
      secretsMode: null,
      requiresPassphrase: false,
      suggestedSync,
    },
  };
}
