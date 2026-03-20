/**
 * @archon/module-exec
 *
 * Archon first-party subprocess execution capability module.
 *
 * Exports the module manifest (for registration with the kernel loader)
 * and the exec.run handler (for registration with the execution gate).
 *
 * exec.run is T3 (high risk) — requires typed acknowledgment before
 * the operator can enable it. All subprocess execution flows through
 * the kernel's ExecAdapter, which enforces P5 CWD rooting.
 *
 * @see docs/specs/module_api.md
 * @see docs/specs/capabilities.md §3.D (exec capabilities)
 */

export { EXEC_MANIFEST } from './manifest.js';
export { executeExecRun } from './execute.js';
