import { t } from '../theme.js'
import { kernelService } from '../services/index.js'
import type { ProposalSummary } from '../services/index.js'

function statusColor(status: ProposalSummary['status']): string {
  switch (status) {
    case 'pending':  return t.amber(status)
    case 'applied':  return t.green(status)
    case 'rejected': return t.red(status)
    case 'failed':   return t.red(status)
  }
}

/**
 * renderProposalList — fetch and display the proposals table.
 *
 * Output matches archon-cli-visual.html proposals table exactly.
 */
export async function renderProposalList(): Promise<void> {
  const proposals = await kernelService.listProposals()

  let out = '\n'

  // Header row
  out += (
    '  ' +
    t.dim('id        status     kind                    summary') +
    '\n'
  )
  out += (
    '  ' +
    t.dim('────────  ─────────  ──────────────────────  ────────────────────────────────') +
    '\n'
  )

  for (const p of proposals) {
    const id     = t.blueDim(p.shortId)
    const status = statusColor(p.status)
    const kind   = p.kind
    const summary = p.changeSummary

    const statusPad = ' '.repeat(Math.max(1, 9 - p.status.length))
    const kindPad   = ' '.repeat(Math.max(1, 22 - kind.length))

    out += '  ' + id + '  ' + status + statusPad + ' ' + kind + kindPad + '  ' + summary + '\n'
  }

  const pending = proposals.filter(p => p.status === 'pending').length
  out += '\n'
  out += '  ' + t.dim(`${proposals.length} proposals  `) + t.amber(String(pending) + ' pending') + '\n'

  process.stdout.write(out)
}

/**
 * renderProposalDetail — fetch and display a single proposal detail box.
 *
 * Output matches archon-cli-visual.html proposal box exactly.
 */
export async function renderProposalDetail(id: string): Promise<void> {
  const proposal = await kernelService.getProposal(id)

  if (proposal === null) {
    process.stdout.write('\n  ' + t.red('error: proposal not found: ' + id) + '\n')
    return
  }

  const BOX_W = 67   // total width including ┌ and ┐
  const inner = BOX_W - 2

  const topLabel = ' proposal ' + proposal.shortId + ' '
  const topDashes = '─'.repeat(Math.max(0, inner - 1 - topLabel.length))
  const top = t.dim('  ┌─' + topLabel + topDashes + '┐')

  const row = (key: string, value: string) => {
    const k = t.dim('  │  ') + t.dim(key)
    const kpad = ' '.repeat(Math.max(1, 11 - key.length))
    return k + kpad + value + '\n'
  }

  const bottom = t.dim('  └' + '─'.repeat(inner) + '┘')

  let out = '\n' + top + '\n'

  out += row('kind',     proposal.kind)
  out += row('change',   proposal.changeSummary)
  out += row('proposed', t.muted(proposal.createdById + '  ' + proposal.createdAt))
  out += row('status',   statusColor(proposal.status))
  out += t.dim('  │\n')

  if (proposal.requiresTypedAck) {
    out += t.dim('  │  ') + t.red('⚠ tier T3  type exactly:  ') + t.white.bold(proposal.requiredAckPhrase ?? '') + '\n'
  } else {
    out += t.dim('  │  ') + t.dim('tier elevation  ') + t.amber('T1 → T2') + t.dim('  no typed ack required at T2') + '\n'
  }

  if (proposal.hazardsTriggered.length === 0) {
    out += t.dim('  │  hazards         ') + t.green('none triggered') + '\n'
  } else {
    out += t.dim('  │  hazards triggered') + '\n'
    for (const [a, b] of proposal.hazardsTriggered) {
      out += (
        t.dim('  │    ') +
        t.amber('!') + ' ' +
        t.blue(a) + t.dim(' + ') + t.blue(b) +
        t.dim('  arbitrary write via subprocess output') +
        '\n'
      )
    }
  }

  out += bottom + '\n'
  out += '\n  ' + t.dim("use 'proposals approve " + proposal.shortId + "' to approve") + '\n'

  process.stdout.write(out)
}
