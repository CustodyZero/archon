import React from 'react'
import { Box, Text } from 'ink'
import { Panel } from './Panel.js'
import type { ProposalSummary } from '../services/index.js'

interface ProposalPanelProps {
  proposals: ProposalSummary[]
  isFocused: boolean
  flexGrow?: number
}

function statusColor(status: ProposalSummary['status']): string {
  switch (status) {
    case 'pending':  return '#D4880A'
    case 'applied':  return '#81C784'
    case 'rejected': return '#CF6679'
    case 'failed':   return '#CF6679'
  }
}

/**
 * ProposalPanel — recent proposals with id, kind, description, status badge.
 * Spans 2 columns (flexGrow={2}).
 */
export function ProposalPanel({ proposals, isFocused, flexGrow }: ProposalPanelProps): React.ReactElement {
  return (
    <Panel label="Proposals" meta="recent" isFocused={isFocused} {...(flexGrow !== undefined ? { flexGrow } : {})}>
      {proposals.map(p => (
        <Box key={p.id} justifyContent="space-between" gap={1}>
          <Text color="#0277BD">{p.shortId}</Text>
          <Text color="#4FC3F7">{p.kind}</Text>
          <Box flexGrow={1}><Text color="#C8C8C0">{p.changeSummary}</Text></Box>
          <Text color={statusColor(p.status)}>{p.status.toUpperCase()}</Text>
        </Box>
      ))}
    </Panel>
  )
}
