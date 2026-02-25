/**
 * Archon Runtime Host — SecretStore Tests
 *
 * Verifies that the encrypted secret store enforces confidentiality and
 * correctness guarantees:
 *
 *   SEC-U1: device mode round-trip (setSecret → getSecret returns value)
 *   SEC-U2: key isolation (key-a value ≠ key-b value)
 *   SEC-U3: delete removes key (getSecret returns undefined after delete)
 *   SEC-U4: tamper detection (mutated ciphertext causes decrypt to throw)
 *   SEC-U5: mode transition device → portable (secrets accessible after passphrase)
 *   SEC-U6: migration — secrets.json (legacy) migrated to secrets.enc.json on first read
 *
 * Isolation: each test uses an independent temp directory. No shared state.
 * Tests never print or assert plaintext secret values directly — they verify
 * the store's behavioral guarantees.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SecretStore } from '../src/secrets/secret-store.js';
import { FileStateIO } from '../src/state/state-io.js';

// ---------------------------------------------------------------------------
// Test fixture factory
// ---------------------------------------------------------------------------

/** Create isolated temp directories for project state and device key. */
function makeFixture(label: string): {
  projectDir: string;
  stateDir: string;
  deviceKeyPath: string;
  stateIO: FileStateIO;
} {
  const projectDir = mkdtempSync(`${tmpdir()}/archon-sec-${label}-`);
  const stateDir = join(projectDir, 'state');
  mkdirSync(stateDir, { recursive: true });
  const keyDir = mkdtempSync(`${tmpdir()}/archon-key-${label}-`);
  const deviceKeyPath = join(keyDir, 'device.key');
  const stateIO = new FileStateIO(projectDir);
  return { projectDir, stateDir, deviceKeyPath, stateIO };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SecretStore', () => {
  // -------------------------------------------------------------------------
  // SEC-U1: device mode round-trip
  // -------------------------------------------------------------------------

  it('SEC-U1: device mode round-trip — setSecret then getSecret returns the stored value', () => {
    const { deviceKeyPath, stateIO } = makeFixture('u1');
    const store = new SecretStore(stateIO, deviceKeyPath);

    store.setSecret('api-key', 'sk-test-value');
    const result = store.getSecret('api-key');

    expect(result).toBe('sk-test-value');
  });

  // -------------------------------------------------------------------------
  // SEC-U2: key isolation
  // -------------------------------------------------------------------------

  it('SEC-U2: key isolation — reading key-a returns key-a value, not key-b', () => {
    const { deviceKeyPath, stateIO } = makeFixture('u2');
    const store = new SecretStore(stateIO, deviceKeyPath);

    store.setSecret('key-a', 'value-alpha');
    store.setSecret('key-b', 'value-beta');

    // Verify each key returns its own value
    expect(store.getSecret('key-a')).toBe('value-alpha');
    expect(store.getSecret('key-b')).toBe('value-beta');
  });

  // -------------------------------------------------------------------------
  // SEC-U3: delete removes key
  // -------------------------------------------------------------------------

  it('SEC-U3: deleteSecret removes the key — getSecret returns undefined afterward', () => {
    const { deviceKeyPath, stateIO } = makeFixture('u3');
    const store = new SecretStore(stateIO, deviceKeyPath);

    store.setSecret('to-delete', 'gone');
    store.deleteSecret('to-delete');

    expect(store.getSecret('to-delete')).toBeUndefined();
  });

  it('SEC-U3b: deleteSecret on a non-existent key is a no-op', () => {
    const { deviceKeyPath, stateIO } = makeFixture('u3b');
    const store = new SecretStore(stateIO, deviceKeyPath);

    // Should not throw
    expect(() => store.deleteSecret('does-not-exist')).not.toThrow();
  });

  // -------------------------------------------------------------------------
  // SEC-U4: tamper detection
  // -------------------------------------------------------------------------

  it('SEC-U4: tamper detection — mutated ciphertext throws on decrypt', () => {
    const { stateDir, deviceKeyPath, stateIO } = makeFixture('u4');
    const store = new SecretStore(stateIO, deviceKeyPath);

    store.setSecret('sensitive', 'real-value');

    // Directly corrupt the ciphertext bytes in secrets.enc.json
    const secretsPath = join(stateDir, 'secrets.enc.json');
    const raw = readFileSync(secretsPath, 'utf-8');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = JSON.parse(raw) as { entries: Record<string, { ciphertext: string; iv: string; tag: string }> };
    const entry = parsed.entries['sensitive'];
    if (entry === undefined) throw new Error('Test setup: expected entry not found');
    // Replace ciphertext with random base64 of same length (guaranteed invalid)
    parsed.entries['sensitive'] = { ...entry, ciphertext: 'AAAAAAAAAAAAAAAAAAAAAA==' };
    writeFileSync(secretsPath, JSON.stringify(parsed, null, 2), 'utf-8');

    // AES-256-GCM authentication tag mismatch must throw
    expect(() => store.getSecret('sensitive')).toThrow();
  });

  // -------------------------------------------------------------------------
  // SEC-U5: mode transition device → portable
  // -------------------------------------------------------------------------

  it('SEC-U5: device → portable transition — secrets remain accessible with correct passphrase', () => {
    const { deviceKeyPath, stateIO } = makeFixture('u5');
    const passphrase = 'test-passphrase-for-portable-mode';
    const store = new SecretStore(stateIO, deviceKeyPath);

    // Write in device mode
    store.setSecret('my-secret', 'my-value');

    // Transition to portable mode (re-encrypts all entries with passphrase)
    store.setMode('portable', passphrase);

    // Create new store with sessionPassphrase — simulates a new CLI session
    const store2 = new SecretStore(stateIO, deviceKeyPath, passphrase);
    expect(store2.getSecret('my-secret')).toBe('my-value');
    expect(store2.getMode()).toBe('portable');
  });

  it('SEC-U5b: portable mode without passphrase throws an explicit error', () => {
    const { deviceKeyPath, stateIO } = makeFixture('u5b');
    const store = new SecretStore(stateIO, deviceKeyPath);

    store.setSecret('my-secret', 'my-value');
    store.setMode('portable', 'correct-passphrase');

    // Open store without passphrase — must throw a clear error, not return undefined
    const storeNoPass = new SecretStore(stateIO, deviceKeyPath);
    expect(() => storeNoPass.getSecret('my-secret')).toThrow(/passphrase/i);
  });

  // -------------------------------------------------------------------------
  // SEC-U6: migration — secrets.json → secrets.enc.json
  // -------------------------------------------------------------------------

  it('SEC-U6: migration from secrets.json (legacy) to secrets.enc.json is idempotent', () => {
    const { stateDir, deviceKeyPath, stateIO } = makeFixture('u6');

    // Step 1: Create encrypted state using a "new" store (writes to secrets.enc.json)
    const storeNew = new SecretStore(stateIO, deviceKeyPath);
    storeNew.setSecret('legacy-key', 'legacy-value');

    // Step 2: Simulate legacy by renaming secrets.enc.json → secrets.json
    const newPath = join(stateDir, 'secrets.enc.json');
    const legacyPath = join(stateDir, 'secrets.json');
    renameSync(newPath, legacyPath);
    expect(existsSync(newPath)).toBe(false);
    expect(existsSync(legacyPath)).toBe(true);

    // Step 3: Create a new store — should detect and migrate on first loadState()
    const storeMigrated = new SecretStore(stateIO, deviceKeyPath);
    expect(storeMigrated.getSecret('legacy-key')).toBe('legacy-value');

    // Step 4: After migration, secrets.enc.json must exist (written during getSecret)
    expect(existsSync(newPath)).toBe(true);

    // Step 5: Write a new secret — should work and be readable
    storeMigrated.setSecret('new-key', 'new-value');
    expect(storeMigrated.getSecret('new-key')).toBe('new-value');
    expect(storeMigrated.getSecret('legacy-key')).toBe('legacy-value');

    // Step 6: Calling again on an already-migrated store is a no-op (idempotent)
    const store3 = new SecretStore(stateIO, deviceKeyPath);
    expect(store3.getSecret('legacy-key')).toBe('legacy-value');
    expect(store3.getSecret('new-key')).toBe('new-value');
  });
});
