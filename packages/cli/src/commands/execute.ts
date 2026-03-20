/**
 * archon execute — Execute a governed capability action through the kernel gate
 *
 * Usage:
 *   archon execute <capability-type> [--module <id>] [--params <json>]
 *
 * Exercises the full validate → gate → handler → log path for any registered
 * capability. This is the production execution entry point.
 *
 * The capability type is resolved to a specific module. If multiple modules
 * provide the same capability type, --module is required to disambiguate.
 *
 * Params are passed as a JSON string and bound to the CapabilityInstance.
 *
 * P4 (Project Scoping): All execution is project-scoped via buildRuntime().
 * P8.1: Uses runtime.logSink for correct project_id attribution on all events.
 *
 * @see docs/specs/architecture.md §4 (validation flow)
 * @see docs/specs/module_api.md §6 (kernel-provided adapters)
 */

import { Command } from 'commander';
import {
  ExecutionGate,
  CapabilityType,
  DecisionOutcome,
} from '@archon/kernel';
import type { CapabilityInstance, CapabilityDescriptor } from '@archon/kernel';
import { buildRuntime, buildSnapshot, buildHandlerMap, buildAdapters } from './demo.js';

// ---------------------------------------------------------------------------
// Execute command
// ---------------------------------------------------------------------------

export const executeCommand = new Command('execute')
  .description('Execute a governed capability action through the kernel gate')
  .argument('<capability-type>', 'Capability type (e.g. fs.read, llm.infer, exec.run)')
  .option('--module <id>', 'Module ID providing the capability (required if ambiguous)')
  .option('--params <json>', 'JSON parameters for the capability instance', '{}')
  .action(async (capabilityTypeStr: string, opts: { module?: string; params: string }) => {
    // Step 1: Validate capability type against taxonomy.
    const allTypes = Object.values(CapabilityType) as string[];
    if (!allTypes.includes(capabilityTypeStr)) {
      process.stderr.write(
        `[archon execute] Unknown capability type: '${capabilityTypeStr}'\n` +
          `  Valid types: ${allTypes.join(', ')}\n`,
      );
      process.exit(1);
    }
    const capType = capabilityTypeStr as CapabilityType;

    // Step 2: Parse params.
    let params: Record<string, unknown>;
    try {
      params = JSON.parse(opts.params) as Record<string, unknown>;
      if (typeof params !== 'object' || params === null || Array.isArray(params)) {
        throw new Error('params must be a JSON object');
      }
    } catch (err) {
      process.stderr.write(
        `[archon execute] Invalid --params JSON: ${String(err)}\n`,
      );
      process.exit(1);
    }

    // Step 3: Build runtime and resolve module.
    const {
      registry,
      capabilityRegistry,
      restrictionRegistry,
      ackStore,
      resourceConfigStore,
      projectId,
      runtime,
    } = buildRuntime();

    // Find all modules (enabled and disabled) that declare this capability type.
    const enabledModules = registry.listEnabled();
    const allModules = registry.list();

    const enabledCandidates: { moduleId: string; descriptor: CapabilityDescriptor }[] = [];
    for (const manifest of enabledModules) {
      for (const desc of manifest.capability_descriptors) {
        if (desc.type === capType) {
          enabledCandidates.push({ moduleId: manifest.module_id, descriptor: desc });
        }
      }
    }

    const allCandidates: { moduleId: string; descriptor: CapabilityDescriptor; enabled: boolean }[] = [];
    for (const manifest of allModules) {
      for (const desc of manifest.capability_descriptors) {
        if (desc.type === capType) {
          const isEnabled = enabledModules.some((m) => m.module_id === manifest.module_id);
          allCandidates.push({ moduleId: manifest.module_id, descriptor: desc, enabled: isEnabled });
        }
      }
    }

    if (allCandidates.length === 0) {
      process.stderr.write(
        `[archon execute] No registered module provides capability type '${capabilityTypeStr}'.\n` +
          `  Registered modules: ${allModules.map((m) => m.module_id).join(', ') || '(none)'}\n`,
      );
      process.exit(1);
    }

    // Resolve which module to use.
    let resolvedModuleId: string;
    let resolvedDescriptor: CapabilityDescriptor;

    if (opts.module !== undefined) {
      // Explicit module selection.
      const match = allCandidates.find((c) => c.moduleId === opts.module);
      if (match === undefined) {
        process.stderr.write(
          `[archon execute] Module '${opts.module}' does not provide capability type '${capabilityTypeStr}'.\n` +
            `  Modules providing this type: ${allCandidates.map((c) => c.moduleId).join(', ')}\n`,
        );
        process.exit(1);
      }
      resolvedModuleId = match.moduleId;
      resolvedDescriptor = match.descriptor;
    } else if (enabledCandidates.length === 1) {
      // Unambiguous: exactly one enabled module provides this type.
      resolvedModuleId = enabledCandidates[0]!.moduleId;
      resolvedDescriptor = enabledCandidates[0]!.descriptor;
    } else if (enabledCandidates.length > 1) {
      // Ambiguous: multiple enabled modules provide this type.
      process.stderr.write(
        `[archon execute] Multiple enabled modules provide '${capabilityTypeStr}'. Use --module to disambiguate.\n` +
          `  Modules: ${enabledCandidates.map((c) => c.moduleId).join(', ')}\n`,
      );
      process.exit(1);
    } else {
      // No enabled module provides this type.
      const disabledModules = allCandidates.filter((c) => !c.enabled);
      if (disabledModules.length > 0) {
        process.stderr.write(
          `[archon execute] No enabled module provides '${capabilityTypeStr}'.\n` +
            `  Disabled modules with this capability: ${disabledModules.map((c) => c.moduleId).join(', ')}\n` +
            `  Enable the module first: archon enable module <module-id>\n`,
        );
      } else {
        process.stderr.write(
          `[archon execute] No module provides '${capabilityTypeStr}'.\n`,
        );
      }
      process.exit(1);
    }

    // Step 4: Build CapabilityInstance.
    const action: CapabilityInstance = {
      project_id: projectId,
      capability_id: resolvedDescriptor.capability_id,
      module_id: resolvedModuleId,
      type: capType,
      tier: resolvedDescriptor.tier,
      params,
    };

    // Step 5: Build snapshot.
    const { snapshot, hash } = buildSnapshot(
      registry,
      capabilityRegistry,
      restrictionRegistry,
      ackStore,
      projectId,
      resourceConfigStore,
    );

    // Step 6: Execute through gate with all handlers and adapters.
    const handlers = buildHandlerMap();
    const adapters = buildAdapters(runtime.stateIO);
    const gate = new ExecutionGate(handlers, adapters, runtime.logSink);

    let result: { decision: DecisionOutcome; triggered_rules: ReadonlyArray<string>; result?: unknown };
    try {
      result = await gate.gate(runtime.ctx.agent_id, action, snapshot, hash);
    } catch (err) {
      process.stderr.write(`[archon execute] Execution error: ${String(err)}\n`);
      process.exit(1);
    }

    // Step 7: Report result.
    if (result.decision === DecisionOutcome.Permit) {
      // eslint-disable-next-line no-console
      console.log(`PERMITTED — capability: ${capabilityTypeStr} (module: ${resolvedModuleId})`);
      if (result.result !== undefined) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(result.result, null, 2));
      }
    } else {
      // eslint-disable-next-line no-console
      console.log(`DENIED — capability: ${capabilityTypeStr}`);
      if (result.triggered_rules.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`  Triggered rule(s): ${result.triggered_rules.join(', ')}`);
      } else {
        // eslint-disable-next-line no-console
        console.log(`  Reason: capability not enabled (I1 deny-by-default)`);
        // eslint-disable-next-line no-console
        console.log(`  Enable the module and capability first:`);
        // eslint-disable-next-line no-console
        console.log(`    archon enable module ${resolvedModuleId}`);
        // eslint-disable-next-line no-console
        console.log(`    archon enable capability ${capabilityTypeStr}`);
      }
    }
  });
