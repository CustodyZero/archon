/**
 * Archon Runtime Host — Secrets Adapter Implementation
 *
 * Implements the SecretsAdapter interface from @archon/kernel.
 * Bridges the gated execution path to the project-scoped SecretStore.
 *
 * This adapter sits BETWEEN the kernel execution gate and the SecretStore
 * persistence/encryption layer. It is not a convenience wrapper — it is
 * an enforcement boundary that ensures:
 *
 *   - All secret access flows through the gated action path
 *   - Project isolation is preserved (one SecretStore per project)
 *   - Missing secrets fail explicitly (not silently)
 *   - No process-wide environment mutation
 *
 * Semantic distinction between operations:
 *   - read(): Retrieve the plaintext secret value (T2 — lower risk).
 *   - use():  Declare intent to use a secret in a specified sink (T3 — higher risk).
 *             For S9, validates access only. Sink delivery mechanisms are not yet
 *             architecturally defined beyond the adapter interface.
 *   - injectEnv(): Declare intent to inject a secret into a process environment
 *                  (T3 — highest risk). For S9, validates access only.
 *                  DOES NOT mutate process.env.
 *
 * NOTE: The kernel SecretsAdapter.injectEnv() interface returns Promise<void>.
 * This means the adapter cannot return an environment overlay object through
 * this signature. The actual env injection coordination with ExecAdapter
 * requires architectural work beyond S9. For now, injectEnv validates that
 * the secret exists and is accessible, but does not perform the injection.
 * This is explicitly documented, not silently swallowed.
 *
 * @see docs/specs/module_api.md §6 (kernel-provided adapters)
 * @see docs/specs/capabilities.md §3.E (credentials / secrets capabilities)
 * @see docs/specs/architecture.md §P5 (resource scoping — secret store)
 */

import type { SecretsAdapter, AdapterCallContext } from '@archon/kernel';
import type { SecretStore } from '../secrets/secret-store.js';

// ---------------------------------------------------------------------------
// NodeSecretsAdapter
// ---------------------------------------------------------------------------

/**
 * Node.js secrets adapter backed by a project-scoped SecretStore.
 *
 * All module secret operations must flow through this adapter — modules must not
 * access SecretStore directly. This adapter enforces the SecretsAdapter contract
 * and ensures project-scoped isolation.
 *
 * One NodeSecretsAdapter instance is bound to one SecretStore (one project).
 * Cross-project access is prevented by construction: the SecretStore is
 * project-scoped via its StateIO, and the adapter does not accept a project_id
 * parameter — it always operates on the bound project.
 */
export class NodeSecretsAdapter implements SecretsAdapter {
  constructor(
    /** Project-scoped secret store. Injected at construction by the runtime layer. */
    private readonly secretStore: SecretStore,
  ) {}

  /**
   * Retrieve the plaintext secret value for the given key.
   *
   * This is a T2 operation (read-only risk). The secret value is returned
   * to the caller (the handler) for direct use.
   *
   * @param secretId - The secret key name (e.g. 'anthropic-api-key')
   * @param _context - Adapter call context (used for governance binding)
   * @returns The decrypted plaintext secret value
   * @throws {Error} If the secret does not exist
   * @throws {Error} If the SecretStore cannot decrypt (portable mode without passphrase, corrupt data)
   */
  async read(
    secretId: string,
    _context: AdapterCallContext,
  ): Promise<string> {
    const value = this.secretStore.getSecret(secretId);
    if (value === undefined) {
      throw new Error(
        `Secret '${secretId}' not found in project secret store. ` +
          `Available keys: [${this.secretStore.listKeys().join(', ')}]. ` +
          `Add the secret via 'archon secret set' before using it.`,
      );
    }
    return value;
  }

  /**
   * Declare intent to use a secret in a specified sink type.
   *
   * This is a T3 operation (higher risk than read). The operation validates
   * that the secret exists and is accessible, ensuring the gated action path
   * is truthful.
   *
   * For S9: validates access only. The actual sink delivery mechanism
   * (how the secret reaches the sink) is not yet architecturally defined
   * beyond the adapter interface. This is explicitly documented.
   *
   * @param secretId - The secret key name
   * @param _sinkType - The intended sink (e.g. 'env_var', 'file') — validated for presence only
   * @param _context - Adapter call context
   * @throws {Error} If the secret does not exist
   * @throws {Error} If sinkType is empty
   */
  async use(
    secretId: string,
    _sinkType: string,
    _context: AdapterCallContext,
  ): Promise<void> {
    if (_sinkType === '') {
      throw new Error(
        `secrets.use requires a non-empty sinkType. ` +
          `Specify the intended sink (e.g. 'env_var', 'file', 'header').`,
      );
    }

    const value = this.secretStore.getSecret(secretId);
    if (value === undefined) {
      throw new Error(
        `Secret '${secretId}' not found in project secret store. ` +
          `Available keys: [${this.secretStore.listKeys().join(', ')}]. ` +
          `Add the secret via 'archon secret set' before using it.`,
      );
    }

    // S9: Access validated. Sink delivery is not yet wired.
    // The operation succeeds, confirming the secret exists and is accessible
    // through the gated action path. Actual sink delivery requires
    // architectural work beyond S9.
  }

  /**
   * Declare intent to inject a secret as an environment variable for a target process.
   *
   * This is a T3 operation. The operation validates that the secret exists
   * and is accessible.
   *
   * IMPORTANT: This method DOES NOT mutate process.env.
   *
   * The kernel SecretsAdapter.injectEnv() interface returns Promise<void>,
   * which means this method cannot return an environment overlay object.
   * The actual env injection coordination with ExecAdapter (where the
   * overlay would be merged into a subprocess's env) requires an
   * architectural change to either:
   *   - The kernel interface (to return the overlay), or
   *   - A coordination mechanism between SecretsAdapter and ExecAdapter
   *
   * For S9: validates access only. No environment mutation occurs.
   *
   * @param secretId - The secret key name to inject
   * @param _targetProcess - The target process identifier — validated for presence only
   * @param _context - Adapter call context
   * @throws {Error} If the secret does not exist
   * @throws {Error} If targetProcess is empty
   */
  async injectEnv(
    secretId: string,
    _targetProcess: string,
    _context: AdapterCallContext,
  ): Promise<void> {
    if (_targetProcess === '') {
      throw new Error(
        `secrets.inject.env requires a non-empty targetProcess. ` +
          `Specify the process that will receive the environment variable.`,
      );
    }

    const value = this.secretStore.getSecret(secretId);
    if (value === undefined) {
      throw new Error(
        `Secret '${secretId}' not found in project secret store. ` +
          `Available keys: [${this.secretStore.listKeys().join(', ')}]. ` +
          `Add the secret via 'archon secret set' before using it.`,
      );
    }

    // S9: Access validated. Actual env injection is not wired.
    // process.env is NOT mutated.
    // See class-level JSDoc for the architectural gap explanation.
  }
}
