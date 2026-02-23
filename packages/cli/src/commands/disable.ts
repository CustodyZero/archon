/**
 * archon disable — Disable a capability module
 *
 * Requires explicit operator confirmation (Confirm-on-Change).
 */

import { Command } from 'commander';

export const disableCommand = new Command('disable')
  .description('Disable a capability module (requires operator confirmation)')
  .argument('<module-id>', 'Module ID to disable')
  .action((moduleId: string) => {
    // TODO: verify module is currently Enabled via ModuleRegistry.getStatus()
    //   see packages/module-loader/src/registry.ts
    // TODO: display toggle diff: what capabilities will be disabled, tier impact
    //   see authority_and_composition_spec.md §11 (confirm-on-change)
    // TODO: prompt operator for explicit confirmation
    // TODO: call ModuleRegistry.disable(moduleId) on confirmation
    //   see packages/module-loader/src/registry.ts
    // TODO: trigger snapshot rebuild via SnapshotBuilderImpl
    //   see packages/kernel/src/snapshot/builder.ts
    // eslint-disable-next-line no-console
    console.log(`[stub] archon disable ${moduleId} — implementation pending`);
    // eslint-disable-next-line no-console
    console.log('  confirm-on-change flow not yet implemented');
  });
