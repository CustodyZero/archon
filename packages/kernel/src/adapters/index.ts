/**
 * Archon Kernel — Adapter Interfaces
 *
 * All module side effects must flow through kernel adapters.
 * Modules do not access filesystem, network, exec, secrets, messaging,
 * or UI directly — they use only kernel-provided adapters.
 *
 * This is the enforcement boundary that prevents modules from bypassing
 * the kernel gate. A module that accesses resources directly violates the
 * module contract and must be rejected.
 *
 * Adapter calls must include:
 * - Agent identity
 * - Capability instance
 * - Snapshot hash reference
 *
 * The kernel refuses adapter calls not associated with a validated action path.
 *
 * No implementations are provided here. Adapters are injected, not constructed.
 * Concrete adapter implementations are platform-specific and live outside the
 * kernel boundary.
 *
 * @see docs/specs/module_api.md §6 (kernel-provided adapters)
 */

import type { CapabilityInstance } from '../types/capability.js';
import type { RuleSnapshotHash } from '../types/snapshot.js';
import type { ResourceConfig } from '../types/resource.js';

// ---------------------------------------------------------------------------
// Adapter Call Context
// ---------------------------------------------------------------------------

/**
 * Context required on every adapter call.
 *
 * The kernel must refuse any adapter call that cannot produce a valid
 * AdapterCallContext — it means the call is not associated with a
 * validated action path.
 *
 * @see docs/specs/module_api.md §6
 */
export interface AdapterCallContext {
  readonly agent_id: string;
  readonly capability_instance: CapabilityInstance;
  readonly rs_hash: RuleSnapshotHash;
  /**
   * Per-project resource configuration from the active RuleSnapshot.
   *
   * Provided by the ExecutionGate so runtime adapters can enforce
   * resource boundaries (FS root realpath check, net host check, exec CWD).
   * This is the adapter's enforcement layer — complementing the kernel's
   * logical pre-check in the ValidationEngine.
   *
   * @see packages/kernel/src/types/resource.ts
   * @see docs/specs/architecture.md §P5 (resource scoping)
   */
  readonly resource_config: ResourceConfig;
}

// ---------------------------------------------------------------------------
// Adapter Interfaces
// ---------------------------------------------------------------------------

/**
 * Kernel adapter for filesystem operations.
 * Modules use this adapter for all file I/O — not the Node.js `fs` module directly.
 *
 * @see docs/specs/module_api.md §6
 * @see docs/specs/capabilities.md §3.B (filesystem capabilities)
 */
export interface FilesystemAdapter {
  read(
    path: string,
    context: AdapterCallContext,
  ): Promise<Uint8Array>;

  list(
    pathGlob: string,
    context: AdapterCallContext,
  ): Promise<ReadonlyArray<string>>;

  write(
    path: string,
    content: Uint8Array,
    context: AdapterCallContext,
  ): Promise<void>;

  delete(
    path: string,
    context: AdapterCallContext,
  ): Promise<void>;
}

/**
 * Kernel adapter for network operations.
 * Modules use this adapter for all network I/O.
 *
 * @see docs/specs/module_api.md §6
 * @see docs/specs/capabilities.md §3.D (network capabilities)
 */
export interface NetworkAdapter {
  fetchHttp(
    url: string,
    options: {
      readonly method: string;
      readonly headers?: Record<string, string> | undefined;
      readonly body?: Uint8Array | undefined;
      readonly maxBytes?: number | undefined;
    },
    context: AdapterCallContext,
  ): Promise<{
    readonly status: number;
    readonly headers: Record<string, string>;
    readonly body: Uint8Array;
  }>;
}

/**
 * Kernel adapter for subprocess execution.
 * Modules use this adapter for all exec operations.
 *
 * @see docs/specs/module_api.md §6
 * @see docs/specs/capabilities.md §3.C (execution capabilities)
 */
export interface ExecAdapter {
  run(
    command: string,
    args: ReadonlyArray<string>,
    options: {
      readonly cwd?: string | undefined;
      readonly env?: Record<string, string> | undefined;
      readonly timeoutMs?: number | undefined;
    },
    context: AdapterCallContext,
  ): Promise<{
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
  }>;
}

/**
 * Kernel adapter for secret retrieval and usage.
 * Modules use this adapter for all credential operations.
 *
 * @see docs/specs/module_api.md §6
 * @see docs/specs/capabilities.md §3.E (credentials / secrets capabilities)
 */
export interface SecretsAdapter {
  read(
    secretId: string,
    context: AdapterCallContext,
  ): Promise<string>;

  use(
    secretId: string,
    sinkType: string,
    context: AdapterCallContext,
  ): Promise<void>;

  injectEnv(
    secretId: string,
    targetProcess: string,
    context: AdapterCallContext,
  ): Promise<void>;
}

/**
 * Kernel adapter for inter-agent messaging.
 *
 * @see docs/specs/module_api.md §6
 * @see docs/specs/capabilities.md §3.A (agent coordination capabilities)
 */
export interface MessagingAdapter {
  send(
    targetAgentId: string,
    message: Record<string, unknown>,
    context: AdapterCallContext,
  ): Promise<void>;
}

/**
 * Kernel adapter for operator UI interactions.
 * Used by the ui.* capability family for approval requests and acknowledgments.
 *
 * @see docs/specs/module_api.md §6
 * @see docs/specs/capabilities.md §3.F (operator interaction capabilities)
 * @see docs/specs/governance.md §1 (human approval flow)
 */
export interface UIAdapter {
  requestApproval(
    description: string,
    context: AdapterCallContext,
  ): Promise<{ readonly approved: boolean }>;

  presentRiskAck(
    riskDescription: string,
    requiredPhrase: string,
    context: AdapterCallContext,
  ): Promise<{ readonly acknowledged: boolean; readonly phrase: string }>;

  requestClarification(
    question: string,
    context: AdapterCallContext,
  ): Promise<{ readonly response: string }>;
}

// ---------------------------------------------------------------------------
// Kernel Adapters Bundle
// ---------------------------------------------------------------------------

/**
 * The complete set of kernel-provided adapters injected into the execution
 * context for a validated action.
 *
 * Adapters are injected by the platform layer (CLI, desktop, or embedding
 * application). The kernel does not construct concrete adapter implementations.
 *
 * All module side effects must flow through these adapters. A module that
 * bypasses adapters violates the module contract.
 *
 * @see docs/specs/module_api.md §6
 */
export interface KernelAdapters {
  readonly filesystem: FilesystemAdapter;
  readonly network: NetworkAdapter;
  readonly exec: ExecAdapter;
  readonly secrets: SecretsAdapter;
  readonly messaging: MessagingAdapter;
  readonly ui: UIAdapter;
}
