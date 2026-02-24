/**
 * @archon/module-filesystem
 *
 * Archon first-party filesystem capability module.
 *
 * Exports the module manifest (for registration with the kernel loader)
 * and handler functions (for registration with the execution gate).
 *
 * @see docs/specs/module_api.md
 */

export { FILESYSTEM_MANIFEST } from './manifest.js';
export { executeFsRead, executeFsList, executeFsWrite, executeFsDelete } from './execute.js';
