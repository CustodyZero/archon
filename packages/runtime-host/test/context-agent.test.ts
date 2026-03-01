/**
 * Archon Runtime Host — AgentContext Tests (ACM-001)
 *
 *   AGT-U1: loadOrCreateOperatorAgent() creates agents.json on first call
 *   AGT-U2: agent_id is a 26-char ULID
 *   AGT-U3: loadOrCreateOperatorAgent() is stable for the same (project, session)
 *   AGT-U4: different sessions produce different agent_ids in the same project
 *   AGT-U5: different projects produce different agent_ids for the same session
 *   AGT-U6: agents.json accumulates one record per unique session
 *
 * Isolation: each test uses an independent temp directory. No shared state.
 */

import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadOrCreateOperatorAgent } from '../src/context/agent.js';

function makeTmpDir(label: string): string {
  return mkdtempSync(join(tmpdir(), `archon-agt-${label}-`));
}

const TEST_PROJECT = 'proj-abc123';
const TEST_SESSION = '01ARZ3NDEKTSV4RRFFQ69G5FAV';

describe('AgentContext — AGT-U1: creates agents.json on first call', () => {
  it('returns an AgentContext with a non-empty agent_id', () => {
    const archonDir = makeTmpDir('u1');
    const agent = loadOrCreateOperatorAgent(TEST_PROJECT, TEST_SESSION, archonDir);
    expect(typeof agent.agent_id).toBe('string');
    expect(agent.agent_id.length).toBeGreaterThan(0);
  });

  it('creates agents.json at <archonDir>/projects/<id>/state/agents.json', () => {
    const { existsSync } = require('node:fs') as typeof import('node:fs');
    const archonDir = makeTmpDir('u1b');
    loadOrCreateOperatorAgent(TEST_PROJECT, TEST_SESSION, archonDir);
    const expectedPath = join(archonDir, 'projects', TEST_PROJECT, 'state', 'agents.json');
    expect(existsSync(expectedPath)).toBe(true);
  });

  it('agents.json contains one record with correct fields', () => {
    const archonDir = makeTmpDir('u1c');
    const agent = loadOrCreateOperatorAgent(TEST_PROJECT, TEST_SESSION, archonDir);
    const agentsPath = join(archonDir, 'projects', TEST_PROJECT, 'state', 'agents.json');
    const parsed = JSON.parse(readFileSync(agentsPath, 'utf-8')) as unknown[];
    expect(parsed).toHaveLength(1);
    const record = parsed[0] as Record<string, unknown>;
    expect(record['agent_id']).toBe(agent.agent_id);
    expect(record['kind']).toBe('operator');
    expect(record['project_id']).toBe(TEST_PROJECT);
    expect(record['session_id']).toBe(TEST_SESSION);
  });
});

describe('AgentContext — AGT-U2: agent_id is a 26-char uppercase ULID', () => {
  it('agent_id matches ULID format', () => {
    const archonDir = makeTmpDir('u2');
    const agent = loadOrCreateOperatorAgent(TEST_PROJECT, TEST_SESSION, archonDir);
    expect(agent.agent_id).toHaveLength(26);
    expect(agent.agent_id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});

describe('AgentContext — AGT-U3: stable for the same (project, session) pair', () => {
  it('returns the same agent_id on repeated calls', () => {
    const archonDir = makeTmpDir('u3');
    const first  = loadOrCreateOperatorAgent(TEST_PROJECT, TEST_SESSION, archonDir);
    const second = loadOrCreateOperatorAgent(TEST_PROJECT, TEST_SESSION, archonDir);
    const third  = loadOrCreateOperatorAgent(TEST_PROJECT, TEST_SESSION, archonDir);
    expect(second.agent_id).toBe(first.agent_id);
    expect(third.agent_id).toBe(first.agent_id);
  });

  it('does not append duplicate records on repeated calls', () => {
    const archonDir = makeTmpDir('u3b');
    loadOrCreateOperatorAgent(TEST_PROJECT, TEST_SESSION, archonDir);
    loadOrCreateOperatorAgent(TEST_PROJECT, TEST_SESSION, archonDir);
    loadOrCreateOperatorAgent(TEST_PROJECT, TEST_SESSION, archonDir);
    const agentsPath = join(archonDir, 'projects', TEST_PROJECT, 'state', 'agents.json');
    const parsed = JSON.parse(readFileSync(agentsPath, 'utf-8')) as unknown[];
    expect(parsed).toHaveLength(1);
  });
});

describe('AgentContext — AGT-U4: different sessions produce different agent_ids', () => {
  it('session A and session B get distinct agent_ids in the same project', () => {
    const archonDir = makeTmpDir('u4');
    const sessionA = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    const sessionB = '01ARZ3NDEKTSV4RRFFQ69G5FBW';
    const agentA = loadOrCreateOperatorAgent(TEST_PROJECT, sessionA, archonDir);
    const agentB = loadOrCreateOperatorAgent(TEST_PROJECT, sessionB, archonDir);
    expect(agentA.agent_id).not.toBe(agentB.agent_id);
  });
});

describe('AgentContext — AGT-U5: different projects produce different agent_ids', () => {
  it('project A and project B get distinct agent_ids for the same session', () => {
    const archonDir = makeTmpDir('u5');
    const agentA = loadOrCreateOperatorAgent('project-alpha', TEST_SESSION, archonDir);
    const agentB = loadOrCreateOperatorAgent('project-beta',  TEST_SESSION, archonDir);
    expect(agentA.agent_id).not.toBe(agentB.agent_id);
  });
});

describe('AgentContext — AGT-U6: agents.json accumulates one record per unique session', () => {
  it('two sessions produce two records in the same project agents.json', () => {
    const archonDir = makeTmpDir('u6');
    const sessionA = '01ARZ3NDEKTSV4RRFFQ69G5FAV';
    const sessionB = '01ARZ3NDEKTSV4RRFFQ69G5FBW';
    loadOrCreateOperatorAgent(TEST_PROJECT, sessionA, archonDir);
    loadOrCreateOperatorAgent(TEST_PROJECT, sessionB, archonDir);
    const agentsPath = join(archonDir, 'projects', TEST_PROJECT, 'state', 'agents.json');
    const parsed = JSON.parse(readFileSync(agentsPath, 'utf-8')) as unknown[];
    expect(parsed).toHaveLength(2);
  });
});
