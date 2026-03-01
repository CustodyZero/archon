/**
 * Archon Runtime Host — ProjectRuntime
 *
 * P8: Concurrent Project Runtimes
 *
 * A ProjectRuntime encapsulates all runtime isolation state for a single
 * project. Each instance owns an exclusive StateIO, a project-bound log sink,
 * and a RuntimeContext whose project_id matches this runtime's projectId.
 *
 * Isolation invariants:
 *   - No shared mutable state between runtimes (StateIO instances are distinct)
 *   - No shared log sinks (each runtime writes only to its own project logs)
 *   - All emitted events carry the correct project_id from this runtime's ctx
 *   - ctx.project_id is validated against projectId at construction time
 *
 * Package dependency constraint:
 *   module-loader depends on runtime-host; runtime-host cannot import from
 *   module-loader. Registries (ModuleRegistry, CapabilityRegistry, etc.) are
 *   managed by module-loader callers that receive this runtime's stateIO.
 *   buildSnapshot() therefore takes governance state as parameters rather than
 *   holding registry references.
 *
 * @see docs/specs/architecture.md §P8 (concurrent project runtimes)
 * @see docs/specs/formal_governance.md §5 (governance invariants)
 */

import type {
  CompiledDRR,
  CapabilityType,
  LogSink,
  ModuleManifest,
  ResourceConfig,
  RuleSnapshot,
  RuleSnapshotHash,
} from '@archon/kernel';
import { EMPTY_RESOURCE_CONFIG, SnapshotBuilderImpl } from '@archon/kernel';
import type { StateIO } from '../state/state-io.js';
import { FileLogSink } from '../logging/file-log-sink.js';
import type { RuntimeContext } from '../context/event-envelope.js';
import { ARCHON_VERSION } from '../context/version.js';
import type { DriftStatus } from '../logging/drift-detector.js';
import { detectDrift } from '../logging/drift-detector.js';
import { readLog } from '../logging/log-reader.js';
import type { ExecutionRequest, ExecutionResult, ExecutionSurface } from './execution-surface.js';

// ---------------------------------------------------------------------------
// ProjectRuntime
// ---------------------------------------------------------------------------

/**
 * Encapsulates all runtime state for a single project.
 *
 * Constructed with a project-scoped StateIO and a matching RuntimeContext.
 * The StateIO must not be shared with any other ProjectRuntime; this is the
 * primary isolation mechanism for concurrent project runtimes.
 *
 * Registry instances (ModuleRegistry, CapabilityRegistry, RestrictionRegistry,
 * AckStore, ResourceConfigStore) are not held by ProjectRuntime — they are
 * constructed by module-loader callers using this.stateIO, which binds them
 * to this project's isolation boundary automatically.
 *
 * P8.1 — ExecutionSurface injection:
 *   An optional ExecutionSurface may be provided at construction time. When
 *   present, execute() delegates to it; the surface receives the runtime's
 *   own logSink on every call, guaranteeing all events carry the correct
 *   project_id. When absent, execute() throws explicitly (no silent no-op).
 */
export class ProjectRuntime {
  /**
   * The project-scoped StateIO for this runtime.
   *
   * Exposed so module-loader classes (ModuleRegistry, CapabilityRegistry,
   * RestrictionRegistry, AckStore, ResourceConfigStore, ProposalQueue) can be
   * constructed with this stateIO. Callers must not pass this reference to any
   * other ProjectRuntime.
   */
  readonly stateIO: StateIO;

  /**
   * The attribution context for this runtime.
   *
   * Guaranteed: ctx.project_id === this.projectId.
   */
  readonly ctx: RuntimeContext;

  /**
   * The log sink for this project.
   *
   * Writes decision log entries exclusively to this project's decisions.jsonl
   * via this runtime's stateIO. All emitted envelopes carry this.ctx attribution.
   */
  readonly logSink: LogSink;

  /** Injected execution surface (optional). See execute(). */
  private readonly executionSurface: ExecutionSurface | undefined;

  /**
   * Construct a ProjectRuntime.
   *
   * @param projectId        - The project this runtime governs. Immutable after creation.
   * @param ctx              - Attribution context. ctx.project_id MUST equal projectId.
   * @param stateIO          - Project-scoped I/O. Must not be shared with any other runtime.
   * @param executionSurface - Optional execution surface for execute() routing (P8.1).
   *
   * @throws {Error} If ctx.project_id does not match projectId (I4 invariant guard).
   */
  constructor(
    readonly projectId: string,
    ctx: RuntimeContext,
    stateIO: StateIO,
    executionSurface?: ExecutionSurface,
  ) {
    // Guard: ctx.project_id must equal projectId.
    // A mismatch would cause every emitted event to carry the wrong project
    // attribution, silently corrupting the governance audit log.
    if (ctx.project_id !== projectId) {
      throw new Error(
        `ProjectRuntime invariant violation: ctx.project_id '${ctx.project_id}' ` +
          `does not match projectId '${projectId}'. ` +
          `Build the RuntimeContext with project_id matching this runtime's projectId.`,
      );
    }

    this.ctx = ctx;
    this.stateIO = stateIO;
    this.logSink = new FileLogSink(stateIO, ctx);
    this.executionSurface = executionSurface;
  }

  /**
   * Build the current RuleSnapshot for this project.
   *
   * Takes governance state as parameters because ModuleRegistry, CapabilityRegistry,
   * RestrictionRegistry, AckStore, and ResourceConfigStore live in @archon/module-loader
   * (a reverse dependency — runtime-host cannot import from module-loader).
   *
   * Callers construct those registries with this.stateIO, call their state-query
   * methods, and pass the results here.
   *
   * @param enabledModules       - Manifests from ModuleRegistry.listEnabled()
   * @param enabledCapabilities  - Types from CapabilityRegistry.listEnabledCapabilities()
   * @param compiledDRRs         - Rules from RestrictionRegistry.compileAll()
   * @param ackEpoch             - T3 acknowledgment epoch from AckStore.getAckEpoch()
   * @param resourceConfig       - Config from ResourceConfigStore.getResourceConfig()
   * @returns Immutable snapshot and its SHA-256 hash
   */
  buildSnapshot(
    enabledModules: ReadonlyArray<ModuleManifest>,
    enabledCapabilities: ReadonlyArray<CapabilityType>,
    compiledDRRs: ReadonlyArray<CompiledDRR>,
    ackEpoch: number,
    resourceConfig: ResourceConfig = EMPTY_RESOURCE_CONFIG,
  ): { snapshot: RuleSnapshot; hash: RuleSnapshotHash } {
    const builder = new SnapshotBuilderImpl();
    const snapshot = builder.build(
      enabledModules,
      enabledCapabilities,
      compiledDRRs,
      ARCHON_VERSION,
      '',
      this.projectId,
      undefined,
      ackEpoch,
      resourceConfig,
    );
    return { snapshot, hash: builder.hash(snapshot) };
  }

  /**
   * Compute drift status from this project's logs.
   *
   * Reads decisions.jsonl and proposal-events.jsonl from this runtime's stateIO,
   * combines them, and runs the DriftDetector. Pure: no side effects on state.
   *
   * @returns DriftStatus reflecting only this project's logs.
   *          Other projects' logs are never inspected.
   */
  getDriftStatus(): DriftStatus {
    const decisionsRaw = this.stateIO.readLogRaw('decisions.jsonl');
    const proposalsRaw = this.stateIO.readLogRaw('proposal-events.jsonl');
    const combinedRaw = [decisionsRaw, proposalsRaw]
      .filter((s) => s.length > 0)
      .join('\n');
    return detectDrift(readLog(combinedRaw));
  }

  /**
   * Execute a structured action request through the injected ExecutionSurface.
   *
   * P8.1: The execution boundary is crossed here. ProjectRuntime passes its own
   * logSink to the surface on every call, guaranteeing that every emitted event
   * carries this runtime's ctx (and thus the correct project_id).
   *
   * The caller must pre-compute the snapshot and snapshotHash (e.g. via
   * buildSnapshotForProject() in @archon/module-loader) and include them in the
   * request. ProjectRuntime does not build the snapshot here because that would
   * require importing registry types from module-loader (circular dep).
   *
   * @param req - Structured execution request with pre-computed snapshot.
   * @returns The gate outcome, triggered rules, and optional handler output.
   *
   * @throws {Error} If no ExecutionSurface was injected at construction.
   */
  async execute(req: ExecutionRequest): Promise<ExecutionResult> {
    if (this.executionSurface === undefined) {
      throw new Error(
        `ProjectRuntime '${this.projectId}' has no ExecutionSurface. ` +
          `Inject one at construction via the fourth constructor parameter.`,
      );
    }
    // Pass this runtime's own logSink so the surface logs with the correct project_id.
    return this.executionSurface.execute(req, this.logSink);
  }

  /**
   * Shutdown this runtime.
   *
   * Lifecycle hook for future async resource cleanup (flushing writes,
   * closing handles). Currently a no-op — returns immediately. Callers
   * should await this before discarding the runtime reference.
   */
  async shutdown(): Promise<void> {
    // No async resources in the current implementation.
  }
}
