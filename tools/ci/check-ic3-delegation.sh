#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# IC-3: Delegation Non-Escalation
#
# Invariant I6 — Delegation does not expand authority.
# Runs the kernel's delegation non-escalation tests.
#
# @see docs/specs/formal_governance.md §9 (delegation non-escalation)
# @see tools/ci/invariant-checks.md (IC-3 specification)
# ---------------------------------------------------------------------------
set -euo pipefail

echo "IC-3: Delegation non-escalation — running property tests"
echo ""

pnpm --filter @archon/kernel test -- \
  --reporter=verbose \
  delegation-non-escalation

echo ""
echo "IC-3 PASSED"
