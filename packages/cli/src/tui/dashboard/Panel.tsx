import React from 'react'
import { Box, Text } from 'ink'

interface PanelProps {
  label: string
  meta?: string
  isFocused: boolean
  flexGrow?: number
  children: React.ReactNode
}

/**
 * Panel — reusable bordered panel for the /command-view dashboard.
 *
 * Border color: focused → #4FC3F7, unfocused → #242424.
 * Label row: uppercase dim label + right-aligned meta.
 */
export function Panel({ label, meta, isFocused, flexGrow = 1, children }: PanelProps): React.ReactElement {
  const borderColor = isFocused ? '#4FC3F7' : '#242424'

  return (
    <Box
      flexGrow={flexGrow}
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      paddingX={1}
    >
      {/* Label row */}
      <Box justifyContent="space-between" marginBottom={0}>
        <Text color="#4FC3F7" dimColor={!isFocused}>
          {label.toUpperCase()}
        </Text>
        {meta !== undefined && (
          <Text color="#666666">{meta}</Text>
        )}
      </Box>

      {/* Content */}
      {children}
    </Box>
  )
}
