import React from 'react'
import { Box, Text } from 'ink'
import { Panel } from './Panel.js'
import type { AgentRecord } from '../services/index.js'

interface AgentPanelProps {
  agents: AgentRecord[]
  isFocused: boolean
}

/**
 * AgentPanel — agents with tier, status dot, decision count, last action.
 * Spans 1 column (default flexGrow={1}).
 */
export function AgentPanel({ agents, isFocused }: AgentPanelProps): React.ReactElement {
  return (
    <Panel label="Agents" meta={`${agents.length} active`} isFocused={isFocused}>
      {agents.map(agent => {
        const tierColor = agent.tier === 'T3' ? '#CF6679' : agent.tier === 'T2' ? '#D4880A' : '#C8C8C0'
        const statusDot = agent.status === 'active' ? '●' : agent.status === 'idle' ? '◌' : '○'
        const dotColor  = agent.status === 'active' ? '#81C784' : '#444444'

        return (
          <Box key={agent.agentId} flexDirection="column" marginBottom={0}>
            <Box gap={1}>
              <Text color={dotColor}>{statusDot}</Text>
              <Text color="#F2F2EC">{agent.agentId}</Text>
              <Text color={tierColor}>{agent.tier}</Text>
              <Text color="#666666">{agent.decisionsToday} dec</Text>
            </Box>
            {agent.lastAction !== null && (
              <Box paddingLeft={2}>
                <Text color="#444444" wrap="truncate-end">
                  {agent.lastAction}
                </Text>
              </Box>
            )}
          </Box>
        )
      })}
    </Panel>
  )
}
