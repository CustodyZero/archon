/**
 * archon demo — Demonstrate the governance enforcement path
 *
 * Usage:
 *   archon demo fs.read <path>
 *
 * Exercises the full validate → gate → log path for a filesystem read.
 * Prints the decision (Permit or Deny) and the result if permitted.
 *
 * This command is direct operator invocation — no agent is involved.
 * Confirm-on-Change does not apply to operator-initiated demo actions.
 *
 * P4 (Project Scoping): buildRuntime() and buildSnapshot() are project-aware.
 * The active project's StateIO is used for all registry state. The project_id
 * is incorporated into the Rule Snapshot and bound to the action's project_id.
 *
 * @see docs/specs/architecture.md §4 (validation flow)
 */

import { Command } from 'commander';
import { join } from 'node:path';
import {
  ExecutionGate,
  DecisionOutcome,
  CapabilityType,
  RiskTier,
} from '@archon/kernel';
import type { KernelAdapters, CapabilityInstance, ModuleHandler } from '@archon/kernel';
import type { StateIO, RuntimeContext, ProjectRuntime, ExecutionSurface } from '@archon/runtime-host';
import {
  FsAdapter,
  NodeExecAdapter,
  NodeNetworkAdapter,
  NodeSecretsAdapter,
  SecretStore,
  RuntimeSupervisor,
  getArchonDir,
  migrateLegacyState,
  getOrCreateDefaultProject,
  projectStateIO,
  ARCHON_VERSION,
  loadOrCreateDevice,
  loadOrCreateUser,
  createSession,
  loadOrCreateOperatorAgent,
} from '@archon/runtime-host';
import {
  ModuleRegistry,
  CapabilityRegistry,
  RestrictionRegistry,
  AckStore,
  ResourceConfigStore,
  GateExecutionSurface,
  buildSnapshotForProject,
} from '@archon/module-loader';
import { FILESYSTEM_MANIFEST } from '@archon/module-filesystem';
import { executeFsRead, executeFsList, executeFsWrite, executeFsDelete } from '@archon/module-filesystem';
import { ANTHROPIC_MANIFEST, executeLlmInfer } from '@archon/provider-anthropic';
import { EXEC_MANIFEST, executeExecRun } from '@archon/module-exec';

// ---------------------------------------------------------------------------
// Process-level RuntimeSupervisor (P8.1)
// ---------------------------------------------------------------------------

/**
 * Process-level supervisor managing project runtimes for this CLI process.
 *
 * P8.1: All CLI commands route through this supervisor. A CLI process is a
 * single command invocation, so the supervisor typically holds one runtime
 * for the active project. If the CLI ever becomes long-running (e.g. the
 * TUI shell), this supervisor enables multiple concurrent project runtimes
 * without re-instantiation.
 *
 * The supervisor is module-level (not exported) — commands access it only
 * through buildRuntime(), preserving the existing public API.
 */
const cliSupervisor = new RuntimeSupervisor();

// ---------------------------------------------------------------------------
// Runtime context builders (shared with other commands via catalog)
// ---------------------------------------------------------------------------

/**
 * Build the first-party catalog for the active project.
 *
 * P8.1: Uses cliSupervisor.getOrCreate() so the ProjectRuntime (and its
 * stateIO) are reused if this function is called more than once in a
 * process lifetime. The registry instances remain per-call (they are
 * lightweight, stateless wrappers over stateIO state).
 *
 * - Resolves the active project (or creates the 'default' project if none)
 * - Gets or creates a ProjectRuntime from the process-level supervisor
 * - Constructs registries using the runtime's project-scoped stateIO
 * - Returns the module registry, capability registry, restriction registry,
 *   ack store, and the resolved project ID
 *
 * P4: All registry state is scoped to the active project's directory.
 */
export function buildRuntime(): {
  registry: ModuleRegistry;
  capabilityRegistry: CapabilityRegistry;
  restrictionRegistry: RestrictionRegistry;
  ackStore: AckStore;
  resourceConfigStore: ResourceConfigStore;
  stateIO: StateIO;
  projectId: string;
  ctx: RuntimeContext;
  runtime: ProjectRuntime;
} {
  const archonDir = getArchonDir();
  // Idempotent: copies legacy .archon/state/ and .archon/logs/ into the
  // default project directory if a project index does not yet exist.
  migrateLegacyState(archonDir);
  const project = getOrCreateDefaultProject(archonDir);

  // P8.1: Get or create the runtime for this project from the process-level
  // supervisor. ctxProvider and stateIOProvider are lazy — only called on
  // first creation. Subsequent calls to buildRuntime() within the same
  // process reuse the existing runtime and its stateIO.
  const runtime = cliSupervisor.getOrCreate(
    project.id,
    () => {
      // P7.5 / ACM-001: Build attribution context for this invocation.
      const device = loadOrCreateDevice(archonDir);
      const user = loadOrCreateUser(archonDir);
      const session = createSession(device, user);
      const agent = loadOrCreateOperatorAgent(project.id, session.session_id, archonDir);
      return {
        device_id: device.device_id,
        user_id: user.user_id,
        session_id: session.session_id,
        project_id: project.id,
        agent_id: agent.agent_id,
        archon_version: ARCHON_VERSION,
      };
    },
    () => projectStateIO(project.id, archonDir),
  );

  // Registries are constructed per call using the runtime's stateIO.
  // They are lightweight, stateless state readers — no caching required.
  const { stateIO } = runtime;
  const registry = new ModuleRegistry(stateIO);

  // Register modules. First-party typed constants bypass bundle hash check
  // (DEV_SKIP_HASH_VERIFICATION). Provider modules follow the same pattern
  // for S10 — hash verification is not yet enforced for any typed catalog entry.
  registry.register(FILESYSTEM_MANIFEST);
  registry.register(ANTHROPIC_MANIFEST);
  registry.register(EXEC_MANIFEST);

  // Apply operator's persisted enablement state.
  registry.applyPersistedState();

  const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
  const restrictionRegistry = new RestrictionRegistry(stateIO);
  const ackStore = new AckStore(stateIO);
  // P5: Resource configuration store — reads per-project FS roots, net allowlist, etc.
  const resourceConfigStore = new ResourceConfigStore(stateIO);

  return {
    registry,
    capabilityRegistry,
    restrictionRegistry,
    ackStore,
    resourceConfigStore,
    stateIO,
    projectId: project.id,
    ctx: runtime.ctx,
    runtime,
  };
}

/**
 * Build the active RuleSnapshot from current runtime state.
 *
 * P8.1: Delegates to buildSnapshotForProject() (from @archon/module-loader),
 * the single authoritative snapshot construction call site. The public
 * signature is preserved for backward compatibility with existing CLI commands.
 *
 * @param registry - Current module registry
 * @param capabilityRegistry - Current capability registry
 * @param restrictionRegistry - Current restriction registry
 * @param ackStore - Current ack store (supplies ackEpoch)
 * @param projectId - Active project ID (becomes part of the snapshot hash)
 * @param resourceConfigStore - Optional resource config store (P5)
 */
export function buildSnapshot(
  registry: ModuleRegistry,
  capabilityRegistry: CapabilityRegistry,
  restrictionRegistry: RestrictionRegistry,
  ackStore: AckStore,
  projectId: string,
  resourceConfigStore?: ResourceConfigStore,
) {
  return buildSnapshotForProject({
    projectId,
    registry,
    capabilityRegistry,
    restrictionRegistry,
    ackStore,
    ...(resourceConfigStore !== undefined ? { resourceConfigStore } : {}),
  });
}

/**
 * Construct the KernelAdapters bundle for CLI.
 *
 * Wired adapters (real implementations):
 *   - filesystem: FsAdapter (P5 root boundary enforcement)
 *   - exec: NodeExecAdapter (P5 CWD rooting from resource_config)
 *   - network: NodeNetworkAdapter (P5 hostname allowlist enforcement)
 *   - secrets: NodeSecretsAdapter (project-scoped SecretStore)
 *
 * Not yet wired (explicitly throw — no facades):
 *   - messaging: out of scope (no consumer exists in IOME)
 *   - ui: out of scope (platform-specific, no CLI adapter defined)
 *
 * @param stateIO - Project-scoped StateIO for constructing SecretStore
 */
export function buildAdapters(stateIO: StateIO): KernelAdapters {
  const fs = new FsAdapter();
  const exec = new NodeExecAdapter();
  const network = new NodeNetworkAdapter();
  const archonDir = getArchonDir();
  const secretStore = new SecretStore(stateIO, join(archonDir, 'device.key'));
  const secrets = new NodeSecretsAdapter(secretStore);
  const notImplemented = (): never => {
    throw new Error('Adapter not implemented for CLI');
  };
  return {
    filesystem: fs,
    exec,
    network,
    secrets,
    messaging: { send: notImplemented },
    ui: {
      requestApproval: notImplemented,
      presentRiskAck: notImplemented,
      requestClarification: notImplemented,
    },
  };
}

/**
 * Build the handler map for all registered modules.
 *
 * Maps "${module_id}:${capability_id}" → handler function.
 * This is the complete set of module handlers available in the CLI.
 *
 * When new modules are added (e.g. exec module in S11), their handlers
 * must be registered here.
 */
export function buildHandlerMap(): Map<string, ModuleHandler> {
  const handlers = new Map<string, ModuleHandler>();

  // Filesystem module — all 4 capabilities
  handlers.set('filesystem:fs.read', executeFsRead);
  handlers.set('filesystem:fs.list', executeFsList);
  handlers.set('filesystem:fs.write', executeFsWrite);
  handlers.set('filesystem:fs.delete', executeFsDelete);

  // Exec module — subprocess execution (T3)
  handlers.set('exec:exec.run', executeExecRun);

  // Anthropic provider — llm.infer (currently DEV STUB)
  handlers.set('provider.anthropic:llm.infer', executeLlmInfer);

  return handlers;
}

/**
 * Build a GateExecutionSurface with all module handlers and adapters.
 *
 * This is the complete execution surface for CLI invocations.
 * The surface is stateless (fresh ExecutionGate per call) and can
 * be used directly with ExecutionGate or injected into ProjectRuntime.
 *
 * @param stateIO - Project-scoped StateIO for adapter construction
 */
export function buildExecutionSurface(stateIO: StateIO): ExecutionSurface {
  const handlers = buildHandlerMap();
  const adapters = buildAdapters(stateIO);
  return new GateExecutionSurface(handlers, adapters);
}

// ---------------------------------------------------------------------------
// Demo command
// ---------------------------------------------------------------------------

export const demoCommand = new Command('demo')
  .description('Demonstrate the governance enforcement path (validate → gate → log)')
  .argument('<capability>', 'Capability type to demo (e.g. fs.read)')
  .argument('<path>', 'Path argument for the capability')
  .action(async (capability: string, targetPath: string) => {
    const {
      registry,
      capabilityRegistry,
      restrictionRegistry,
      ackStore,
      resourceConfigStore,
      projectId,
      runtime,
    } = buildRuntime();
    const { snapshot, hash } = buildSnapshot(
      registry,
      capabilityRegistry,
      restrictionRegistry,
      ackStore,
      projectId,
      resourceConfigStore,
    );

    // Resolve capability to a known module/capability_id for the demo.
    // For P0, only fs.read and fs.list are wired.
    let action: CapabilityInstance;
    switch (capability) {
      case 'fs.read':
        action = {
          project_id: projectId,
          capability_id: 'fs.read',
          module_id: 'filesystem',
          type: CapabilityType.FsRead,
          tier: RiskTier.T1,
          params: { path: targetPath },
        };
        break;
      case 'fs.list':
        action = {
          project_id: projectId,
          capability_id: 'fs.list',
          module_id: 'filesystem',
          type: CapabilityType.FsList,
          tier: RiskTier.T1,
          params: { path: targetPath },
        };
        break;
      default:
        // eslint-disable-next-line no-console
        console.error(`[archon demo] Unknown capability: ${capability}`);
        // eslint-disable-next-line no-console
        console.error('  Supported for P0: fs.read, fs.list');
        process.exit(1);
    }

    // Register all module handlers.
    const handlers = buildHandlerMap();

    const adapters = buildAdapters(runtime.stateIO);
    // P8.1: Use the runtime's own logSink so all gate events are logged with
    // the correct project_id (from runtime.ctx). No direct FileLogSink construction.
    const gate = new ExecutionGate(handlers, adapters, runtime.logSink);

    let result: { decision: DecisionOutcome; triggered_rules: ReadonlyArray<string>; result?: unknown };
    try {
      result = await gate.gate('cli-demo', action, snapshot, hash);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[archon demo] Gate error:', err);
      process.exit(1);
    }

    if (result.decision === DecisionOutcome.Permit) {
      // eslint-disable-next-line no-console
      console.log(`PERMITTED — capability: ${capability}`);
      if (result.result !== undefined) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(result.result, null, 2));
      }
    } else {
      // Determine and report the truthful denial reason.
      //
      // Inference rule:
      //   - triggered_rules contains 'project_mismatch' → cross-project action denied (P4)
      //   - triggered_rules non-empty (other) → a specific restriction rule matched (I2 deny)
      //   - triggered_rules empty AND active DRRs exist → allowlist exhausted (I2 deny)
      //   - triggered_rules empty AND no DRRs active → capability not in enabled set (I1)
      if (result.triggered_rules.includes('project_mismatch')) {
        // eslint-disable-next-line no-console
        console.log(`DENIED — project_mismatch: ${capability}`);
        // eslint-disable-next-line no-console
        console.log(`  Action project_id does not match snapshot project_id.`);
      } else {
        const activeDRRsForType = restrictionRegistry
          .listRules()
          .filter((r) => r.capabilityType === capability);

        if (result.triggered_rules.length > 0) {
          // eslint-disable-next-line no-console
          console.log(`DENIED — restricted_by_rule: ${capability}`);
          // eslint-disable-next-line no-console
          console.log(`  Triggered rule(s): ${result.triggered_rules.join(', ')}`);
        } else if (activeDRRsForType.length > 0) {
          // eslint-disable-next-line no-console
          console.log(`DENIED — restricted: ${capability}`);
          // eslint-disable-next-line no-console
          console.log(`  No allow rule matched the requested path.`);
          // eslint-disable-next-line no-console
          console.log(`  Active rules: ${activeDRRsForType.map((r) => r.id).join(', ')}`);
        } else {
          // eslint-disable-next-line no-console
          console.log(`DENIED — capability_not_enabled: ${capability}`);
          // eslint-disable-next-line no-console
          console.log(`  Enable the module and capability first:`);
          // eslint-disable-next-line no-console
          console.log(`    archon enable module filesystem`);
          // eslint-disable-next-line no-console
          console.log(`    archon enable capability ${capability}`);
        }
      }
    }
  });
