import React from 'react'
import { Box, Text } from 'ink'
import { Panel } from './Panel.js'
import type { KernelStatus } from '../services/index.js'

interface KernelPanelProps {
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
 * KernelPanel — kernel status: mode, tier, epoch, snapshot hash, drift, portability.
 */
export function KernelPanel({ status, isFocused }: KernelPanelProps): React.ReactElement {
  const tier       = status?.tier ?? '—'
  const epoch      = status?.ackEpoch ?? 0
  const rsHash     = status?.rsHash ?? '—'
  const drift      = status?.drift ?? 'none'
  const portable   = status?.portability ?? false

  const tierColor  = tier === 'T3' ? '#CF6679' : tier === 'T2' ? '#D4880A' : '#C8C8C0'
  const driftColor = drift === 'none' ? '#81C784' : '#D4880A'

  return (
    <Panel label="Kernel" meta="enforcing" isFocused={isFocused}>
      <Row label="mode">
        <Text color="#4FC3F7">deterministic</Text>
      </Row>
      <Row label="tier">
        <Text color={tierColor}>{tier}</Text>
      </Row>
      <Row label="epoch">
        <Text color="#C8C8C0">{String(epoch)}</Text>
      </Row>
      <Row label="snapshot">
        <Text color="#0277BD">{rsHash}</Text>
      </Row>
      <Row label="drift">
        <Text color={driftColor}>{drift}</Text>
      </Row>
      <Row label="portability">
        <Text color={portable ? '#81C784' : '#D4880A'}>{portable ? 'portable' : 'not portable'}</Text>
      </Row>
    </Panel>
  )
}
