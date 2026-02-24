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
 * @see docs/specs/architecture.md §4 (validation flow)
 */

import { Command } from 'commander';
import {
  ExecutionGate,
  SnapshotBuilderImpl,
  DecisionOutcome,
  CapabilityType,
  RiskTier,
} from '@archon/kernel';
import type { KernelAdapters, CapabilityInstance, ModuleHandler } from '@archon/kernel';
import { FsAdapter, FileLogSink } from '@archon/runtime-host';
import { ModuleRegistry, CapabilityRegistry, RestrictionRegistry, getAckEpoch } from '@archon/module-loader';
import { FILESYSTEM_MANIFEST } from '@archon/module-filesystem';
import { executeFsRead, executeFsList } from '@archon/module-filesystem';

// ---------------------------------------------------------------------------
// Runtime context builders (shared with other commands via catalog)
// ---------------------------------------------------------------------------

/** The single engine version string used throughout P0. */
const ENGINE_VERSION = '0.0.1';

/**
 * Build the first-party catalog: register manifests, apply persisted state.
 * Returns the module registry, capability registry, and restriction registry.
 */
export function buildRuntime(): {
  registry: ModuleRegistry;
  capabilityRegistry: CapabilityRegistry;
  restrictionRegistry: RestrictionRegistry;
} {
  const registry = new ModuleRegistry();

  // Register first-party modules. In P0 this is a hardcoded catalog.
  // DEV_SKIP_HASH_VERIFICATION: first-party typed constants bypass bundle hash check.
  registry.register(FILESYSTEM_MANIFEST);

  // Apply operator's persisted enablement state.
  registry.applyPersistedState();

  const capabilityRegistry = new CapabilityRegistry(registry);
  const restrictionRegistry = new RestrictionRegistry();
  return { registry, capabilityRegistry, restrictionRegistry };
}

/**
 * Build the active RuleSnapshot from current runtime state.
 *
 * Includes compiled DRRs from the RestrictionRegistry (Invariant I2, I4).
 * Incorporates ack_epoch so RS_hash changes after T3 capability acknowledgments
 * (Invariants I4, I5). Pass getAckEpoch() from @archon/module-loader at call sites,
 * or use the default (reads from disk via getAckEpoch()).
 *
 * @param registry - Current module registry
 * @param capabilityRegistry - Current capability registry
 * @param restrictionRegistry - Current restriction registry
 * @param ackEpoch - T3 ack event count (default: reads from disk via getAckEpoch())
 */
export function buildSnapshot(
  registry: ModuleRegistry,
  capabilityRegistry: CapabilityRegistry,
  restrictionRegistry: RestrictionRegistry,
  ackEpoch: number = getAckEpoch(),
) {
  const builder = new SnapshotBuilderImpl();
  const snapshot = builder.build(
    registry.listEnabled(),
    capabilityRegistry.listEnabledCapabilities(),
    restrictionRegistry.compileAll(),
    ENGINE_VERSION,
    '',
    undefined,
    ackEpoch,
  );
  return { snapshot, hash: builder.hash(snapshot) };
}

/**
 * Construct a minimal KernelAdapters bundle for CLI demo.
 * Only the filesystem adapter is wired. Others are not-implemented stubs.
 */
function buildAdapters(): KernelAdapters {
  const fs = new FsAdapter();
  const notImplemented = (): never => {
    throw new Error('Adapter not implemented for P0 CLI demo');
  };
  return {
    filesystem: fs,
    network: { fetchHttp: notImplemented },
    exec: { run: notImplemented },
    secrets: { read: notImplemented, use: notImplemented, injectEnv: notImplemented },
    messaging: { send: notImplemented },
    ui: {
      requestApproval: notImplemented,
      presentRiskAck: notImplemented,
      requestClarification: notImplemented,
    },
  };
}

// ---------------------------------------------------------------------------
// Demo command
// ---------------------------------------------------------------------------

export const demoCommand = new Command('demo')
  .description('Demonstrate the governance enforcement path (validate → gate → log)')
  .argument('<capability>', 'Capability type to demo (e.g. fs.read)')
  .argument('<path>', 'Path argument for the capability')
  .action(async (capability: string, targetPath: string) => {
    const { registry, capabilityRegistry, restrictionRegistry } = buildRuntime();
    const { snapshot, hash } = buildSnapshot(registry, capabilityRegistry, restrictionRegistry);

    // Resolve capability to a known module/capability_id for the demo.
    // For P0, only fs.read and fs.list are wired.
    let action: CapabilityInstance;
    switch (capability) {
      case 'fs.read':
        action = {
          capability_id: 'fs.read',
          module_id: 'filesystem',
          type: CapabilityType.FsRead,
          tier: RiskTier.T1,
          params: { path: targetPath },
        };
        break;
      case 'fs.list':
        action = {
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

    // Register handlers for permitted capabilities.
    const handlers = new Map<string, ModuleHandler>();
    handlers.set('filesystem:fs.read', executeFsRead);
    handlers.set('filesystem:fs.list', executeFsList);

    const adapters = buildAdapters();
    const gate = new ExecutionGate(handlers, adapters, new FileLogSink());

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
      // Inference rule (I2 vs I1 distinction):
      //   - triggered_rules non-empty  → a specific restriction rule matched (I2 deny)
      //   - triggered_rules empty AND active DRRs exist for this capability type
      //                               → allowlist exhausted (I2 deny, no rule matched)
      //   - triggered_rules empty AND no DRRs active for this type
      //                               → capability not in enabled set (I1)
      const activeDRRsForType = restrictionRegistry
        .listRules()
        .filter((r) => r.capabilityType === capability);

      if (result.triggered_rules.length > 0) {
        // A specific deny rule was matched.
        // eslint-disable-next-line no-console
        console.log(`DENIED — restricted_by_rule: ${capability}`);
        // eslint-disable-next-line no-console
        console.log(`  Triggered rule(s): ${result.triggered_rules.join(', ')}`);
      } else if (activeDRRsForType.length > 0) {
        // Allowlist policy: allow rules exist but none matched the requested path.
        // eslint-disable-next-line no-console
        console.log(`DENIED — restricted: ${capability}`);
        // eslint-disable-next-line no-console
        console.log(`  No allow rule matched the requested path.`);
        // eslint-disable-next-line no-console
        console.log(`  Active rules: ${activeDRRsForType.map((r) => r.id).join(', ')}`);
      } else {
        // No DRRs active — capability type or module not enabled.
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
  });
