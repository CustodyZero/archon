/**
 * archon enable — Enable a capability module
 *
 * Requires explicit operator confirmation (Confirm-on-Change).
 * Enabling T3 capabilities requires typed acknowledgment phrase.
 */

import { Command } from 'commander';

export const enableCommand = new Command('enable')
  .description('Enable a capability module (requires operator confirmation)')
  .argument('<module-id>', 'Module ID to enable')
  .action((moduleId: string) => {
    // TODO: call ModuleLoader.load(manifest) if module is not yet loaded
    //   see packages/module-loader/src/loader.ts
    // TODO: retrieve module from ModuleRegistry — see packages/module-loader/src/registry.ts
    // TODO: display toggle diff: what capabilities will be enabled, tier impact, hazard flags
    //   see authority_and_composition_spec.md §11 (confirm-on-change)
    // TODO: if enabling T3 capabilities: require typed acknowledgment phrase (I5)
    //   see formal_governance.md §7 (typed acknowledgment on tier elevation)
    // TODO: prompt operator for explicit confirmation
    // TODO: call ModuleRegistry.enable(moduleId) on confirmation
    //   see packages/module-loader/src/registry.ts
    // TODO: trigger snapshot rebuild via SnapshotBuilderImpl
    //   see packages/kernel/src/snapshot/builder.ts
    // eslint-disable-next-line no-console
    console.log(`[stub] archon enable ${moduleId} — implementation pending`);
    // eslint-disable-next-line no-console
    console.log('  confirm-on-change flow not yet implemented');
  });
