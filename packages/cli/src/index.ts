#!/usr/bin/env node
/**
 * Archon CLI — Operator command-line interface
 *
 * Entry point for the `archon` CLI command.
 *
 * Usage:
 *   archon --help
 *   archon status
 *   archon enable module <module-id>
 *   archon enable capability <capability-type>
 *   archon disable <module-id>
 *   archon rules list
 *   archon rules add <file>
 *   archon rules remove <rule-id>
 *   archon log [--snapshot <hash>]
 *   archon demo <capability> <path>
 *
 * @see docs/specs/authority_and_composition_spec.md §11 (confirm-on-change posture)
 * @see docs/specs/governance.md §1 (rule proposal flow)
 */

import { program } from 'commander';
import { statusCommand } from './commands/status.js';
import { enableCommand } from './commands/enable.js';
import { disableCommand } from './commands/disable.js';
import { restrictCommand } from './commands/restrict.js';
import { rulesCommand } from './commands/rules.js';
import { logCommand } from './commands/log.js';
import { demoCommand } from './commands/demo.js';
import { proposeCommand } from './commands/propose.js';
import { proposalsCommand } from './commands/proposals.js';
import { projectCommand } from './commands/project.js';

program
  .name('archon')
  .description(
    'Archon — deterministic coordination kernel for local AI agents.\n' +
    'All capability changes require explicit operator confirmation.\n' +
    'See https://github.com/CustodyZero/archon for documentation.',
  )
  .version('0.0.1');

program.addCommand(statusCommand);
program.addCommand(enableCommand);
program.addCommand(disableCommand);
program.addCommand(restrictCommand);
program.addCommand(rulesCommand);
program.addCommand(logCommand);
program.addCommand(demoCommand);
program.addCommand(proposeCommand);
program.addCommand(proposalsCommand);
program.addCommand(projectCommand);

program.parse();
