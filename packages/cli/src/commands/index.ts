/**
 * commands/index.ts — Commander program, configured and exported without .parse().
 *
 * Imported by:
 *   src/bin/archon.ts   (non-interactive / ARCHON_NO_TUI path)
 *   src/index.ts        (backward-compat wrapper)
 */

import { program } from 'commander'
import { statusCommand } from './status.js'
import { enableCommand } from './enable.js'
import { disableCommand } from './disable.js'
import { restrictCommand } from './restrict.js'
import { rulesCommand } from './rules.js'
import { logCommand } from './log.js'
import { demoCommand } from './demo.js'
import { proposeCommand } from './propose.js'
import { proposalsCommand } from './proposals.js'
import { projectCommand } from './project.js'

program
  .name('archon')
  .description(
    'Archon — deterministic coordination kernel for local AI agents.\n' +
    'All capability changes require explicit operator confirmation.\n' +
    'See https://github.com/CustodyZero/archon for documentation.',
  )
  .version('0.0.1')

program.addCommand(statusCommand)
program.addCommand(enableCommand)
program.addCommand(disableCommand)
program.addCommand(restrictCommand)
program.addCommand(rulesCommand)
program.addCommand(logCommand)
program.addCommand(demoCommand)
program.addCommand(proposeCommand)
program.addCommand(proposalsCommand)
program.addCommand(projectCommand)

export { program }
