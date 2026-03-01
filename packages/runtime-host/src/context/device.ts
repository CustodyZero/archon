/**
 * Archon Runtime Host — Device Context (ACM-001)
 *
 * Provides a stable, machine-bound device identifier. The device_id persists
 * across sessions and is used in every emitted event envelope to attribute
 * log entries to a specific machine.
 *
 * State layout:
 *   <archonDir>/device.json   — { device_id: string; created_at: string }
 *
 * Idempotent: if device.json already exists, the existing device_id is returned.
 * If it does not exist, a new ULID is generated and written.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ulid } from '../logging/ulid.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Stable, machine-bound device identity. */
export interface DeviceContext {
  /** ULID generated once per machine. Never changes after first creation. */
  readonly device_id: string;
  /** ISO 8601 timestamp of device registration. */
  readonly created_at: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load the existing device context or create it on first run.
 *
 * Reads `<archonDir>/device.json`. If the file does not exist or cannot be
 * parsed, generates a new device_id (ULID) and writes the file.
 *
 * @param archonDir - Archon home directory (from getArchonDir())
 * @returns Stable device context for the current machine
 */
export function loadOrCreateDevice(archonDir: string): DeviceContext {
  const devicePath = join(archonDir, 'device.json');

  try {
    const raw = readFileSync(devicePath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'device_id' in parsed &&
      typeof (parsed as Record<string, unknown>)['device_id'] === 'string'
    ) {
      return parsed as DeviceContext;
    }
  } catch {
    // File missing or unparseable — create a new device record below.
  }

  const device: DeviceContext = {
    device_id: ulid(),
    created_at: new Date().toISOString(),
  };

  mkdirSync(archonDir, { recursive: true });
  writeFileSync(devicePath, JSON.stringify(device, null, 2), 'utf-8');
  return device;
}
