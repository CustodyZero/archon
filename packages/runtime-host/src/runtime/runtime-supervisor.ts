/**
 * Archon Runtime Host — RuntimeSupervisor
 *
 * P8: Concurrent Project Runtimes
 *
 * RuntimeSupervisor manages a map of ProjectRuntime instances keyed by
 * project_id. It enforces the P8 isolation invariant: no two project runtimes
 * share any internal object references.
 *
 * Responsibilities:
 *   - Create and register ProjectRuntime instances (one per project_id)
 *   - Route commands to the correct runtime by project_id
 *   - Manage the lifecycle of each runtime (create, shutdown, remove)
 *   - Enforce isolation: each runtime gets its own StateIO and RuntimeContext
 *
 * Isolation enforcement:
 *   - Callers must supply a fresh StateIO per runtime (not reused across calls)
 *   - The supervisor never passes a runtime's StateIO or ctx to another runtime
 *   - listActiveRuntimes() returns project IDs only — no runtime references leak
 *   - Shutting down runtime A has no effect on runtime B (INV-U7)
 *
 * @see docs/specs/architecture.md §P8 (concurrent project runtimes)
 * @see docs/specs/formal_governance.md §5 (governance invariants)
 */

import type { StateIO } from '../state/state-io.js';
import type { RuntimeContext } from '../context/event-envelope.js';
import { ProjectRuntime } from './project-runtime.js';
import type { ExecutionSurface } from './execution-surface.js';

// ---------------------------------------------------------------------------
// RuntimeSupervisor
// ---------------------------------------------------------------------------

/**
 * Manages concurrent project runtimes within a single Archon process.
 *
 * Each ProjectRuntime is keyed by its project_id. The supervisor enforces
 * that no runtime is created twice for the same project without first
 * shutting down the existing one.
 */
export class RuntimeSupervisor {
  private readonly runtimes: Map<string, ProjectRuntime> = new Map();

  /**
   * Create a new ProjectRuntime for the given project.
   *
   * The provided StateIO must be a fresh instance scoped exclusively to this
   * project. Sharing a StateIO across runtimes violates the isolation invariant
   * and must not be done by callers.
   *
   * @param projectId - The project to create a runtime for. Must be unique.
   * @param ctx       - Attribution context. ctx.project_id must equal projectId.
   * @param stateIO   - Fresh, project-scoped I/O. Must not be reused across runtimes.
   * @returns The newly created and registered ProjectRuntime.
   *
   * @throws {Error} If a runtime for this projectId already exists.
   *                 Call shutdownProjectRuntime() before replacing a runtime.
   * @throws {Error} If ctx.project_id does not match projectId.
   */
  createProjectRuntime(
    projectId: string,
    ctx: RuntimeContext,
    stateIO: StateIO,
  ): ProjectRuntime {
    if (this.runtimes.has(projectId)) {
      throw new Error(
        `ProjectRuntime for project '${projectId}' already exists. ` +
          `Call shutdownProjectRuntime('${projectId}') before creating a replacement.`,
      );
    }
    const runtime = new ProjectRuntime(projectId, ctx, stateIO);
    this.runtimes.set(projectId, runtime);
    return runtime;
  }

  /**
   * Retrieve an existing ProjectRuntime by project ID.
   *
   * Returns undefined if no runtime has been created for this project.
   * Does not throw — callers are responsible for checking the return value.
   *
   * @param projectId - The project to look up
   * @returns The ProjectRuntime if active, undefined if not created.
   */
  getProjectRuntime(projectId: string): ProjectRuntime | undefined {
    return this.runtimes.get(projectId);
  }

  /**
   * Shutdown a project runtime and remove it from the supervisor.
   *
   * Calls runtime.shutdown() to allow async resource cleanup, then removes
   * the entry from the internal map. Other runtimes are not affected (INV-U7).
   *
   * No-op if no runtime exists for the given projectId.
   *
   * @param projectId - The project runtime to shut down
   */
  async shutdownProjectRuntime(projectId: string): Promise<void> {
    const runtime = this.runtimes.get(projectId);
    if (runtime === undefined) {
      return;
    }
    await runtime.shutdown();
    this.runtimes.delete(projectId);
  }

  /**
   * Get an existing runtime or create a new one for the given project.
   *
   * P8.1: This is the preferred entry point for CLI and Desktop paths.
   * It replaces the pattern of calling createProjectRuntime() defensively.
   *
   * If a runtime already exists for projectId:
   *   - Returns it immediately (ctxProvider and stateIOProvider are NOT called).
   *   - executionSurface parameter is ignored (runtime is already constructed).
   *
   * If no runtime exists for projectId:
   *   - Calls ctxProvider() and stateIOProvider() to obtain the context and I/O.
   *   - Constructs and registers a new ProjectRuntime.
   *   - Returns the new runtime.
   *
   * Using provider functions (not values) ensures that expensive operations
   * (reading device/user/session state, opening state directories) are only
   * executed when a new runtime is actually needed.
   *
   * @param projectId        - The project to get or create a runtime for.
   * @param ctxProvider      - Factory for the RuntimeContext (lazy; called only on creation).
   * @param stateIOProvider  - Factory for the project-scoped StateIO (lazy; called only on creation).
   * @param executionSurface - Optional ExecutionSurface to inject (only used on creation).
   *
   * @throws {Error} If ctx.project_id from ctxProvider does not match projectId.
   */
  getOrCreate(
    projectId: string,
    ctxProvider: () => RuntimeContext,
    stateIOProvider: () => StateIO,
    executionSurface?: ExecutionSurface,
  ): ProjectRuntime {
    const existing = this.runtimes.get(projectId);
    if (existing !== undefined) {
      return existing;
    }
    const runtime = new ProjectRuntime(projectId, ctxProvider(), stateIOProvider(), executionSurface);
    this.runtimes.set(projectId, runtime);
    return runtime;
  }

  /**
   * List the project IDs of all currently active runtimes.
   *
   * Returns project IDs in creation order. Exposes only project IDs,
   * not runtime references, to prevent cross-runtime reference leakage.
   *
   * @returns Immutable array of active project IDs.
   */
  listActiveRuntimes(): ReadonlyArray<string> {
    return [...this.runtimes.keys()];
  }
}
