/**
 * archon project — Project management commands (P4: Project Scoping)
 *
 * Subcommands:
 *   archon project create <name>   — create a new project
 *   archon project list            — list all projects
 *   archon project select <id>     — set the active project
 *   archon project current         — show the active project
 *   archon project show <id>       — show details for a specific project
 *   archon project portability     — show portability and drift status (P6)
 *
 * Projects are the governance isolation boundary. Each project has its own
 * module enablement state, capability enablement state, restriction rules,
 * ack store, and decision log. The project_id is incorporated into every
 * RuleSnapshot so RS_hash is project-specific. Cross-project actions are
 * Denied by the ValidationEngine (triggered_rules=['project_mismatch']).
 *
 * @see docs/specs/authority_and_composition_spec.md §P4 (Project Scoping)
 */

import { join } from 'node:path';
import { Command } from 'commander';
import {
  getArchonDir,
  projectDir,
  projectStateIO,
  createProject,
  listProjects,
  getActiveProject,
  getActiveProjectId,
  selectProject,
  SecretStore,
  getPortabilityStatus,
  detectDrift,
  readLog,
} from '@archon/runtime-host';

// ---------------------------------------------------------------------------
// archon project create <name>
// ---------------------------------------------------------------------------

const createProjectCommand = new Command('create')
  .description('Create a new project')
  .argument('<name>', 'Project name (human-readable label)')
  .action((name: string) => {
    const archonDir = getArchonDir();
    const project = createProject(name, archonDir);
    // eslint-disable-next-line no-console
    console.log('Created project:');
    // eslint-disable-next-line no-console
    console.log(`  id:         ${project.id}`);
    // eslint-disable-next-line no-console
    console.log(`  name:       ${project.name}`);
    // eslint-disable-next-line no-console
    console.log(`  created_at: ${project.createdAt}`);
    // eslint-disable-next-line no-console
    console.log(`  state_dir:  ${projectDir(project.id, archonDir)}`);
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log(`To activate: archon project select ${project.id}`);
  });

// ---------------------------------------------------------------------------
// archon project list
// ---------------------------------------------------------------------------

const listProjectsCommand = new Command('list')
  .description('List all projects')
  .action(() => {
    const archonDir = getArchonDir();
    const projects = listProjects(archonDir);
    const activeProject = getActiveProject(archonDir);

    if (projects.length === 0) {
      // eslint-disable-next-line no-console
      console.log('No projects found. Run `archon project create <name>` to create one.');
      return;
    }

    // eslint-disable-next-line no-console
    console.log('Projects:');
    for (const p of projects) {
      const marker = activeProject?.id === p.id ? ' *' : '  ';
      // eslint-disable-next-line no-console
      console.log(`${marker} ${p.id}  "${p.name}"  created=${p.createdAt}`);
    }
    // eslint-disable-next-line no-console
    console.log('');
    // eslint-disable-next-line no-console
    console.log('* = active project');
  });

// ---------------------------------------------------------------------------
// archon project select <id>
// ---------------------------------------------------------------------------

const selectProjectCommand = new Command('select')
  .description('Set the active project')
  .argument('<id>', 'Project ID to activate')
  .action((id: string) => {
    const archonDir = getArchonDir();
    const projects = listProjects(archonDir);
    const project = projects.find((p) => p.id === id);

    if (project === undefined) {
      // eslint-disable-next-line no-console
      console.error(`[archon project select] Unknown project: ${id}`);
      // eslint-disable-next-line no-console
      console.error(`  Known projects: ${projects.map((p) => p.id).join(', ')}`);
      process.exit(1);
    }

    selectProject(id, archonDir);
    // eslint-disable-next-line no-console
    console.log(`Active project: ${project.name} (${project.id})`);
  });

// ---------------------------------------------------------------------------
// archon project current
// ---------------------------------------------------------------------------

const currentProjectCommand = new Command('current')
  .description('Show the active project')
  .action(() => {
    const archonDir = getArchonDir();
    const project = getActiveProject(archonDir);

    if (project === null) {
      // eslint-disable-next-line no-console
      console.log('No active project.');
      // eslint-disable-next-line no-console
      console.log('Run `archon project create <name>` to create one,');
      // eslint-disable-next-line no-console
      console.log('then `archon project select <id>` to activate it.');
      return;
    }

    // eslint-disable-next-line no-console
    console.log('Active project:');
    // eslint-disable-next-line no-console
    console.log(`  id:         ${project.id}`);
    // eslint-disable-next-line no-console
    console.log(`  name:       ${project.name}`);
    // eslint-disable-next-line no-console
    console.log(`  created_at: ${project.createdAt}`);
    // eslint-disable-next-line no-console
    console.log(`  state_dir:  ${projectDir(project.id, archonDir)}`);
  });

// ---------------------------------------------------------------------------
// archon project show <id>
// ---------------------------------------------------------------------------

const showProjectCommand = new Command('show')
  .description('Show details for a specific project')
  .argument('<id>', 'Project ID')
  .action((id: string) => {
    const archonDir = getArchonDir();
    const projects = listProjects(archonDir);
    const project = projects.find((p) => p.id === id);

    if (project === undefined) {
      // eslint-disable-next-line no-console
      console.error(`[archon project show] Unknown project: ${id}`);
      // eslint-disable-next-line no-console
      console.error(`  Known projects: ${projects.map((p) => p.id).join(', ')}`);
      process.exit(1);
    }

    const activeProject = getActiveProject(archonDir);
    const isActive = activeProject?.id === project.id;

    // eslint-disable-next-line no-console
    console.log(`Project: ${project.name}`);
    // eslint-disable-next-line no-console
    console.log(`  id:         ${project.id}`);
    // eslint-disable-next-line no-console
    console.log(`  name:       ${project.name}`);
    // eslint-disable-next-line no-console
    console.log(`  created_at: ${project.createdAt}`);
    // eslint-disable-next-line no-console
    console.log(`  state_dir:  ${projectDir(project.id, archonDir)}`);
    // eslint-disable-next-line no-console
    console.log(`  active:     ${isActive}`);
  });

// ---------------------------------------------------------------------------
// archon project portability [--project <id>]
// ---------------------------------------------------------------------------

const portabilityCommand = new Command('portability')
  .description('Show portability and drift status for a project (P6)')
  .option('-p, --project <id>', 'Project ID (defaults to active project)')
  .action((opts: { project?: string }) => {
    const archonDir = getArchonDir();
    const projectId = opts.project ?? getActiveProjectId(archonDir);

    if (projectId === null) {
      // eslint-disable-next-line no-console
      console.error('[archon project portability] No active project. Use --project <id> or activate one first.');
      process.exit(1);
    }

    const stateIO = projectStateIO(projectId, archonDir);
    const store = new SecretStore(stateIO, join(archonDir, 'device.key'));
    const secretsMode = store.listKeys().length === 0 ? null : store.getMode();

    const portability = getPortabilityStatus({ secretsMode, archonHomePath: archonDir });

    // eslint-disable-next-line no-console
    console.log(`Portability:  ${portability.portable ? 'Yes' : 'No'}`);
    if (portability.reasonCodes.length > 0) {
      // eslint-disable-next-line no-console
      console.log('  Reasons:');
      for (const code of portability.reasonCodes) {
        // eslint-disable-next-line no-console
        console.log(`    - ${code}`);
      }
    }
    // eslint-disable-next-line no-console
    console.log(`Secrets mode: ${portability.details.secretsMode ?? 'none'}`);
    if (portability.details.requiresPassphrase) {
      // eslint-disable-next-line no-console
      console.log('  Note: portable secrets require the passphrase when opening on another device.');
    }
    // eslint-disable-next-line no-console
    console.log(`Archon home:  ${archonDir}`);
    if (portability.details.suggestedSync !== 'unknown') {
      // eslint-disable-next-line no-console
      console.log(`Sync provider: ${portability.details.suggestedSync} (detected from path)`);
    }

    // Advisory drift detection — reads decisions.jsonl and proposal-events.jsonl
    // Non-blocking: drift detection failure does not block portability reporting
    try {
      const decisionsRaw = stateIO.readLogRaw('decisions.jsonl');
      const proposalsRaw = stateIO.readLogRaw('proposal-events.jsonl');
      // Combine both log streams for joint drift analysis.
      // Safe to concatenate: all event_id values are ULIDs (globally unique per ulid.ts),
      // so deduplication collisions across the two log files are not possible.
      const combinedRaw = [decisionsRaw, proposalsRaw].filter((s) => s.length > 0).join('\n');
      const driftStatus = detectDrift(readLog(combinedRaw));

      // eslint-disable-next-line no-console
      console.log(`Drift:        ${driftStatus.status}`);
      if (driftStatus.reasons.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`  Reasons: ${[...driftStatus.reasons].join(', ')}`);
      }
      const m = driftStatus.metrics;
      // eslint-disable-next-line no-console
      console.log(
        `  Metrics: duplicates=${m.duplicateEventIds} parseErrors=${m.parseErrors}` +
        ` outOfOrder=${m.outOfOrder} rsHashDiscontinuities=${m.rsHashDiscontinuities}` +
        ` proposalConflicts=${m.proposalStateConflicts}`,
      );
    } catch {
      // eslint-disable-next-line no-console
      console.log('Drift:        unknown (could not read log files)');
    }
  });

// ---------------------------------------------------------------------------
// Parent project command
// ---------------------------------------------------------------------------

export const projectCommand = new Command('project')
  .description('Manage Archon projects (P4: Project Scoping — governance isolation boundary)')
  .addCommand(createProjectCommand)
  .addCommand(listProjectsCommand)
  .addCommand(selectProjectCommand)
  .addCommand(currentProjectCommand)
  .addCommand(showProjectCommand)
  .addCommand(portabilityCommand);
