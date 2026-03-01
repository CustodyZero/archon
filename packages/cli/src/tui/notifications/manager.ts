import { t } from '../theme.js'

export interface Notification {
  id: string
  kind: 'proposal' | 'info' | 'warning' | 'error'
  message: string
  suggestedCommand?: string
  persistent: boolean
}

/**
 * NotificationManager — surfaces notifications in the blank line above the prompt.
 *
 * Invariant: launchShell and showPrompt always write '\n' before the prompt,
 * guaranteeing a blank line above the prompt line at all times. The manager
 * uses that line as a notification slot.
 *
 * Cursor movement uses relative sequences (\x1B[1A / \x1B[1B) rather than
 * ANSI save/restore (\x1B[s / \x1B[u), which diverge from readline's internal
 * cursor model and produce incorrect cursor position after display.
 *
 * The prompt string is written directly (not via rl.prompt()) to avoid
 * readline's _refreshLine() cursor arithmetic, which can overwrite the previous
 * command line when readline's prevRows tracking is desynced by external writes.
 *
 * bind(prompt) must be called from launchShell() after the prompt string is built.
 * dismiss() is called by shell.ts on Escape keypress — no listener registered here.
 */
class NotificationManager {
  private queue: Notification[] = []
  private currentlyDisplayed = false
  private promptStr = ''

  bind(promptStr: string): void {
    this.promptStr = promptStr
  }

  push(notification: Notification): void {
    this.queue.push(notification)
    if (!this.currentlyDisplayed) {
      this.display(notification)
    }
  }

  dismiss(): void {
    if (!this.currentlyDisplayed) return

    // Clear the notification line above, then redraw the prompt.
    process.stdout.write('\x1B[1A')    // cursor up 1 → notification line
    process.stdout.write('\r\x1B[2K')  // col 0, clear notification
    process.stdout.write('\x1B[1B')    // cursor down 1 → prompt line
    process.stdout.write('\r\x1B[2K')  // col 0, clear prompt line
    process.stdout.write(this.promptStr)  // write prompt directly — avoids _refreshLine() cursor desync

    this.queue.shift()
    this.currentlyDisplayed = false
    const next = this.queue[0]
    if (next !== undefined) {
      this.display(next)
    }
  }

  private display(notification: Notification): void {
    this.currentlyDisplayed = true

    const kindColor = this.kindColor(notification)
    const dot = kindColor('●')
    let line = '  ' + dot + '  ' + kindColor(notification.message)
    if (notification.suggestedCommand !== undefined) {
      line += '  ' + t.dim(notification.suggestedCommand)
    }

    // Move into the blank line above the prompt, write the notification there,
    // then come back down and redraw the prompt. All relative movement — no
    // save/restore sequences that would desync readline's cursor tracking.
    // Write prompt directly (not via rl.prompt()) to avoid readline's
    // _refreshLine() cursor arithmetic misidentifying the target row.
    process.stdout.write('\x1B[1A')    // cursor up 1 → blank line above prompt
    process.stdout.write('\r\x1B[2K')  // col 0, clear that line
    process.stdout.write(line)          // write notification
    process.stdout.write('\x1B[1B')    // cursor down 1 → prompt line
    process.stdout.write('\r\x1B[2K')  // col 0, clear prompt line
    process.stdout.write(this.promptStr)  // write prompt directly — avoids _refreshLine() cursor desync
  }

  private kindColor(notification: Notification) {
    switch (notification.kind) {
      case 'proposal': return t.blue
      case 'info':     return t.muted
      case 'warning':  return t.amber
      case 'error':    return t.red
    }
  }
}

export const notificationManager = new NotificationManager()
