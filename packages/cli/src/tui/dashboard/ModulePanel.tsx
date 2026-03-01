import React from 'react'
import { Box, Text } from 'ink'
import { Panel } from './Panel.js'
import type { ModuleEntry } from '../services/index.js'

interface ModulePanelProps {
  modules: ModuleEntry[]
  isFocused: boolean
}

/**
 * ModulePanel — all modules with ● / ○ dots and tier badges.
 */
export function ModulePanel({ modules, isFocused }: ModulePanelProps): React.ReactElement {
  const enabledCount = modules.filter(m => m.enabled).length

  return (
    <Panel label="Modules" meta={`${enabledCount} enabled`} isFocused={isFocused}>
      {modules.map(mod => {
        const tierColor = mod.tier === 'T3' ? '#CF6679' : mod.tier === 'T2' ? '#D4880A' : '#C8C8C0'
        return (
          <Box key={mod.moduleId} justifyContent="space-between">
            <Box gap={1}>
              <Text color={mod.enabled ? '#81C784' : '#444444'}>
                {mod.enabled ? '●' : '○'}
              </Text>
              <Text color={mod.enabled ? '#F2F2EC' : '#444444'}>
                {mod.moduleName}
              </Text>
            </Box>
            <Text color={tierColor}>{mod.tier}</Text>
          </Box>
        )
      })}
    </Panel>
  )
}
