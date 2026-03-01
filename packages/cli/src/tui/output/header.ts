import { t, tierColor } from '../theme.js'
import { kernelService } from '../services/index.js'

/**
 * renderHeader — print the startup banner.
 *
 * Three parts:
 *   1. Diamond mark + wordmark + tagline (brand block)
 *   2. Separator line
 *   3. Active project status (live from kernelService)
 *
 * Diamond geometry (7 rows, visual widths without ANSI):
 *   row 0:  9 chars  —  outer ◆  (blueDim)
 *   row 1: 11 chars  —  inner ring ◆  (blue)
 *   row 2: 13 chars  —  outer ◆  (blueDim) | wordmark at col 22
 *   row 3: 15 chars  —  outer ◆  (blueDim), center ◈  (white bold) | tagline at col 22
 *   row 4: 13 chars  —  outer ◆  (blueDim)
 *   row 5: 11 chars  —  inner ring ◆  (blue)
 *   row 6:  9 chars  —  outer ◆  (blueDim)
 */
export async function renderHeader(): Promise<void> {

  // ── Part 1: Brand block ──────────────────────────────────────────────────

  const d = [
    '        ' + t.blueDim('◆'),
    '      ' + t.blueDim('◆') + '   ' + t.blueDim('◆'),
    '    ' + t.blueDim('◆') + '   ' + t.blue('◆') + '   ' + t.blueDim('◆'),
    '  ' + t.blueDim('◆') + '   ' + t.blue('◆') + ' ' + t.white.bold('◈') + ' ' + t.blue('◆') + '   ' + t.blueDim('◆'),
    '    ' + t.blueDim('◆') + '   ' + t.blue('◆') + '   ' + t.blueDim('◆'),
    '      ' + t.blueDim('◆') + '   ' + t.blueDim('◆'),
    '        ' + t.blueDim('◆'),
  ]

  d[2] += '      ' + t.blue.bold('A R C H O N')
  d[3] += '      ' + t.muted('Deterministic AI Governance Kernel')

  process.stdout.write('\n')
  for (const line of d) {
    process.stdout.write(line + '\n')
  }

  // ── Part 2: Separator ────────────────────────────────────────────────────

  process.stdout.write('\n')
  process.stdout.write('  ' + t.dim('─'.repeat(60)) + '\n')
  process.stdout.write('\n')

  // ── Part 3: Project status ───────────────────────────────────────────────

  const [project, status] = await Promise.all([
    kernelService.getActiveProject(),
    kernelService.getStatus(),
  ])

  if (project != null) {
    const line1 = (
      '  ' +
      t.muted('project') +
      '  ' + t.blue(project.name.toUpperCase()) +
      '  ' + t.dim('·') +
      '  ' + tierColor(status.tier)(status.tier) +
      '  ' + t.dim('·') +
      '  ' + t.muted('RS') + ' ' + t.blueDim(status.rsHash.slice(0, 8)) +
      '  ' + t.dim('·') +
      '  ' + t.muted('epoch') + ' ' + t.text(String(status.ackEpoch))
    )
    const line2 = (
      '  ' +
      t.dim('  kernel enforcing  ·  ') +
      t.green(status.drift === 'none' ? 'no drift' : status.drift) +
      t.dim('  ·  ') +
      t.green(status.portability ? 'portable' : 'not portable')
    )
    process.stdout.write(line1 + '\n')
    process.stdout.write(line2 + '\n')
  } else {
    process.stdout.write('  ' + t.muted('no active project') + '\n')
    process.stdout.write('\n')
    process.stdout.write('    ' + t.dim('→  archon project create <name>   to create a new project') + '\n')
    process.stdout.write('    ' + t.dim('→  archon project open <name>     to open an existing project') + '\n')
  }

  process.stdout.write('\n')
}
