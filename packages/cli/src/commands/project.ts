/**
 * archon project — Project management commands (P4: Project Scoping)
 *
 * Subcommands:
 *   archon project create <name>   — create a new project
 *   archon project list            — list all projects
 *   archon project select <id>     — set the active project
 *   archon project current         — show the active project
 *   archon project show <id>       — show details for a specific project
 *
 * Projects are the governance isolation boundary. Each project has its own
 * module enablement state, capability enablement state, restriction rules,
 * ack store, and decision log. The project_id is incorporated into every
 * RuleSnapshot so RS_hash is project-specific. Cross-project actions are
 * Denied by the ValidationEngine (triggered_rules=['project_mismatch']).
 *
 * @see docs/specs/authority_and_composition_spec.md §P4 (Project Scoping)
 */

import { Command } from 'commander';
import {
  getArchonDir,
  projectDir,
  createProject,
  listProjects,
  getActiveProject,
  selectProject,
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
// Parent project command
// ---------------------------------------------------------------------------

export const projectCommand = new Command('project')
  .description('Manage Archon projects (P4: Project Scoping — governance isolation boundary)')
  .addCommand(createProjectCommand)
  .addCommand(listProjectsCommand)
  .addCommand(selectProjectCommand)
  .addCommand(currentProjectCommand)
  .addCommand(showProjectCommand);
