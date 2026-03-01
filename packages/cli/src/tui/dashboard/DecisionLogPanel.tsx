import React from 'react'
import { Box, Text } from 'ink'
import { Panel } from './Panel.js'
import type { DecisionLogEntry } from '../services/index.js'

interface DecisionLogPanelProps {
  entries: DecisionLogEntry[]
  isFocused: boolean
}

function outcomeSymbol(outcome: DecisionLogEntry['outcome']): { sym: string; color: string } {
  switch (outcome) {
    case 'Permit':   return { sym: '✓ permit', color: '#81C784' }
    case 'Deny':     return { sym: '✕ deny',   color: '#CF6679' }
    case 'Escalate': return { sym: '↑ escalate', color: '#D4880A' }
  }
}

/**
 * DecisionLogPanel — last N decision log entries, full width.
 *
 * Format: timestamp | outcome colored | action | agent dim
 * Matches archon-cli-visual.html log section exactly.
 */
export function DecisionLogPanel({ entries, isFocused }: DecisionLogPanelProps): React.ReactElement {
  return (
    <Panel label="Decision Log" meta={`last ${entries.length}`} isFocused={isFocused}>
      {entries.map((entry, i) => {
        const { sym, color } = outcomeSymbol(entry.outcome)
        return (
          <Box key={i} gap={2}>
            <Text color="#444444">{entry.timestamp}</Text>
            <Text color={color}>{sym}</Text>
            <Box flexGrow={1}><Text color="#C8C8C0">{entry.action}</Text></Box>
            <Text color="#666666">{entry.agentId}</Text>
          </Box>
        )
      })}
    </Panel>
  )
}
