#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# IC-1: Restriction Monotonicity
#
# Invariant I2 — Dynamic restriction rules may reduce capability, never expand.
# Runs the kernel's monotonicity and restriction evaluation tests.
#
# @see docs/specs/formal_governance.md §4 (restriction monotonicity)
# @see tools/ci/invariant-checks.md (IC-1 specification)
# ---------------------------------------------------------------------------
set -euo pipefail

echo "IC-1: Restriction monotonicity — running property tests"
echo ""

pnpm --filter @archon/kernel test -- \
  --reporter=verbose \
  restriction-monotonicity \
  restriction-eval

echo ""
echo "IC-1 PASSED"
