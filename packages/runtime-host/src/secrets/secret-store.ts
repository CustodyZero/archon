/**
 * Archon Runtime Host — Secret Store
 *
 * Provides per-project encrypted secret storage with two encryption modes:
 *
 *   device   — secrets are encrypted with a machine-scoped key stored at
 *              `deviceKeyPath` (default: `<archonHome>/device.key`). The key
 *              is auto-generated (32 random bytes) on first use and persisted
 *              with mode 0o600. Device-mode secrets are not portable across
 *              machines.
 *
 *   portable — secrets are encrypted with a key derived from an operator-supplied
 *              passphrase using scrypt (N=16384, r=8, p=1). A random 32-byte salt
 *              is generated when switching to portable mode and stored alongside
 *              the encrypted secrets (not the passphrase itself). Portable-mode
 *              secrets can be moved across machines as long as the passphrase
 *              is known.
 *
 * Encryption:
 *   AES-256-GCM — authenticated encryption with 12-byte random IV per entry.
 *   Authentication tag (16 bytes) is stored alongside ciphertext.
 *   Tampering with ciphertext, IV, or tag causes decryption to fail with
 *   an explicit error (not silently returning corrupt data).
 *
 * Storage:
 *   Secrets are stored in `secrets.json` within the project state directory,
 *   managed by the injected StateIO instance. Plaintext values are never
 *   written to disk, logs, or snapshots.
 *
 * Session passphrase:
 *   The passphrase is supplied at construction time for the current session
 *   (e.g. from a --passphrase CLI flag). It is held in memory only for the
 *   lifetime of this object and is never persisted. For device-mode operations,
 *   no passphrase is needed.
 *
 * Governance:
 *   This class implements the SecretStoreApplier interface from @archon/module-loader
 *   via structural typing (no explicit `implements`). All secret mutations
 *   are invoked through ProposalQueue.approveProposal().
 *
 * @see docs/specs/architecture.md §P5 (resource scoping — secret store)
 * @see docs/specs/formal_governance.md §5 (I3: no plaintext at rest)
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname } from 'node:path';
import type { StateIO } from '../state/state-io.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Current secrets file name (JSON with base64-encoded AES-256-GCM ciphertext).
 * The `.enc.json` suffix signals that the contents are encrypted at rest.
 */
const SECRETS_FILE = 'secrets.enc.json';

/**
 * Legacy file name used before the rename (P5 audit remediation).
 * loadState() migrates from this path on first read, writing to SECRETS_FILE.
 * The legacy file is not deleted — it remains as a backup.
 */
const LEGACY_SECRETS_FILE = 'secrets.json';

const KEY_LEN = 32;      // AES-256 key length in bytes
const IV_LEN = 12;       // GCM nonce (recommended minimum)
const TAG_LEN = 16;      // GCM authentication tag length
const SALT_LEN = 32;     // Scrypt salt length

// Scrypt parameters — interactive workload profile (OWASP recommended baseline)
const SCRYPT_N = 16384;  // CPU/memory cost (2^14)
const SCRYPT_R = 8;      // Block size
const SCRYPT_P = 1;      // Parallelism

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/**
 * An encrypted secret entry.
 * All fields are base64-encoded byte arrays.
 */
interface SecretEntry {
  /** 12-byte GCM nonce, base64-encoded. */
  readonly iv: string;
  /** Encrypted secret value, base64-encoded. */
  readonly ciphertext: string;
  /** 16-byte GCM authentication tag, base64-encoded. */
  readonly tag: string;
}

/**
 * The full persisted secrets state for a project.
 *
 * `salt` is present only in portable mode. It is the base64-encoded 32-byte
 * scrypt salt, not the passphrase itself (which is never persisted).
 */
interface SecretsState {
  readonly mode: 'device' | 'portable';
  /** Present in portable mode only. Base64-encoded 32-byte scrypt salt. */
  readonly salt?: string | undefined;
  /** Map of secret key → encrypted entry. Key names are stored in plaintext. */
  readonly entries: Record<string, SecretEntry>;
}

const EMPTY_SECRETS: SecretsState = { mode: 'device', entries: {} };

// ---------------------------------------------------------------------------
// SecretStore
// ---------------------------------------------------------------------------

/**
 * Per-project encrypted secret store.
 *
 * Reads and writes secrets for a single project via the injected StateIO.
 * The `deviceKeyPath` determines which machine-scoped key is used for
 * device-mode encryption.
 *
 * Structurally implements SecretStoreApplier from @archon/module-loader.
 */
export class SecretStore {
  constructor(
    /** Project-scoped I/O — secrets.json is stored in the project state dir. */
    private readonly stateIO: StateIO,
    /**
     * Path to the machine-scoped device key file.
     * Auto-generated (32 random bytes, base64) on first use.
     * Stored with mode 0o600 (owner read/write only).
     * Typically: `<archonHome>/device.key`
     */
    private readonly deviceKeyPath: string,
    /**
     * Optional session passphrase for portable-mode operations.
     * Required if the store is in portable mode and the caller needs to read
     * or write secrets. Never persisted — held in memory only.
     */
    private readonly sessionPassphrase?: string | undefined,
  ) {}

  // -------------------------------------------------------------------------
  // Public API (implements SecretStoreApplier structurally)
  // -------------------------------------------------------------------------

  /**
   * Encrypt and store a secret under the given key.
   *
   * Overwrites any existing secret with the same key.
   * The value is encrypted before storage; no plaintext is persisted.
   *
   * @throws {Error} If in portable mode and no sessionPassphrase is set
   */
  setSecret(key: string, value: string): void {
    const state = this.loadState();
    const encKey = this.resolveKey(state);
    const encrypted = this.encrypt(encKey, value);
    const updated: SecretsState = {
      ...state,
      entries: { ...state.entries, [key]: encrypted },
    };
    this.stateIO.writeJson(SECRETS_FILE, updated);
  }

  /**
   * Remove the encrypted entry for the given key.
   *
   * No-op if the key does not exist.
   */
  deleteSecret(key: string): void {
    const state = this.loadState();
    const { [key]: _removed, ...remaining } = state.entries;
    const updated: SecretsState = { ...state, entries: remaining };
    this.stateIO.writeJson(SECRETS_FILE, updated);
  }

  /**
   * Switch the encryption mode for all secrets in this store.
   *
   * Re-encrypts all stored secrets under the new mode.
   * For switching to portable: `passphrase` is required and used as the new
   * encryption passphrase. The old key (device or old passphrase via
   * sessionPassphrase) is used to decrypt.
   *
   * @param mode - Target encryption mode
   * @param passphrase - Required when `mode === 'portable'`
   * @throws {Error} If switching from portable mode without sessionPassphrase
   * @throws {Error} If switching to portable mode without providing passphrase
   */
  setMode(mode: 'device' | 'portable', passphrase?: string | undefined): void {
    const state = this.loadState();
    const oldKey = this.resolveKey(state);

    let newKey: Buffer;
    let newSalt: string | undefined;

    if (mode === 'device') {
      newKey = this.loadDeviceKey();
      newSalt = undefined;
    } else {
      // mode === 'portable'
      if (passphrase === undefined || passphrase === '') {
        throw new Error(
          'Passphrase is required when switching to portable mode. ' +
            'Provide it via opts.secretPassphrase when approving the proposal.',
        );
      }
      const salt = randomBytes(SALT_LEN);
      newSalt = salt.toString('base64');
      newKey = this.derivePortableKey(passphrase, salt);
    }

    // Re-encrypt all existing entries with the new key.
    const reEncryptedEntries: Record<string, SecretEntry> = {};
    for (const [k, entry] of Object.entries(state.entries)) {
      const plaintext = this.decrypt(oldKey, entry);
      reEncryptedEntries[k] = this.encrypt(newKey, plaintext);
    }

    const updated: SecretsState = {
      mode,
      ...(newSalt !== undefined ? { salt: newSalt } : {}),
      entries: reEncryptedEntries,
    };
    this.stateIO.writeJson(SECRETS_FILE, updated);
  }

  // -------------------------------------------------------------------------
  // Read API (for runtime use — not part of SecretStoreApplier)
  // -------------------------------------------------------------------------

  /**
   * Decrypt and return the secret value for the given key.
   *
   * Returns undefined if the key does not exist.
   *
   * @throws {Error} If in portable mode and no sessionPassphrase is set
   * @throws {Error} If decryption fails (authentication tag mismatch)
   */
  getSecret(key: string): string | undefined {
    const state = this.loadState();
    const entry = state.entries[key];
    if (entry === undefined) return undefined;
    const encKey = this.resolveKey(state);
    return this.decrypt(encKey, entry);
  }

  /**
   * Return all stored secret key names (not values).
   */
  listKeys(): ReadonlyArray<string> {
    const state = this.loadState();
    return Object.keys(state.entries).sort();
  }

  /**
   * Return the current encryption mode.
   */
  getMode(): 'device' | 'portable' {
    return this.loadState().mode;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private loadState(): SecretsState {
    // Try the current file name first.
    const current = this.stateIO.readJson<SecretsState | null>(SECRETS_FILE, null);
    if (current !== null) return current;

    // Migration: check for the legacy secrets.json written before P5 audit remediation.
    // If found, write to the new name and return the state. The old file is not deleted
    // (it remains as a backup). Subsequent calls will find SECRETS_FILE and skip this path.
    const legacy = this.stateIO.readJson<SecretsState | null>(LEGACY_SECRETS_FILE, null);
    if (legacy !== null) {
      this.stateIO.writeJson(SECRETS_FILE, legacy);
      return legacy;
    }

    return EMPTY_SECRETS;
  }

  /**
   * Resolve the active encryption key for the given state.
   *
   * - Device mode: loads the machine-scoped device key
   * - Portable mode: derives key from sessionPassphrase + stored salt
   *
   * @throws {Error} If portable mode is active but no sessionPassphrase was provided
   * @throws {Error} If portable mode state is corrupt (missing salt)
   */
  private resolveKey(state: SecretsState): Buffer {
    if (state.mode === 'device') {
      return this.loadDeviceKey();
    }

    // Portable mode
    if (this.sessionPassphrase === undefined || this.sessionPassphrase === '') {
      throw new Error(
        'This project uses portable-mode secret encryption. ' +
          'Provide the passphrase via --passphrase or the SecretStore constructor.',
      );
    }
    if (state.salt === undefined) {
      throw new Error(
        'Corrupt secrets state: portable mode requires a salt but none is stored. ' +
          'Re-initialize the secret store with setMode().',
      );
    }
    const salt = Buffer.from(state.salt, 'base64');
    return this.derivePortableKey(this.sessionPassphrase, salt);
  }

  /**
   * Load the machine-scoped device key.
   *
   * If the key file does not exist, generates a 32-byte random key,
   * persists it at `deviceKeyPath` with mode 0o600, and returns it.
   *
   * The device key is stable for the lifetime of the machine. It is
   * never transmitted and should not be copied across machines.
   */
  private loadDeviceKey(): Buffer {
    if (existsSync(this.deviceKeyPath)) {
      const raw = readFileSync(this.deviceKeyPath, 'utf-8').trim();
      const key = Buffer.from(raw, 'base64');
      if (key.byteLength !== KEY_LEN) {
        throw new Error(
          `Device key at ${this.deviceKeyPath} has unexpected length ` +
            `(expected ${KEY_LEN} bytes, got ${key.byteLength}). ` +
            'The file may be corrupt.',
        );
      }
      return key;
    }

    // Generate a new device key.
    const key = randomBytes(KEY_LEN);
    const dir = dirname(this.deviceKeyPath);
    mkdirSync(dir, { recursive: true });
    // Write with owner-only read/write permissions (0o600).
    writeFileSync(this.deviceKeyPath, key.toString('base64'), {
      encoding: 'utf-8',
      mode: 0o600,
    });
    return key;
  }

  /**
   * Derive a 32-byte AES key from a passphrase and salt using scrypt.
   *
   * Parameters: N=16384, r=8, p=1 (interactive workload profile).
   */
  private derivePortableKey(passphrase: string, salt: Buffer): Buffer {
    return scryptSync(passphrase, salt, KEY_LEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
    }) as Buffer;
  }

  /**
   * Encrypt a plaintext string using AES-256-GCM.
   *
   * Generates a fresh random 12-byte IV for each call.
   * Returns an entry with iv, ciphertext, and tag as base64 strings.
   */
  private encrypt(key: Buffer, plaintext: string): SecretEntry {
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    if (tag.byteLength !== TAG_LEN) {
      throw new Error(`Unexpected GCM tag length: ${tag.byteLength}`);
    }
    return {
      iv: iv.toString('base64'),
      ciphertext: encrypted.toString('base64'),
      tag: tag.toString('base64'),
    };
  }

  /**
   * Decrypt a SecretEntry using AES-256-GCM.
   *
   * Verifies the authentication tag before returning the plaintext.
   * Throws if the tag is invalid (tampering or key mismatch).
   */
  private decrypt(key: Buffer, entry: SecretEntry): string {
    const iv = Buffer.from(entry.iv, 'base64');
    const ciphertext = Buffer.from(entry.ciphertext, 'base64');
    const tag = Buffer.from(entry.tag, 'base64');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf-8');
  }
}
