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
 * @see docs/specs/architecture.md §4 (validation flow)
 * @see docs/specs/module_api.md §6 (kernel adapters — all side effects via kernel)
 */

import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SnapshotBuilderImpl, CapabilityType } from '@archon/kernel';
import type { ProposalStatus } from '@archon/kernel';
import {
  ModuleRegistry,
  CapabilityRegistry,
  RestrictionRegistry,
  ProposalQueue,
  getAckEpoch,
} from '@archon/module-loader';
import { FILESYSTEM_MANIFEST } from '@archon/module-filesystem';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

// ---------------------------------------------------------------------------
// Runtime context builders (desktop local copy)
// ---------------------------------------------------------------------------

/** The engine version string. */
const ENGINE_VERSION = '0.0.1';

/**
 * Build the first-party module registry, capability registry, and restriction registry.
 * Applies persisted enablement state from disk.
 */
function buildRuntime(): {
  registry: ModuleRegistry;
  capabilityRegistry: CapabilityRegistry;
  restrictionRegistry: RestrictionRegistry;
} {
  const registry = new ModuleRegistry();
  registry.register(FILESYSTEM_MANIFEST);
  registry.applyPersistedState();
  const capabilityRegistry = new CapabilityRegistry(registry);
  const restrictionRegistry = new RestrictionRegistry();
  return { registry, capabilityRegistry, restrictionRegistry };
}

/**
 * Build the active RuleSnapshot and return its hash string.
 * Used as the buildSnapshotHash factory for ProposalQueue.
 */
function buildSnapshotHash(
  registry: ModuleRegistry,
  capabilityRegistry: CapabilityRegistry,
  restrictionRegistry: RestrictionRegistry,
): string {
  const builder = new SnapshotBuilderImpl();
  const snapshot = builder.build(
    registry.listEnabled(),
    capabilityRegistry.listEnabledCapabilities(),
    restrictionRegistry.compileAll(),
    ENGINE_VERSION,
    '',
    undefined,
    getAckEpoch(),
  );
  return builder.hash(snapshot);
}

// ---------------------------------------------------------------------------
// Window Creation
// ---------------------------------------------------------------------------

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: 'Archon',
    webPreferences: {
      // SECURITY: nodeIntegration off — renderer cannot access Node.js APIs
      nodeIntegration: false,
      // SECURITY: contextIsolation on — renderer context isolated from main
      contextIsolation: true,
      // SECURITY: sandbox on — renderer is fully sandboxed
      sandbox: true,
      // Preload script provides the restricted IPC bridge to the renderer
      preload: join(__dirname, '../../preload/index.js'),
    },
  });

  void win.loadFile(join(__dirname, '../../renderer/index.html'));
}

// ---------------------------------------------------------------------------
// IPC Handlers — Kernel Operations
//
// All kernel operations are exposed to the renderer via IPC channels.
// The renderer calls ipcRenderer.invoke(channel, ...args).
// The main process validates, calls the kernel, and returns the result.
// The renderer cannot call kernel logic directly.
// ---------------------------------------------------------------------------

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
      const { registry, capabilityRegistry, restrictionRegistry } = buildRuntime();
      const queue = new ProposalQueue(
        registry,
        capabilityRegistry,
        restrictionRegistry,
        () => buildSnapshotHash(registry, capabilityRegistry, restrictionRegistry),
      );
      return queue.listProposals(filter);
    },
  );

  /**
   * Get a full Proposal by ID.
   * Returns Proposal | null.
   */
  ipcMain.handle('kernel:proposals:get', (_event, id: string) => {
    const { registry, capabilityRegistry, restrictionRegistry } = buildRuntime();
    const queue = new ProposalQueue(
      registry,
      capabilityRegistry,
      restrictionRegistry,
      () => buildSnapshotHash(registry, capabilityRegistry, restrictionRegistry),
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
      const { registry, capabilityRegistry, restrictionRegistry } = buildRuntime();
      const queue = new ProposalQueue(
        registry,
        capabilityRegistry,
        restrictionRegistry,
        () => buildSnapshotHash(registry, capabilityRegistry, restrictionRegistry),
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
      const { registry, capabilityRegistry, restrictionRegistry } = buildRuntime();
      const queue = new ProposalQueue(
        registry,
        capabilityRegistry,
        restrictionRegistry,
        () => buildSnapshotHash(registry, capabilityRegistry, restrictionRegistry),
      );
      const result = queue.rejectProposal(id, { kind: 'ui', id: 'desktop-operator' }, reason);
      return result !== undefined;
    },
  );

  // TODO: implement kernel:status, kernel:enable-module, kernel:rules-list, kernel:gate
}

// ---------------------------------------------------------------------------
// App Lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
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
