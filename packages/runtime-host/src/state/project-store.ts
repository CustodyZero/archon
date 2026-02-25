/**
 * Archon Runtime Host — Project Store
 *
 * Project is the governance isolation boundary in Archon (P4: Project Scoping).
 * Each project has its own state and log directories, so enabling a module or
 * capability in project A has no effect on project B.
 *
 * State layout:
 *   <archonDir>/projects/index.json              — project registry + active project ID
 *   <archonDir>/projects/<id>/metadata.json      — project record (id, name, createdAt)
 *   <archonDir>/projects/<id>/state/             — per-project JSON state files
 *   <archonDir>/projects/<id>/logs/              — per-project JSONL log files
 *
 * Single active project invariant (pre-v0.1):
 *   Only one project is active at a time. `index.json` stores `activeProjectId`.
 *   All CLI and desktop operations target the active project.
 *
 * Migration (legacy state → default project):
 *   If `<archonDir>/state/` or `<archonDir>/logs/` exist without a project index,
 *   `migrateLegacyState()` creates a 'default' project and copies the state there.
 *   Migration is idempotent: if the index already exists, it is a safe no-op.
 *
 * @see docs/specs/architecture.md §P4 (project scoping)
 * @see docs/specs/formal_governance.md §5 (I1, I4)
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { FileStateIO } from './state-io.js';

// ---------------------------------------------------------------------------
// Project record types
// ---------------------------------------------------------------------------

/**
 * A single project record.
 *
 * Stored as metadata.json within the project directory and listed in index.json.
 */
export interface ProjectRecord {
  /** UUIDv4 stable identifier. Immutable after creation. */
  readonly id: string;
  /** Human-readable name chosen at creation time (e.g. 'my-agent-project'). */
  readonly name: string;
  /** ISO 8601 creation timestamp. */
  readonly createdAt: string;
}

/**
 * The project registry persisted at `<archonDir>/projects/index.json`.
 *
 * Lists all registered projects and the currently active project.
 * `activeProjectId` MUST be the id of a project in `projects`, or null
 * if no project is active (empty installation before first `project create`).
 */
export interface ProjectIndex {
  /** The ID of the currently active project, or null if none. */
  readonly activeProjectId: string | null;
  /** All registered project records, in creation order. */
  readonly projects: ReadonlyArray<ProjectRecord>;
}

// ---------------------------------------------------------------------------
// Base directory
// ---------------------------------------------------------------------------

/**
 * Returns the archon base directory.
 *
 * Reads ARCHON_STATE_DIR from the environment. If unset, defaults to
 * `.archon/` relative to process.cwd(). This is consistent with the
 * legacy store.ts behavior.
 *
 * The project index and all project directories live under this directory.
 */
export function getArchonDir(): string {
  return process.env['ARCHON_STATE_DIR'] ?? join(process.cwd(), '.archon');
}

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

/** Returns the path to the project registry index file. */
export function projectIndexPath(archonDir: string): string {
  return join(archonDir, 'projects', 'index.json');
}

/** Returns the directory path for a specific project. */
export function projectDir(projectId: string, archonDir: string): string {
  return join(archonDir, 'projects', projectId);
}

/**
 * Construct a FileStateIO for a specific project.
 *
 * This is the authorized factory for project-scoped StateIO instances.
 * All registries and stateful classes in the module-loader receive a
 * StateIO produced by this function (or MemoryStateIO for tests).
 *
 * @param projectId - The project whose directory to scope I/O to
 * @param archonDir - The archon base directory (defaults to getArchonDir())
 */
export function projectStateIO(
  projectId: string,
  archonDir: string = getArchonDir(),
): FileStateIO {
  return new FileStateIO(projectDir(projectId, archonDir));
}

// ---------------------------------------------------------------------------
// Index read/write (internal)
// ---------------------------------------------------------------------------

function readProjectIndex(archonDir: string): ProjectIndex {
  const idxPath = projectIndexPath(archonDir);
  try {
    const raw = readFileSync(idxPath, 'utf-8');
    return JSON.parse(raw) as ProjectIndex;
  } catch (err: unknown) {
    if (isNodeError(err, 'ENOENT') || err instanceof SyntaxError) {
      return { activeProjectId: null, projects: [] };
    }
    throw err;
  }
}

function writeProjectIndex(archonDir: string, index: ProjectIndex): void {
  const projectsDir = join(archonDir, 'projects');
  mkdirSync(projectsDir, { recursive: true });
  writeFileSync(projectIndexPath(archonDir), JSON.stringify(index, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a new project with the given name.
 *
 * - Generates a UUIDv4 id
 * - Writes `metadata.json` to `<archonDir>/projects/<id>/`
 * - Registers the project in `index.json`
 * - If no active project, sets this project as active
 *
 * @param name - Human-readable project name (e.g. 'my-agent-project')
 * @param archonDir - Archon base directory (defaults to getArchonDir())
 * @returns The created ProjectRecord
 */
export function createProject(
  name: string,
  archonDir: string = getArchonDir(),
): ProjectRecord {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const record: ProjectRecord = { id, name, createdAt };

  // Write metadata.json for this project.
  const pDir = projectDir(id, archonDir);
  mkdirSync(pDir, { recursive: true });
  writeFileSync(join(pDir, 'metadata.json'), JSON.stringify(record, null, 2), 'utf-8');

  // Register in index; set as active if no active project yet.
  const index = readProjectIndex(archonDir);
  const newIndex: ProjectIndex = {
    activeProjectId: index.activeProjectId ?? id,
    projects: [...index.projects, record],
  };
  writeProjectIndex(archonDir, newIndex);

  return record;
}

/**
 * List all registered projects.
 *
 * Returns an empty array if no projects have been created.
 *
 * @param archonDir - Archon base directory (defaults to getArchonDir())
 */
export function listProjects(
  archonDir: string = getArchonDir(),
): ReadonlyArray<ProjectRecord> {
  return readProjectIndex(archonDir).projects;
}

/**
 * Get the active project record.
 *
 * Returns null if no project is active (empty installation without any projects).
 *
 * @param archonDir - Archon base directory (defaults to getArchonDir())
 */
export function getActiveProject(
  archonDir: string = getArchonDir(),
): ProjectRecord | null {
  const index = readProjectIndex(archonDir);
  if (index.activeProjectId === null) return null;
  return index.projects.find((p) => p.id === index.activeProjectId) ?? null;
}

/**
 * Get the active project ID.
 *
 * Returns null if no project is active.
 *
 * @param archonDir - Archon base directory (defaults to getArchonDir())
 */
export function getActiveProjectId(
  archonDir: string = getArchonDir(),
): string | null {
  return readProjectIndex(archonDir).activeProjectId;
}

/**
 * Select a project as the active project.
 *
 * Updates `activeProjectId` in the project index.
 * The project must already exist in the index.
 *
 * @param id - The project ID to activate
 * @param archonDir - Archon base directory (defaults to getArchonDir())
 * @throws {Error} If the project ID is not registered in the index
 */
export function selectProject(id: string, archonDir: string = getArchonDir()): void {
  const index = readProjectIndex(archonDir);
  const exists = index.projects.some((p) => p.id === id);
  if (!exists) {
    throw new Error(
      `Project not found: ${id}. Use 'archon project list' to see available projects.`,
    );
  }
  writeProjectIndex(archonDir, { ...index, activeProjectId: id });
}

/**
 * Get or create a project named 'default'.
 *
 * Used during first-run setup and legacy state migration. Returns an existing
 * 'default' project if one exists. Otherwise creates a new one.
 *
 * @param archonDir - Archon base directory (defaults to getArchonDir())
 */
export function getOrCreateDefaultProject(
  archonDir: string = getArchonDir(),
): ProjectRecord {
  const index = readProjectIndex(archonDir);
  const existing = index.projects.find((p) => p.name === 'default');
  if (existing !== undefined) return existing;
  return createProject('default', archonDir);
}

/**
 * Migrate legacy global state to the 'default' project.
 *
 * Legacy state layout (pre-P4):
 *   `<archonDir>/state/`  — JSON state files
 *   `<archonDir>/logs/`   — JSONL log files
 *
 * Migration steps:
 *   1. If `<archonDir>/projects/index.json` already exists → no-op (already migrated)
 *   2. Create the 'default' project
 *   3. Copy `state/` and `logs/` into `<archonDir>/projects/<defaultId>/`
 *   4. Write project index with the default project active
 *
 * This is idempotent: calling it when already migrated (index.json exists) is safe.
 * The legacy state/ and logs/ directories are NOT deleted — they remain in place
 * as backup. Operators may remove them manually after verifying migration.
 *
 * @param archonDir - Archon base directory (defaults to getArchonDir())
 */
export function migrateLegacyState(archonDir: string = getArchonDir()): void {
  const idxPath = projectIndexPath(archonDir);

  // Idempotency guard: if the project index already exists, migration is done.
  if (existsSync(idxPath)) return;

  const defaultProject = getOrCreateDefaultProject(archonDir);
  const pDir = projectDir(defaultProject.id, archonDir);

  // Copy legacy state/ directory if it exists.
  const legacyState = join(archonDir, 'state');
  if (existsSync(legacyState)) {
    const destState = join(pDir, 'state');
    mkdirSync(destState, { recursive: true });
    cpSync(legacyState, destState, { recursive: true });
  }

  // Copy legacy logs/ directory if it exists.
  const legacyLogs = join(archonDir, 'logs');
  if (existsSync(legacyLogs)) {
    const destLogs = join(pDir, 'logs');
    mkdirSync(destLogs, { recursive: true });
    cpSync(legacyLogs, destLogs, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isNodeError(err: unknown, code: string): boolean {
  return (
    err !== null &&
    typeof err === 'object' &&
    'code' in err &&
    (err as NodeJS.ErrnoException).code === code
  );
}
