/**
 * Archon Runtime Host — PortabilityStatus Tests
 *
 * Verifies pure function getPortabilityStatus() behaviour:
 *
 *   PORT-U1: device mode → portable=false, reason SECRETS_DEVICE_BOUND
 *   PORT-U2: portable mode → portable=true, requiresPassphrase=true
 *   PORT-U3: null mode (no secrets) → portable=true, no reasons
 *   PORT-U4: iCloud path → suggestedSync='icloud'
 *   PORT-U5: OneDrive path → suggestedSync='onedrive'
 *   PORT-U6: Google Drive path → suggestedSync='gdrive'
 *   PORT-U7: unrecognised path → suggestedSync='unknown'
 *
 * Tests are pure: no I/O, no clock dependency, no state.
 */

import { describe, it, expect } from 'vitest';
import { getPortabilityStatus, PORTABILITY_REASONS } from '../src/portability/portability.js';

const ARCHON_HOME_UNKNOWN = '/Users/operator/.archon';

// ---------------------------------------------------------------------------
// PORT-U1: device mode
// ---------------------------------------------------------------------------

describe('PortabilityStatus — PORT-U1: device mode is not portable', () => {
  it('returns portable=false and SECRETS_DEVICE_BOUND for device mode', () => {
    const status = getPortabilityStatus({
      secretsMode: 'device',
      archonHomePath: ARCHON_HOME_UNKNOWN,
    });

    expect(status.portable).toBe(false);
    expect(status.reasonCodes).toContain(PORTABILITY_REASONS.SECRETS_DEVICE_BOUND);
    expect(status.details.secretsMode).toBe('device');
    expect(status.details.requiresPassphrase).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PORT-U2: portable mode
// ---------------------------------------------------------------------------

describe('PortabilityStatus — PORT-U2: portable mode is portable with passphrase', () => {
  it('returns portable=true and requiresPassphrase=true for portable mode', () => {
    const status = getPortabilityStatus({
      secretsMode: 'portable',
      archonHomePath: ARCHON_HOME_UNKNOWN,
    });

    expect(status.portable).toBe(true);
    expect(status.reasonCodes).toHaveLength(0);
    expect(status.details.secretsMode).toBe('portable');
    expect(status.details.requiresPassphrase).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PORT-U3: null mode (no secrets)
// ---------------------------------------------------------------------------

describe('PortabilityStatus — PORT-U3: null mode (no secrets) is portable', () => {
  it('returns portable=true with no reasons for null mode', () => {
    const status = getPortabilityStatus({
      secretsMode: null,
      archonHomePath: ARCHON_HOME_UNKNOWN,
    });

    expect(status.portable).toBe(true);
    expect(status.reasonCodes).toHaveLength(0);
    expect(status.details.secretsMode).toBeNull();
    expect(status.details.requiresPassphrase).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// PORT-U4: iCloud path detection
// ---------------------------------------------------------------------------

describe('PortabilityStatus — PORT-U4: iCloud path detection', () => {
  it('infers icloud from iCloud Drive path', () => {
    const status = getPortabilityStatus({
      secretsMode: null,
      archonHomePath: '/Users/operator/Library/Mobile Documents/com~apple~CloudDocs/archon',
    });
    expect(status.details.suggestedSync).toBe('icloud');
  });

  it('infers icloud from path containing icloud', () => {
    const status = getPortabilityStatus({
      secretsMode: null,
      archonHomePath: '/Users/operator/iCloud/archon',
    });
    expect(status.details.suggestedSync).toBe('icloud');
  });
});

// ---------------------------------------------------------------------------
// PORT-U5: OneDrive path detection
// ---------------------------------------------------------------------------

describe('PortabilityStatus — PORT-U5: OneDrive path detection', () => {
  it('infers onedrive from OneDrive path', () => {
    const status = getPortabilityStatus({
      secretsMode: null,
      archonHomePath: '/Users/operator/OneDrive/archon',
    });
    expect(status.details.suggestedSync).toBe('onedrive');
  });

  it('infers onedrive case-insensitively', () => {
    const status = getPortabilityStatus({
      secretsMode: null,
      archonHomePath: 'C:\\Users\\operator\\ONEDRIVE\\archon',
    });
    expect(status.details.suggestedSync).toBe('onedrive');
  });
});

// ---------------------------------------------------------------------------
// PORT-U6: Google Drive path detection
// ---------------------------------------------------------------------------

describe('PortabilityStatus — PORT-U6: Google Drive path detection', () => {
  it('infers gdrive from Google Drive path', () => {
    const status = getPortabilityStatus({
      secretsMode: null,
      archonHomePath: '/Users/operator/Google Drive/archon',
    });
    expect(status.details.suggestedSync).toBe('gdrive');
  });

  it('infers gdrive from My Drive path', () => {
    const status = getPortabilityStatus({
      secretsMode: null,
      archonHomePath: '/Users/operator/My Drive/archon',
    });
    expect(status.details.suggestedSync).toBe('gdrive');
  });
});

// ---------------------------------------------------------------------------
// PORT-U7: unknown path
// ---------------------------------------------------------------------------

describe('PortabilityStatus — PORT-U7: unrecognised path returns unknown sync', () => {
  it('returns suggestedSync unknown for a standard home directory path', () => {
    const status = getPortabilityStatus({
      secretsMode: null,
      archonHomePath: '/Users/operator/.archon',
    });
    expect(status.details.suggestedSync).toBe('unknown');
  });

  it('returns suggestedSync unknown for an absolute path with no known patterns', () => {
    const status = getPortabilityStatus({
      secretsMode: null,
      archonHomePath: '/opt/archon',
    });
    expect(status.details.suggestedSync).toBe('unknown');
  });
});
