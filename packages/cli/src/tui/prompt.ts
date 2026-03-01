import { t, tierColor } from './theme.js'

/**
 * buildPS1 — construct the colored PS1 prompt string.
 *
 * Format: [archon:sentinel-build:T2] ❯
 * Colors match archon-cli-visual.html PS1 spec exactly.
 */
export function buildPS1(project: string, tier: string): string {
  const bracket = t.blueDim
  const name    = t.blue.bold
  const proj    = t.muted
  const arrow   = t.blueDim

  return (
    bracket('[') +
    name('archon') +
    bracket(':') +
    proj(project) +
    bracket(':') +
    tierColor(tier)(tier) +
    bracket(']') +
    arrow(' ❯ ')
  )
}

/**
 * redrawPrompt — print a newline then the PS1.
 * Called after every command output to restore the prompt.
 */
export function redrawPrompt(ps1: string): void {
  process.stdout.write('\n' + ps1)
}
