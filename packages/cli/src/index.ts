#!/usr/bin/env node
/**
 * Archon CLI — non-interactive entry point (backward compat wrapper).
 *
 * The interactive TTY entry point is src/bin/archon.ts.
 * This file remains for direct node invocation compatibility.
 *
 * @see docs/specs/authority_and_composition_spec.md §11 (confirm-on-change posture)
 * @see docs/specs/governance.md §1 (rule proposal flow)
 */

import { program } from './commands/index.js'

program.parse()
