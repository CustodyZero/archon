import { t, tierColor } from '../theme.js'
import { kernelService } from '../services/index.js'

/**
 * renderStatus — fetch and display kernel status.
 *
 * Output matches archon-cli-visual.html "Standard output" section exactly.
 */
export async function renderStatus(): Promise<void> {
  const [status, modules] = await Promise.all([
    kernelService.getStatus(),
    kernelService.listModules(),
  ])

  let out = '\n'

  // ◈ Enforcing  RS: f8a9b0c1  epoch: 6
  out += (
    '  ' +
    t.blue('◈ Enforcing') +
    '  ' +
    t.dim('RS: ') +
    t.blueDim(status.rsHash) +
    '  ' +
    t.dim('epoch:') +
    t.text(String(status.ackEpoch)) +
    '\n'
  )

  // modules section
  out += '\n  ' + t.muted('modules') + '\n'
  for (const mod of modules) {
    const dot = mod.enabled ? t.green('●') : t.dim('○')
    const name = mod.enabled ? t.white(mod.moduleName) : t.muted(mod.moduleName)
    const tierStr = tierColor(mod.tier)(mod.tier)
    const ackBadge = mod.ackRequired ? '  ' + t.amber('⚠ ack on file') : ''
    const disabledNote = !mod.enabled ? t.dim('  disabled') : ''

    // Fixed-width module name column: 24 chars
    const namePad = ' '.repeat(Math.max(1, 24 - mod.moduleName.length))
    out += (
      '    ' +
      dot + ' ' +
      name + namePad +
      t.dim('v' + mod.version + '  ') +
      tierStr +
      ackBadge +
      disabledNote +
      '\n'
    )
  }

  out += '\n'

  const labelW = 22
  const label = (s: string) => t.muted(s + ' '.repeat(Math.max(1, labelW - s.length)))

  out += '  ' + label('capabilities enabled') + t.white(String(status.capabilityCount)) + t.dim(' / 19') + '\n'
  out += '  ' + label('restrictions active') + t.white(String(status.restrictionCount)) + '\n'
  out += (
    '  ' + label('decisions today') +
    t.white(String(status.decisionsToday)) + '  ' +
    t.green(String(status.decisionsPermit) + ' permit') + '  ' +
    t.red(String(status.decisionsDeny) + ' deny') + '  ' +
    t.amber(String(status.decisionsEscalate) + ' escalate') +
    '\n'
  )
  out += '  ' + label('drift') + (status.drift === 'none' ? t.green('none') : t.amber(status.drift)) + '\n'
  out += '  ' + label('portability') + (status.portability ? t.green('portable') : t.amber('not portable')) + '\n'

  process.stdout.write(out)
}
