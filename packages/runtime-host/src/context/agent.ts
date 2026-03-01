/**
 * Archon Runtime Host — Agent Context (ACM-001)
 *
 * An operator agent represents the CLI or desktop process acting within a
 * specific project and session. A new operator agent is created for each
 * (project_id, session_id) pair and persisted for audit purposes.
 *
 * State layout:
 *   <archonDir>/projects/<project_id>/state/agents.json  — AgentRecord[]
 *
 * Lookup key: (kind='operator', session_id). If an operator agent for the
 * current session already exists in agents.json, it is returned. Otherwise
 * a new one is created and appended.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ulid } from '../logging/ulid.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An operator agent record persisted in agents.json. */
export interface AgentRecord {
  /** ULID generated at agent creation time. */
  readonly agent_id: string;
  /** Agent role — 'operator' for CLI/desktop; reserved for future agent kinds. */
  readonly kind: 'operator';
  /** The project scope for this agent. */
  readonly project_id: string;
  /** The session in which this agent was created. */
  readonly session_id: string;
  /** ISO 8601 timestamp of agent creation. */
  readonly created_at: string;
}

/** Returned by loadOrCreateOperatorAgent — the minimal context for event attribution. */
export interface AgentContext {
  /** ULID agent identifier for event attribution. */
  readonly agent_id: string;
  /** Agent role. */
  readonly kind: 'operator';
  /** Project scope. */
  readonly project_id: string;
  /** Session scope. */
  readonly session_id: string;
}

// ---------------------------------------------------------------------------
// Internal path helpers
// ---------------------------------------------------------------------------

function agentsFilePath(projectId: string, archonDir: string): string {
  return join(archonDir, 'projects', projectId, 'state', 'agents.json');
}

function readAgents(agentsPath: string): AgentRecord[] {
  try {
    if (!existsSync(agentsPath)) return [];
    const raw = readFileSync(agentsPath, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed as AgentRecord[];
    return [];
  } catch {
    return [];
  }
}

function writeAgents(agentsPath: string, agents: AgentRecord[]): void {
  mkdirSync(join(agentsPath, '..'), { recursive: true });
  writeFileSync(agentsPath, JSON.stringify(agents, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load or create the operator agent for the given project and session.
 *
 * Lookup: finds an existing AgentRecord where kind='operator' and
 * session_id matches. If not found, generates a new agent_id (ULID),
 * appends the record to agents.json, and returns it.
 *
 * Idempotent for the same (projectId, sessionId) pair — calling this
 * multiple times with the same arguments returns the same agent_id.
 *
 * Called at:
 *   1. Project creation time: session_id='bootstrap' (historical record)
 *   2. Session startup: session_id=<current session ULID>
 *
 * @param projectId - Active project identifier
 * @param sessionId - Current session identifier (ULID or 'bootstrap')
 * @param archonDir - Archon home directory (from getArchonDir())
 * @returns Agent context for event attribution
 */
export function loadOrCreateOperatorAgent(
  projectId: string,
  sessionId: string,
  archonDir: string,
): AgentContext {
  const agentsPath = agentsFilePath(projectId, archonDir);
  const agents = readAgents(agentsPath);

  // Lookup: existing operator agent for this session
  const existing = agents.find(
    (a) => a.kind === 'operator' && a.session_id === sessionId,
  );
  if (existing !== undefined) {
    return {
      agent_id: existing.agent_id,
      kind: existing.kind,
      project_id: existing.project_id,
      session_id: existing.session_id,
    };
  }

  // Create new operator agent for this session
  const newAgent: AgentRecord = {
    agent_id: ulid(),
    kind: 'operator',
    project_id: projectId,
    session_id: sessionId,
    created_at: new Date().toISOString(),
  };

  writeAgents(agentsPath, [...agents, newAgent]);

  return {
    agent_id: newAgent.agent_id,
    kind: newAgent.kind,
    project_id: newAgent.project_id,
    session_id: newAgent.session_id,
  };
}
