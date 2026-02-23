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

const __dirname = fileURLToPath(new URL('.', import.meta.url));

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

  // TODO: load the renderer HTML entry point
  // TODO: configure Content Security Policy headers
  // void win.loadFile(join(__dirname, '../../renderer/index.html'));

  // Development: open DevTools
  // TODO: gate behind NODE_ENV check
  // win.webContents.openDevTools();
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
  // TODO: implement ipcMain.handle('kernel:status', ...) → ModuleRegistry.listEnabled()
  //   see packages/module-loader/src/registry.ts
  // TODO: implement ipcMain.handle('kernel:enable-module', ...) → ModuleRegistry.enable()
  //   requires confirm-on-change: display modal dialog, require typed confirmation
  //   see authority_and_composition_spec.md §11
  // TODO: implement ipcMain.handle('kernel:disable-module', ...) → ModuleRegistry.disable()
  // TODO: implement ipcMain.handle('kernel:rules-list', ...) → active snapshot DRR
  //   see packages/kernel/src/types/snapshot.ts
  // TODO: implement ipcMain.handle('kernel:rules-add', ...) → DRR add flow
  // TODO: implement ipcMain.handle('kernel:rules-remove', ...) → DRR remove flow
  // TODO: implement ipcMain.handle('kernel:log-query', ...) → DecisionLogger.query()
  //   see packages/kernel/src/logging/decision-log.ts
  // TODO: implement ipcMain.handle('kernel:gate', ...) → ExecutionGate.gate()
  //   see packages/kernel/src/validation/gate.ts

  // Stub handler to confirm IPC wiring works
  ipcMain.handle('kernel:ping', () => {
    return { ok: true, message: 'Archon kernel main process — IPC stub' };
  });
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
