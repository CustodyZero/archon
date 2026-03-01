import React, { useReducer, useState, useEffect } from 'react'
import { Box, Text, useInput, useApp, useStdout } from 'ink'
import chalk from 'chalk'
import { kernelService } from '../services/index.js'
import type {
  KernelStatus,
  ModuleEntry,
  ProposalSummary,
  AgentRecord,
  DecisionLogEntry,
  ProjectInfo,
} from '../services/index.js'
import { DashboardHeader } from './DashboardHeader.js'
import { KernelPanel } from './KernelPanel.js'
import { DecisionPanel } from './DecisionPanel.js'
import { ModulePanel } from './ModulePanel.js'
import { ProposalPanel } from './ProposalPanel.js'
import { AgentPanel } from './AgentPanel.js'
import { DecisionLogPanel } from './DecisionLogPanel.js'

// ─── State ───────────────────────────────────────────────────────────────────

interface DashboardData {
  status: KernelStatus
  modules: ModuleEntry[]
  proposals: ProposalSummary[]
  agents: AgentRecord[]
  decisionLog: DecisionLogEntry[]
  project: ProjectInfo | null
}

type DashboardState =
  | { phase: 'loading' }
  | { phase: 'ready'; data: DashboardData }
  | { phase: 'error'; message: string }

type DashboardAction =
  | { type: 'LOADED'; data: DashboardData }
  | { type: 'ERROR'; message: string }
  | { type: 'RELOAD' }

function reducer(_prev: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case 'LOADED': return { phase: 'ready', data: action.data }
    case 'ERROR':  return { phase: 'error', message: action.message }
    case 'RELOAD': return { phase: 'loading' }
  }
}

const PANEL_COUNT = 6

// ─── Component ───────────────────────────────────────────────────────────────

export interface DashboardViewProps {
  onExit: () => void
}

/**
 * DashboardView — full-screen Ink dashboard for /command-view.
 *
 * Mounts when the readline shell issues /cv or /command-view.
 * Unmounts on 'q' or Escape → restores readline.
 *
 * Keyboard:
 *   q / Escape  → exit
 *   Tab         → next panel
 *   Shift+Tab   → previous panel
 *   r           → re-fetch all data
 */
export function DashboardView({ onExit }: DashboardViewProps): React.ReactElement {
  const { exit: inkExit } = useApp()
  const [state, dispatch] = useReducer(reducer, { phase: 'loading' })
  const [activePanel, setActivePanel] = useState(0)
  const [refreshKey, setRefreshKey] = useState(0)
  const { stdout } = useStdout()

  // Fetch all data when mounting or on 'r' keypress
  useEffect(() => {
    let cancelled = false

    const fetch = async () => {
      try {
        const [status, modules, proposals, agents, decisionLog, project] = await Promise.all([
          kernelService.getStatus(),
          kernelService.listModules(),
          kernelService.listProposals(),
          kernelService.getAgents(),
          kernelService.getDecisionLog(6),
          kernelService.getActiveProject(),
        ])
        if (!cancelled) {
          dispatch({ type: 'LOADED', data: { status, modules, proposals, agents, decisionLog, project } })
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err)
          dispatch({ type: 'ERROR', message })
        }
      }
    }

    dispatch({ type: 'RELOAD' })
    fetch().catch(() => { /* handled inside */ })

    return () => { cancelled = true }
  }, [refreshKey])

  // Keyboard input
  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      // Signal host that exit was requested (informational).
      // Actual Ink teardown happens via inkExit(); shell restores
      // readline in the waitUntilExit().then() handler in shell.ts.
      onExit()
      inkExit()
      return
    }
    if (key.tab && !key.shift) {
      setActivePanel(p => (p + 1) % PANEL_COUNT)
      return
    }
    if (key.tab && key.shift) {
      setActivePanel(p => (p - 1 + PANEL_COUNT) % PANEL_COUNT)
      return
    }
    if (input === 'r') {
      setRefreshKey(k => k + 1)
    }
  })

  // ─── Loading ─────────────────────────────────────────────────────────────

  if (state.phase === 'loading') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="#4FC3F7">◈ ARCHON</Text>
        <Text color="#444444">loading…</Text>
      </Box>
    )
  }

  if (state.phase === 'error') {
    return (
      <Box flexDirection="column" padding={1}>
        <Text color="#CF6679">error loading dashboard: {state.message}</Text>
        <Text color="#444444">press q to exit</Text>
      </Box>
    )
  }

  const { data } = state
  const cols = stdout.columns ?? 80

  // Status bar content
  const rsHash      = data.status.rsHash
  const projectName = data.project?.name ?? '—'
  const tier        = data.status.tier
  const decisions   = data.status.decisionsToday
  const agentCount  = data.agents.length

  const slLeft  = ` ◈ enforcing · rs: ${rsHash} · ${projectName}:${tier}`
  const slRight = `q quit · r refresh · tab navigate panels `
  const slFill  = ' '.repeat(Math.max(0, cols - slLeft.length - slRight.length))
  const slLine  = chalk.bgHex('#0277BD').white(slLeft + slFill + slRight)

  // Decisions / agents line (also shown in status)
  void decisions
  void agentCount

  // ─── Layout ──────────────────────────────────────────────────────────────

  return (
    <Box flexDirection="column">
      {/* Header */}
      <DashboardHeader status={data.status} project={data.project} />

      {/* Row 1: Kernel | Decisions | Modules */}
      <Box flexDirection="row">
        <KernelPanel   status={data.status}  isFocused={activePanel === 0} />
        <DecisionPanel status={data.status}  isFocused={activePanel === 1} />
        <ModulePanel   modules={data.modules} isFocused={activePanel === 2} />
      </Box>

      {/* Row 2: Proposals (2/3) | Agents (1/3) */}
      <Box flexDirection="row">
        <ProposalPanel proposals={data.proposals} isFocused={activePanel === 3} flexGrow={2} />
        <AgentPanel    agents={data.agents}       isFocused={activePanel === 4} />
      </Box>

      {/* Row 3: Decision log — full width */}
      <DecisionLogPanel entries={data.decisionLog} isFocused={activePanel === 5} />

      {/* Status bar */}
      <Box>
        <Text>{slLine}</Text>
      </Box>
    </Box>
  )
}
