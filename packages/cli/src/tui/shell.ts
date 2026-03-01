/**
 * shell.ts — Archon interactive readline shell.
 *
 * Architecture: three strictly separated layers.
 *
 * LAYER 1 — READLINE (keystroke hot path)
 *   Node.js readline in raw mode. Zero render engine on this path.
 *   Handles: prompt display, character echo, line editing, history,
 *   submit on Enter, Ctrl+C.
 *
 * LAYER 2 — STDOUT OUTPUT (command results)
 *   Direct process.stdout.write() with chalk coloring. Append-only.
 *   Handles: status, proposals, help, error messages.
 *
 * LAYER 3 — INK FULL-SCREEN VIEWS (bounded modal experiences)
 *   Ink mounts ONLY for /command-view. readline is suspended.
 *   On exit, readline resumes.
 */

import * as readline from 'readline'
import React from 'react'
import { render } from 'ink'
import { kernelService } from './services/index.js'
import { renderHeader } from './output/header.js'
import { renderStatus } from './output/status.js'
import { renderProposalList, renderProposalDetail } from './output/proposals.js'
import { renderHelp } from './output/help.js'
import { buildPS1 } from './prompt.js'
import { notificationManager } from './notifications/manager.js'
import { t } from './theme.js'
import type { DashboardViewProps } from './dashboard/DashboardView.js'

// Deferred import of DashboardView to avoid importing React JSX at module load time
// (keeps the readline hot path clean of Ink initialization cost).
type DashboardViewCtor = React.ComponentType<DashboardViewProps>

function printUnknown(input: string): void {
  process.stdout.write(
    '\n  ' + t.red('unknown command: ') + t.muted(input) +
    '\n  ' + t.dim("type 'help' for available commands") + '\n'
  )
}

function mountDashboard(rl: readline.Interface, ps1: string): void {
  // Pause readline — stops it consuming stdin input.
  // Do NOT call setRawMode(false) here: Ink manages raw mode entirely
  // (setRawMode(true) in its useInput useEffect, setRawMode(false) in cleanup).
  // Calling setRawMode(false) before render() creates a cooked-mode window
  // between the sync call and Ink's async effect, causing OS-level echo of
  // keystrokes and preventing Ink's 'readable' listener from receiving them.
  // Do NOT set terminal=false: rl.pause() is sufficient to stop readline
  // from processing input; the terminal flag hack can corrupt readline state.
  rl.pause()

  // Ink 6 calls stdin.unref() during its cleanup (disableRawMode), which drains
  // the event loop before waitUntilExit() can resolve and restore readline.
  // A long-running setInterval holds an active handle for the duration of the
  // Ink session; restore() clears it once readline owns the process again.
  const keepAlive = setInterval(() => { /* keep event loop alive */ }, 60_000)

  // Lazy-import DashboardView (TSX module) only when needed.
  import('./dashboard/DashboardView.js')
    .then(mod => {
      const DashboardView = mod.DashboardView as DashboardViewCtor

      // DashboardView signals exit internally via useApp().exit().
      // waitUntilExit() resolves after Ink has fully cleaned up its stdin
      // listeners and terminal state — the correct moment to restore readline.
      const { waitUntilExit } = render(
        React.createElement(DashboardView, {
          onExit: () => { /* informational only — Ink handles its own teardown */ },
        })
      )

      const restore = () => {
        // Re-ref stdin BEFORE clearing keepAlive. Ink's disableRawMode() called
        // stdin.unref() during cleanup; rl.resume() restarts reading but does NOT
        // re-ref the underlying handle. Without an explicit ref(), clearing keepAlive
        // leaves the event loop with no active handles → process exits immediately.
        process.stdin.ref()
        clearInterval(keepAlive)
        // Ink left stdin in setRawMode(false) — restore for readline.
        process.stdin.setRawMode(true)
        rl.resume()
        // Write prompt directly — same reason as showPrompt (avoid _refreshLine desync).
        process.stdout.write('\n' + ps1)
      }

      waitUntilExit().then(restore).catch(restore)
    })
    .catch(err => {
      process.stdin.ref()
      clearInterval(keepAlive)
      process.stdout.write('\n  ' + t.red('dashboard error: ' + String(err)) + '\n')
      process.stdin.setRawMode(true)
      rl.resume()
      process.stdout.write('\n' + ps1)
    })
}

/**
 * launchShell — entry point for the interactive TTY shell.
 *
 * Called from src/bin/archon.ts when the process is running in a TTY
 * and ARCHON_NO_TUI is not set.
 */
export async function launchShell(): Promise<void> {
  // 1. Print startup header
  renderHeader()

  // 2. Fetch initial data
  const [status, project] = await Promise.all([
    kernelService.getStatus(),
    kernelService.getActiveProject(),
  ])

  const projectName = project?.name ?? 'default'
  const tier        = status.tier
  const ps1         = buildPS1(projectName, tier)

  // 3. Set up readline in raw mode.
  const rl = readline.createInterface({
    input:       process.stdin,
    output:      process.stdout,
    terminal:    true,
    historySize: 50,
  })
  process.stdin.setRawMode(true)

  // Tell readline the visual prompt so it tracks cursor position correctly
  // for line editing (cursor left/right, history navigation).
  rl.setPrompt(ps1)

  // Give the notification manager the prompt string so it can redraw the
  // prompt after inserting a notification line (written directly, not via
  // rl.prompt(), to avoid readline's _refreshLine() cursor desync).
  notificationManager.bind(ps1)

  // Escape dismisses the active notification. Handled here (not in the manager)
  // because shell.ts owns the readline interface and is the correct place for
  // all raw input handling.
  process.stdin.on('keypress', (_str: unknown, key: { name?: string }) => {
    if (key?.name === 'escape') {
      notificationManager.dismiss()
    }
  })

  // 4. Initial prompt — write directly to avoid readline's _refreshLine()
  //    cursor arithmetic on first display.
  process.stdout.write('\n' + ps1)

  // 5. Notification demo — fires after 3 seconds
  setTimeout(() => {
    notificationManager.push({
      id:               'demo-1',
      kind:             'proposal',
      message:          'new proposal · architect-agent → enable capability fs.write',
      suggestedCommand: 'proposals show a1b2c3d4',
      persistent:       true,
    })
  }, 3000)

  // Write a newline then the prompt directly. Bypassing rl.prompt() /
  // _refreshLine() prevents readline's prevRows cursor arithmetic from
  // moving the cursor up to the previous command line when its internal
  // model is desynced by external stdout writes.
  const showPrompt = (): void => {
    process.stdout.write('\n' + ps1)
  }

  // 6. Command routing
  rl.on('line', (line: string) => {
    const input = line.trim()

    if (input === '') {
      showPrompt()
      return
    }

    const parts = input.split(' ')
    const cmd   = parts[0] ?? ''
    const sub   = parts[1] ?? ''
    const arg   = parts[2] ?? ''

    if (cmd === 'status') {
      renderStatus()
        .then(showPrompt)
        .catch(err => {
          process.stdout.write('\n  ' + t.red(String(err)) + '\n')
          showPrompt()
        })
      return
    }

    if (cmd === 'proposals') {
      if (sub === '' || sub === 'list') {
        renderProposalList()
          .then(showPrompt)
          .catch(err => {
            process.stdout.write('\n  ' + t.red(String(err)) + '\n')
            showPrompt()
          })
        return
      }
      if (sub === 'show') {
        if (arg === '') {
          process.stdout.write('\n  ' + t.red('usage: proposals show <id>') + '\n')
          showPrompt()
        } else {
          renderProposalDetail(arg)
            .then(showPrompt)
            .catch(err => {
              process.stdout.write('\n  ' + t.red(String(err)) + '\n')
              showPrompt()
            })
        }
        return
      }
      printUnknown(input)
      showPrompt()
      return
    }

    if (input === '/command-view' || input === '/cv') {
      // readline is now paused inside mountDashboard.
      // showPrompt is NOT called here — the Ink restore path handles it.
      mountDashboard(rl, ps1)
      return
    }

    if (cmd === 'help') {
      renderHelp()
      showPrompt()
      return
    }

    printUnknown(input)
    showPrompt()
  })

  // 7. Clean exit on Ctrl+C
  rl.on('SIGINT', () => {
    process.stdout.write('\n')
    process.exit(0)
  })
}
