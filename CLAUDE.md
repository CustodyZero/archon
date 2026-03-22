# Claude Code — Project Instructions

Read and follow `AGENTS.md` in this repository root. It contains the operating
instructions for all AI agents working in this codebase, including you.

**Critical rules (from AGENTS.md):**

1. Run `pnpm factory:status` before starting any work
2. Every code change requires a factory packet
3. Run `pnpm factory:complete <packet-id>` before committing
4. No facades — if something isn't implemented, it must fail explicitly
5. One intent per change — do not mix refactors with features

If you have lost context or are starting a new session, `pnpm factory:status`
tells you exactly what to do next. Do not guess.
