/**
 * Archon Runtime Host — ARCHON_HOME Resolution
 *
 * Resolves the Archon home directory using the following precedence:
 *
 *   1. Explicit `archonHome` option (e.g. from --archon-home CLI flag)
 *   2. ARCHON_HOME environment variable
 *   3. ARCHON_STATE_DIR environment variable (legacy backward compat for P4 and earlier)
 *   4. OS application config file (stores last-used home path from a prior explicit override)
 *   5. Default: ~/.archon
 *
 * All project state must live under the resolved ARCHON_HOME:
 *
 *   <ARCHON_HOME>/
 *     projects/
 *       index.json
 *       <projectId>/
 *         metadata.json
 *         state/
 *         logs/
 *         workspace/
 *         secrets/
 *
 * Use resolveArchonHome() throughout the runtime host.
 * Never hardcode paths relative to process.cwd() directly in new code.
 *
 * getArchonDir() (in project-store.ts) calls resolveArchonHome() with no
 * options and is the standard entry point for all runtime home resolution.
 *
 * @see docs/specs/architecture.md §P5 (ARCHON_HOME configurability)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, platform } from 'node:os';

// ---------------------------------------------------------------------------
// OS Config File Location
// ---------------------------------------------------------------------------

/**
 * Returns the platform-specific path to the Archon application config file.
 *
 * This file persists the last explicitly-chosen ARCHON_HOME so operators
 * only need to pass --archon-home once; subsequent invocations remember it.
 *
 * Locations:
 *   macOS:   ~/Library/Preferences/com.custodyzero.archon/config.json
 *   Windows: %APPDATA%\archon\config.json (fallback: ~/AppData/Roaming/archon/config.json)
 *   Linux:   ~/.config/archon/config.json
 */
export function getOsConfigPath(): string {
  const home = homedir();
  switch (platform()) {
    case 'darwin':
      return join(home, 'Library', 'Preferences', 'com.custodyzero.archon', 'config.json');
    case 'win32': {
      const appData = process.env['APPDATA'] ?? join(home, 'AppData', 'Roaming');
      return join(appData, 'archon', 'config.json');
    }
    default:
      // Linux and other Unix-like systems
      return join(home, '.config', 'archon', 'config.json');
  }
}

// ---------------------------------------------------------------------------
// OS Config Read / Write
// ---------------------------------------------------------------------------

interface ArchonOsConfig {
  readonly archonHome?: string;
}

/**
 * Read the persisted ARCHON_HOME path from the OS application config file.
 *
 * Returns null if the config file does not exist, cannot be read, or
 * does not contain a valid `archonHome` string entry.
 */
export function readArchonHomeFromConfig(): string | null {
  const configPath = getOsConfigPath();
  try {
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as ArchonOsConfig;
    return typeof parsed.archonHome === 'string' && parsed.archonHome !== ''
      ? parsed.archonHome
      : null;
  } catch {
    return null;
  }
}

/**
 * Persist the ARCHON_HOME path to the OS application config file.
 *
 * Creates the config directory if it does not exist.
 * Called when the operator uses --archon-home with persist: true.
 *
 * @param archonHome - Absolute path to persist
 */
export function writeArchonHomeToConfig(archonHome: string): void {
  const configPath = getOsConfigPath();
  const configDir = join(configPath, '..');
  mkdirSync(configDir, { recursive: true });
  const config: ArchonOsConfig = { archonHome };
  writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Primary Resolution Function
// ---------------------------------------------------------------------------

/**
 * Options for ARCHON_HOME resolution.
 */
export interface ResolveArchonHomeOptions {
  /**
   * Explicit override — highest precedence.
   * Typically supplied by a --archon-home CLI flag.
   */
  readonly archonHome?: string | undefined;
  /**
   * If true, persist the resolved home to the OS config file so future
   * invocations without --archon-home use the same directory.
   * Only meaningful when archonHome is explicitly provided.
   * Default: false.
   */
  readonly persist?: boolean | undefined;
}

/**
 * Resolve the Archon home directory.
 *
 * Precedence (highest to lowest):
 *   1. opts.archonHome — explicit override (CLI flag)
 *   2. ARCHON_HOME env var
 *   3. ARCHON_STATE_DIR env var — legacy backward compat
 *   4. OS config file (from a prior --archon-home invocation)
 *   5. Default: ~/.archon
 *
 * Creates the resolved directory if it does not already exist.
 *
 * @param opts - Optional resolution overrides
 * @returns The absolute path to the resolved Archon home directory
 */
export function resolveArchonHome(opts?: ResolveArchonHomeOptions): string {
  let archonHome: string;

  if (typeof opts?.archonHome === 'string' && opts.archonHome !== '') {
    // 1. Explicit CLI override
    archonHome = opts.archonHome;
  } else if (
    typeof process.env['ARCHON_HOME'] === 'string' &&
    process.env['ARCHON_HOME'] !== ''
  ) {
    // 2. ARCHON_HOME env var
    archonHome = process.env['ARCHON_HOME'];
  } else if (
    typeof process.env['ARCHON_STATE_DIR'] === 'string' &&
    process.env['ARCHON_STATE_DIR'] !== ''
  ) {
    // 3. Legacy ARCHON_STATE_DIR (P4 and earlier tests + installations)
    archonHome = process.env['ARCHON_STATE_DIR'];
  } else {
    // 4. OS config file
    const fromConfig = readArchonHomeFromConfig();
    if (fromConfig !== null) {
      archonHome = fromConfig;
    } else {
      // 5. Default: ~/.archon
      archonHome = join(homedir(), '.archon');
    }
  }

  // Ensure the directory exists.
  if (!existsSync(archonHome)) {
    mkdirSync(archonHome, { recursive: true });
  }

  // Optionally persist to OS config (for --archon-home CLI flag).
  if (opts?.persist === true) {
    writeArchonHomeToConfig(archonHome);
  }

  return archonHome;
}
