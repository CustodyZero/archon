/**
 * Archon Desktop — Main Process
 *
 * Electron main process entry point for the Archon operator dashboard.
 *
 * Architecture note:
 * The kernel runs in the main process. The UI communicates via IPC only.
 * The renderer cannot bypass the kernel. All capability validation occurs
 * in the main process before any action reaches execution.
 *
 * This enforces the same gate architecture as the CLI:
 * agent proposes → kernel evaluates → gate enforces → renderer reflects result.
 *
 * Security settings:
 * - nodeIntegration: false — renderer cannot access Node.js APIs directly
 * - contextIsolation: true — renderer context is isolated from main context
 * - sandbox: true — renderer is sandboxed (web content cannot escape to OS)
 *
 * P4 (Project Scoping): buildRuntime() resolves the active project and creates
 * a project-scoped StateIO. All registries and AckStore are bound to that
 * project. The project_id is incorporated into every RuleSnapshot so RS_hash
 * is project-specific.
 *
 * @see docs/specs/architecture.md §4 (validation flow)
 * @see docs/specs/module_api.md §6 (kernel adapters — all side effects via kernel)
 * @see docs/specs/authority_and_composition_spec.md §P4 (Project Scoping)
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CapabilityType,
  RiskTier,
  TYPED_ACK_REQUIRED_TIERS,
} from '@archon/kernel';
import type { ProposalStatus, ProposalChange } from '@archon/kernel';
import {
  ModuleRegistry,
  CapabilityRegistry,
  RestrictionRegistry,
  ProposalQueue,
  AckStore,
  ResourceConfigStore,
  buildSnapshotForProject,
} from '@archon/module-loader';
import type { StateIO, DriftStatus, PortabilityStatus, RuntimeContext, SessionContext, DeviceContext, UserContext, ProjectRuntime } from '@archon/runtime-host';
import {
  RuntimeSupervisor,
  getArchonDir,
  getOrCreateDefaultProject,
  projectStateIO,
  SecretStore,
  getPortabilityStatus,
  detectDrift,
  readLog,
  createProject,
  listProjects,
  getActiveProject,
  selectProject,
  ARCHON_VERSION,
  loadOrCreateDevice,
  loadOrCreateUser,
  createSession,
  endSession,
  loadOrCreateOperatorAgent,
} from '@archon/runtime-host';
import { FILESYSTEM_MANIFEST } from '@archon/module-filesystem';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// ---------------------------------------------------------------------------
// Runtime context builders (desktop local copy)
// ---------------------------------------------------------------------------

/**
 * P7.5 / ACM-001 / P8.1: Stable device and user context for this desktop session.
 * Loaded once in app.whenReady(). Used by buildProjectCtx() to compose per-project
 * RuntimeContexts — one per active projectId, not pinned to the initial project.
 * Module-level variables ensure one device/user context per process lifetime.
 */
let archonDevice: DeviceContext | undefined;
let archonUser: UserContext | undefined;

/** P7.5: session reference for clean shutdown (app.on('will-quit')). */
let archonSession: SessionContext | undefined;

/**
 * P8.1: Process-level RuntimeSupervisor for the desktop main process.
 *
 * Manages one ProjectRuntime per active project. IPC handlers resolve
 * the runtime via supervisor.getOrCreate(), ensuring the ProjectRuntime
 * (and its stateIO) is created once per project per process lifetime.
 * Registry instances are still constructed per IPC call (lightweight).
 *
 * Initialized in app.whenReady() before any IPC handler executes.
 */
let archonSupervisor: RuntimeSupervisor | undefined;

/** Returns the process-level supervisor, throwing if called before initialization. */
function requireSupervisor(): RuntimeSupervisor {
  if (archonSupervisor === undefined) {
    throw new Error('RuntimeSupervisor not initialized. IPC handler called before app.whenReady().');
  }
  return archonSupervisor;
}

/**
 * Build the first-party module registry, capability registry, restriction
 * registry, ack store, and state IO for the active project.
 *
 * P8.1: Gets or creates the ProjectRuntime for the active project via the
 * process-level supervisor, then constructs registries using the runtime's
 * project-scoped stateIO. The stateIO is reused across IPC calls for the
 * same project; registries are constructed per call (stateless readers).
 *
 * P4: Resolves the active project (or creates 'default' on first run).
 * All registry state is scoped to the active project's directory.
 */
function buildRuntime(): {
  registry: ModuleRegistry;
  capabilityRegistry: CapabilityRegistry;
  restrictionRegistry: RestrictionRegistry;
  ackStore: AckStore;
  resourceConfigStore: ResourceConfigStore;
  stateIO: StateIO;
  projectId: string;
  runtime: ProjectRuntime;
} {
  const supervisor = requireSupervisor();
  const archonDir = getArchonDir();
  const project = getOrCreateDefaultProject(archonDir);

  // P8.1: Get or create the runtime for this project.
  // ctxProvider is lazy — only called if the runtime does not yet exist.
  // Since app.whenReady() already creates the initial runtime, this is
  // typically a fast path that returns the existing runtime.
  const runtime = supervisor.getOrCreate(
    project.id,
    () => buildProjectCtx(project.id),
    () => projectStateIO(project.id, archonDir),
  );

  const { stateIO } = runtime;
  const registry = new ModuleRegistry(stateIO);
  registry.register(FILESYSTEM_MANIFEST);
  registry.applyPersistedState();

  const capabilityRegistry = new CapabilityRegistry(registry, stateIO);
  const restrictionRegistry = new RestrictionRegistry(stateIO);
  const ackStore = new AckStore(stateIO);
  // P5: Resource configuration store for per-project resource scoping.
  const resourceConfigStore = new ResourceConfigStore(stateIO);

  return { registry, capabilityRegistry, restrictionRegistry, ackStore, resourceConfigStore, stateIO, projectId: project.id, runtime };
}

/**
 * Build the active RuleSnapshot hash from current runtime state.
 *
 * P8.1: Delegates to buildSnapshotForProject() (single authoritative call site).
 * Incorporates ackEpoch so RS_hash changes after T3 acknowledgments (I4, I5).
 * Incorporates projectId so RS_hash is project-specific (P4).
 */
function buildSnapshotHash(
  registry: ModuleRegistry,
  capabilityRegistry: CapabilityRegistry,
  restrictionRegistry: RestrictionRegistry,
  ackStore: AckStore,
  projectId: string,
  resourceConfigStore?: ResourceConfigStore,
): string {
  const { hash } = buildSnapshotForProject({
    projectId,
    registry,
    capabilityRegistry,
    restrictionRegistry,
    ackStore,
    ...(resourceConfigStore !== undefined ? { resourceConfigStore } : {}),
  });
  return hash;
}

// ---------------------------------------------------------------------------
// Window Creation
// ---------------------------------------------------------------------------

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Archon',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: 12, y: 10 },
    webPreferences: {
      // SECURITY: nodeIntegration off — renderer cannot access Node.js APIs
      nodeIntegration: false,
      // SECURITY: contextIsolation on — renderer context isolated from main
      contextIsolation: true,
      // SECURITY: sandbox on — renderer is fully sandboxed
      // The preload is compiled as CommonJS (tsconfig.preload.json) so Electron can
      // require() it in sandboxed mode. ESM preloads are not supported with sandbox: true.
      sandbox: true,
      // Preload script provides the restricted IPC bridge to the renderer
      preload: join(__dirname, '../preload/index.js'),
    },
  });

  // In dev mode VITE_DEV_SERVER_URL is set by the dev script.
  // Electron loads from the Vite HMR server so renderer changes are instant.
  // In production, load from the built dist.
  const devUrl = process.env['VITE_DEV_SERVER_URL'];
  if (devUrl !== undefined && devUrl !== '') {
    void win.loadURL(devUrl);
    win.webContents.openDevTools();
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// ---------------------------------------------------------------------------
// IPC Handlers — Kernel Operations
//
// All kernel operations are exposed to the renderer via IPC channels.
// The renderer calls ipcRenderer.invoke(channel, ...args).
// The main process validates, calls the kernel, and returns the result.
// The renderer cannot call kernel logic directly.
// ---------------------------------------------------------------------------

/**
 * Build a per-project RuntimeContext for the given projectId.
 *
 * P8.1: Replaces the single pinned archonCtx. Device, user, and session fields
 * are stable for the process lifetime; project_id and agent_id vary per project.
 * loadOrCreateOperatorAgent() is idempotent for the same (project, session) pair,
 * so repeated calls for the same projectId return the same context values.
 *
 * Called lazily via the ctxProvider in buildRuntime() — only invoked when a new
 * ProjectRuntime is first created for a given projectId.
 *
 * @throws {Error} If called before app.whenReady() has completed initialization.
 */
function buildProjectCtx(projectId: string): RuntimeContext {
  if (archonDevice === undefined || archonUser === undefined || archonSession === undefined) {
    throw new Error('buildProjectCtx called before app initialization.');
  }
  const archonDir = getArchonDir();
  const agent = loadOrCreateOperatorAgent(projectId, archonSession.session_id, archonDir);
  return {
    device_id: archonDevice.device_id,
    user_id: archonUser.user_id,
    session_id: archonSession.session_id,
    project_id: projectId,
    agent_id: agent.agent_id,
    archon_version: ARCHON_VERSION,
  };
}

function registerIpcHandlers(): void {
  // Stub handler to confirm IPC wiring works.
  ipcMain.handle('kernel:ping', () => {
    return { ok: true, message: 'Archon kernel main process' };
  });

  // -------------------------------------------------------------------------
  // Proposal Queue IPC handlers
  // -------------------------------------------------------------------------

  /**
   * List proposals, optionally filtered by status.
   * Returns ProposalSummary[].
   */
  ipcMain.handle(
    'kernel:proposals:list',
    (_event, filter?: { status?: ProposalStatus }) => {
      const { registry, capabilityRegistry, restrictionRegistry, ackStore, stateIO, projectId, resourceConfigStore, runtime } =
        buildRuntime();
      const queue = new ProposalQueue(
        registry,
        capabilityRegistry,
        restrictionRegistry,
        () => buildSnapshotHash(registry, capabilityRegistry, restrictionRegistry, ackStore, projectId, resourceConfigStore),
        stateIO,
        ackStore,
        runtime.ctx,
        resourceConfigStore,
      );
      return queue.listProposals(filter);
    },
  );

  /**
   * Get a full Proposal by ID.
   * Returns Proposal | null.
   */
  ipcMain.handle('kernel:proposals:get', (_event, id: string) => {
    const { registry, capabilityRegistry, restrictionRegistry, ackStore, stateIO, projectId, resourceConfigStore, runtime } =
      buildRuntime();
    const queue = new ProposalQueue(
      registry,
      capabilityRegistry,
      restrictionRegistry,
      () => buildSnapshotHash(registry, capabilityRegistry, restrictionRegistry, ackStore, projectId, resourceConfigStore),
      stateIO,
      ackStore,
      runtime.ctx,
      resourceConfigStore,
    );
    return queue.getProposal(id) ?? null;
  });

  /**
   * Approve and apply a pending proposal.
   * Returns ApproveResult.
   */
  ipcMain.handle(
    'kernel:proposals:approve',
    (
      _event,
      id: string,
      opts: {
        typedAckPhrase?: string;
        hazardConfirmedPairs?: ReadonlyArray<readonly [string, string]>;
      },
    ) => {
      const { registry, capabilityRegistry, restrictionRegistry, ackStore, stateIO, projectId, resourceConfigStore, runtime } =
        buildRuntime();
      const queue = new ProposalQueue(
        registry,
        capabilityRegistry,
        restrictionRegistry,
        () => buildSnapshotHash(registry, capabilityRegistry, restrictionRegistry, ackStore, projectId, resourceConfigStore),
        stateIO,
        ackStore,
        runtime.ctx,
        resourceConfigStore,
      );
      const hazardConfirmedPairs = (opts.hazardConfirmedPairs ?? []).map(
        ([a, b]) => [a as CapabilityType, b as CapabilityType] as const,
      );
      return queue.approveProposal(
        id,
        {
          ...(opts.typedAckPhrase !== undefined ? { typedAckPhrase: opts.typedAckPhrase } : {}),
          hazardConfirmedPairs,
        },
        { kind: 'ui', id: 'desktop-operator' },
      );
    },
  );

  /**
   * Reject a pending proposal.
   * Returns true on success, false if not found or not pending.
   */
  ipcMain.handle(
    'kernel:proposals:reject',
    (_event, id: string, reason?: string) => {
      const { registry, capabilityRegistry, restrictionRegistry, ackStore, stateIO, projectId, resourceConfigStore, runtime } =
        buildRuntime();
      const queue = new ProposalQueue(
        registry,
        capabilityRegistry,
        restrictionRegistry,
        () => buildSnapshotHash(registry, capabilityRegistry, restrictionRegistry, ackStore, projectId, resourceConfigStore),
        stateIO,
        ackStore,
        runtime.ctx,
        resourceConfigStore,
      );
      const result = queue.rejectProposal(id, { kind: 'ui', id: 'desktop-operator' }, reason);
      return result !== undefined;
    },
  );

  // -------------------------------------------------------------------------
  // P6: Drift and Portability IPC handlers
  // -------------------------------------------------------------------------

  /**
   * Compute drift status from the active project's log files.
   * Reads decisions.jsonl and proposal-events.jsonl, combines them, and
   * runs the DriftDetector. Returns DriftStatus.
   */
  ipcMain.handle('kernel:drift:status', (): DriftStatus => {
    const { stateIO } = buildRuntime();
    const decisionsRaw = stateIO.readLogRaw('decisions.jsonl');
    const proposalsRaw = stateIO.readLogRaw('proposal-events.jsonl');
    // Safe to concatenate: all event_id values are ULIDs (globally unique per ulid.ts),
    // so deduplication collisions across the two log files are not possible.
    const combinedRaw = [decisionsRaw, proposalsRaw].filter((s) => s.length > 0).join('\n');
    return detectDrift(readLog(combinedRaw));
  });

  /**
   * Compute portability status for the active project.
   * Reads secrets mode from SecretStore and archon home path. Returns PortabilityStatus.
   */
  ipcMain.handle('kernel:portability:status', (): PortabilityStatus => {
    const archonDir = getArchonDir();
    const { stateIO } = buildRuntime();
    const store = new SecretStore(stateIO, join(archonDir, 'device.key'));
    const secretsMode = store.listKeys().length === 0 ? null : store.getMode();
    return getPortabilityStatus({ secretsMode, archonHomePath: archonDir });
  });

  // -------------------------------------------------------------------------
  // Capability tier map — derived from the canonical taxonomy in restriction-dsl
  // @see packages/restriction-dsl/src/types.ts (CapabilityType JSDoc annotations)
  // -------------------------------------------------------------------------
  const CAPABILITY_TIER_MAP: Readonly<Record<CapabilityType, RiskTier>> = {
    [CapabilityType.AgentSpawn]: RiskTier.T2,
    [CapabilityType.AgentMessageSend]: RiskTier.T1,
    [CapabilityType.AgentDelegationGrant]: RiskTier.T2,
    [CapabilityType.AgentDelegationRevoke]: RiskTier.T1,
    [CapabilityType.AgentTerminate]: RiskTier.T2,
    [CapabilityType.FsRead]: RiskTier.T1,
    [CapabilityType.FsList]: RiskTier.T1,
    [CapabilityType.FsWrite]: RiskTier.T2,
    [CapabilityType.FsDelete]: RiskTier.T3,
    [CapabilityType.ExecRun]: RiskTier.T3,
    [CapabilityType.NetFetchHttp]: RiskTier.T1,
    [CapabilityType.NetEgressRaw]: RiskTier.T3,
    [CapabilityType.SecretsRead]: RiskTier.T2,
    [CapabilityType.SecretsUse]: RiskTier.T3,
    [CapabilityType.SecretsInjectEnv]: RiskTier.T3,
    [CapabilityType.UiRequestApproval]: RiskTier.T0,
    [CapabilityType.UiPresentRiskAck]: RiskTier.T0,
    [CapabilityType.UiRequestClarification]: RiskTier.T0,
    [CapabilityType.LlmInfer]: RiskTier.T1,
  };

  // -------------------------------------------------------------------------
  // Kernel status IPC handler
  // -------------------------------------------------------------------------

  /**
   * Return a snapshot of current kernel state: RS_hash, engine version,
   * ack epoch, and counts of enabled modules/capabilities/restrictions.
   */
  ipcMain.handle('kernel:status', () => {
    const { registry, capabilityRegistry, restrictionRegistry, ackStore, projectId, resourceConfigStore } =
      buildRuntime();
    const rsHash = buildSnapshotHash(
      registry, capabilityRegistry, restrictionRegistry, ackStore, projectId, resourceConfigStore,
    );
    return {
      rsHash,
      engineVersion: ARCHON_VERSION,
      ackEpoch: ackStore.getAckEpoch(),
      moduleCount: registry.listEnabled().length,
      capabilityCount: capabilityRegistry.listEnabledCapabilities().length,
      restrictionCount: restrictionRegistry.listRules().length,
    };
  });

  // -------------------------------------------------------------------------
  // Module registry IPC handlers
  // -------------------------------------------------------------------------

  /**
   * List all registered modules with their enabled/disabled status.
   * Returns an array of module summaries.
   */
  ipcMain.handle('kernel:modules:list', () => {
    const { registry } = buildRuntime();
    return registry.list().map((m) => ({
      module_id: m.module_id,
      module_name: m.module_name,
      version: m.version,
      description: m.description,
      status: registry.getStatus(m.module_id) ?? 'Disabled',
    }));
  });

  // -------------------------------------------------------------------------
  // Capability registry IPC handlers
  // -------------------------------------------------------------------------

  /**
   * List all 19 capability types with their tier, enabled status, and
   * whether a typed acknowledgment is required for enablement.
   */
  ipcMain.handle('kernel:capabilities:list', () => {
    const { capabilityRegistry } = buildRuntime();
    const enabled = new Set(capabilityRegistry.listEnabledCapabilities());
    return Object.values(CapabilityType).map((type) => {
      const tier = CAPABILITY_TIER_MAP[type];
      return {
        type,
        tier,
        enabled: enabled.has(type),
        ackRequired: TYPED_ACK_REQUIRED_TIERS.has(tier),
      };
    });
  });

  // -------------------------------------------------------------------------
  // Restriction registry IPC handlers
  // -------------------------------------------------------------------------

  /**
   * List all active Dynamic Restriction Rules.
   * Returns StructuredRestrictionRule[] (compiled from persisted DSL).
   */
  ipcMain.handle('kernel:restrictions:list', () => {
    const { restrictionRegistry } = buildRuntime();
    return restrictionRegistry.listRules();
  });

  // -------------------------------------------------------------------------
  // Project management IPC handlers
  // -------------------------------------------------------------------------

  /**
   * List all projects in the archon state directory.
   * Returns ProjectRecord[].
   */
  ipcMain.handle('kernel:projects:list', () => {
    const archonDir = getArchonDir();
    return listProjects(archonDir);
  });

  /**
   * Get the currently active project.
   * Returns ProjectRecord | null if no active project.
   */
  ipcMain.handle('kernel:projects:current', () => {
    const archonDir = getArchonDir();
    return getActiveProject(archonDir) ?? null;
  });

  /**
   * Create a new project with the given name.
   * Returns the new ProjectRecord.
   */
  ipcMain.handle('kernel:projects:create', (_event, name: string) => {
    const archonDir = getArchonDir();
    return createProject(name, archonDir);
  });

  /**
   * Select (activate) a project by ID.
   * Returns void on success; throws if the project does not exist.
   */
  ipcMain.handle('kernel:projects:select', (_event, id: string) => {
    const archonDir = getArchonDir();
    selectProject(id, archonDir);
  });

  // -------------------------------------------------------------------------
  // Proposal propose IPC handler
  // -------------------------------------------------------------------------

  /**
   * Submit a new proposal for operator review.
   * Agents and UI components use this to propose governance changes.
   * Returns the newly created Proposal.
   */
  ipcMain.handle(
    'kernel:proposals:propose',
    (
      _event,
      change: ProposalChange,
      createdBy: { kind: 'human' | 'agent' | 'cli' | 'ui'; id: string },
    ) => {
      const { registry, capabilityRegistry, restrictionRegistry, ackStore, stateIO, projectId, resourceConfigStore, runtime } =
        buildRuntime();
      const queue = new ProposalQueue(
        registry,
        capabilityRegistry,
        restrictionRegistry,
        () => buildSnapshotHash(registry, capabilityRegistry, restrictionRegistry, ackStore, projectId, resourceConfigStore),
        stateIO,
        ackStore,
        runtime.ctx,
        resourceConfigStore,
      );
      return queue.propose(change, createdBy);
    },
  );
}

// ---------------------------------------------------------------------------
// App Lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  // P7.5 / ACM-001: Load stable device and user context; create a new session
  // for this desktop app lifetime. Context is loaded once here — not per IPC call.
  const archonDir = getArchonDir();
  const device = loadOrCreateDevice(archonDir);
  const user = loadOrCreateUser(archonDir);
  const session = createSession(device, user);
  archonSession = session;

  // P8.1: Store stable context components for use in buildProjectCtx().
  // Each project gets its own RuntimeContext via buildProjectCtx(projectId),
  // which composes device/user/session with a per-project agent_id.
  archonDevice = device;
  archonUser = user;

  // Resolve the active project (or create 'default' on first run).
  const project = getOrCreateDefaultProject(archonDir);

  // P8.1: Initialize the process-level supervisor and create the initial
  // ProjectRuntime for the active project. IPC handlers use getOrCreate()
  // which returns this runtime immediately (fast path).
  // buildProjectCtx() is called here with the initial project id to create
  // the operator agent record for this project × session pair.
  archonSupervisor = new RuntimeSupervisor();
  archonSupervisor.createProjectRuntime(
    project.id,
    buildProjectCtx(project.id),
    projectStateIO(project.id, archonDir),
  );

  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
}).catch((err: unknown) => {
  // Surface startup errors explicitly — no silent failures
  process.stderr.write(`Archon desktop failed to start: ${String(err)}\n`);
  process.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  // P8.1: Shutdown all active project runtimes on process exit.
  // This invokes runtime.shutdown() for each active runtime (currently a no-op
  // lifecycle hook; preserved for future async resource cleanup).
  if (archonSupervisor !== undefined) {
    const supervisor = archonSupervisor;
    for (const projectId of supervisor.listActiveRuntimes()) {
      // shutdown is async; fire-and-forget on process exit (acceptable: no
      // async resources in the current implementation of ProjectRuntime.shutdown()).
      void supervisor.shutdownProjectRuntime(projectId);
    }
  }

  // P7.5 / ACM-001: Record session end on clean shutdown.
  if (archonSession !== undefined) {
    const archonDir = getArchonDir();
    endSession(archonSession, archonDir);
  }
});
