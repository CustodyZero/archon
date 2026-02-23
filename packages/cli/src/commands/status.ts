/**
 * archon status — Show current system state
 *
 * Displays:
 * - Enabled modules
 * - Current system risk tier
 * - Active snapshot hash
 */

import { Command } from 'commander';

export const statusCommand = new Command('status')
  .description('Show current system state: enabled modules, active tier, snapshot hash')
  .option('--json', 'Output as JSON')
  .action((_options: { json?: boolean }) => {
    // TODO: call ModuleRegistry.listEnabled() — see packages/module-loader/src/registry.ts
    // TODO: compute system tier = max(Tier(c) for c in C_eff(S)) — see formal_governance.md §7
    // TODO: retrieve active snapshot hash from kernel state
    // TODO: format output as table or JSON depending on --json flag
    // eslint-disable-next-line no-console
    console.log('[stub] archon status — implementation pending');
    // eslint-disable-next-line no-console
    console.log('  enabled modules: []');
    // eslint-disable-next-line no-console
    console.log('  system tier: T0');
    // eslint-disable-next-line no-console
    console.log('  snapshot hash: (none)');
  });
