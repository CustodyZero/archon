#!/usr/bin/env node
/**
 * bin/archon.ts — TTY-aware entry point for the `archon` CLI command.
 *
 * In a TTY with ARCHON_NO_TUI unset: launches the interactive readline shell.
 * Otherwise: delegates to Commander (non-interactive / scripting mode).
 *
 * ARCHON_NO_TUI=1 archon help    → Commander output unchanged
 * archon (in TTY)                → interactive shell
 */

const isTTY         = process.stdout.isTTY === true && process.stdin.isTTY === true
const isInteractive = isTTY && process.env['ARCHON_NO_TUI'] === undefined

if (isInteractive) {
  const { launchShell } = await import('../tui/shell.js')
  await launchShell()
} else {
  const { program } = await import('../commands/index.js')
  program.parse()
}
