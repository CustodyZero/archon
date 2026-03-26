# Claude Code — Archon

Read `AGENTS.md` first. It defines all operating constraints.

## Critical Rules

1. **Run `npx tsx factory/tools/status.ts` at the start of every session**
2. **Never implement without a packet**
3. **Never commit without a completion**
4. **Never introduce facades or partial success paths**
5. **One intent per change — no scope mixing**

## Quick Reference

```sh
npx tsx factory/tools/status.ts              # What is the factory state?
npx tsx factory/tools/execute.ts <feature>   # What packets are ready? (returns packet + persona)
npx tsx factory/tools/complete.ts <packet>   # Create completion record (--identity <id> for QA)
npx tsx factory/tools/accept.ts <packet>     # Accept a completed packet (human action)
npx tsx factory/tools/validate.ts            # Validate factory integrity
```

If you have lost context or are starting a new session, `npx tsx factory/tools/status.ts`
tells you exactly what to do next. Do not guess.
