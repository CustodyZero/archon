import React from 'react'
import { Box, Text } from 'ink'
import { Panel } from './Panel.js'
import type { KernelStatus } from '../services/index.js'

interface DecisionPanelProps {
  status: KernelStatus | null
  isFocused: boolean
}

function Row({ label, children }: { label: string; children: React.ReactNode }): React.ReactElement {
  return (
    <Box justifyContent="space-between">
      <Text color="#666666">{label}</Text>
      {children}
    </Box>
  )
}

/**
 * DecisionPanel — decisions today: total, permitted, denied, escalated, pending.
 */
export function DecisionPanel({ status, isFocused }: DecisionPanelProps): React.ReactElement {
  const total     = status?.decisionsToday ?? 0
  const permit    = status?.decisionsPermit ?? 0
  const deny      = status?.decisionsDeny ?? 0
  const escalate  = status?.decisionsEscalate ?? 0

  return (
    <Panel label="Decisions" meta="today" isFocused={isFocused}>
      <Row label="total">
        <Text color="#C8C8C0">{String(total)}</Text>
      </Row>
      <Row label="permitted">
        <Text color="#81C784">{String(permit)}</Text>
      </Row>
      <Row label="denied">
        <Text color="#C8C8C0">{String(deny)}</Text>
      </Row>
      <Row label="escalated">
        <Text color="#D4880A">{String(escalate)}</Text>
      </Row>
      <Row label="pending">
        <Text color="#81C784">0</Text>
      </Row>
    </Panel>
  )
}
