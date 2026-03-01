import React from 'react'
import { Box, Text } from 'ink'
import type { KernelStatus, ProjectInfo } from '../services/index.js'

interface DashboardHeaderProps {
  status: KernelStatus | null
  project: ProjectInfo | null
}

/**
 * DashboardHeader — full-width header row for /command-view.
 *
 * ◈ ARCHON — sentinel-build · T2 · RS: f8a9b0c1    q quit · tab navigate · r refresh
 *
 * Matches archon-cli-visual.html cv-header exactly.
 */
export function DashboardHeader({ status, project }: DashboardHeaderProps): React.ReactElement {
  const projectName = project?.name ?? '—'
  const tier        = status?.tier ?? '—'
  const rsHash      = status?.rsHash ?? '—'

  const tierColor = tier === 'T3' ? '#CF6679' : tier === 'T2' ? '#D4880A' : '#C8C8C0'

  return (
    <Box justifyContent="space-between" paddingX={1} borderStyle="single" borderColor="#222222">
      {/* Left side */}
      <Box gap={1}>
        <Text color="#4FC3F7" bold>◈ ARCHON</Text>
        <Text color="#2A2A2A">—</Text>
        <Text color="#666666">{projectName}</Text>
        <Text color="#2A2A2A">·</Text>
        <Text color={tierColor}>{tier}</Text>
        <Text color="#2A2A2A">·</Text>
        <Text color="#666666">
          {'RS: '}
          <Text color="#0277BD">{rsHash}</Text>
        </Text>
      </Box>

      {/* Right side — keybindings hint */}
      <Text color="#444444">q quit · tab navigate · r refresh</Text>
    </Box>
  )
}
