#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# IC-2: Snapshot Determinism
#
# Invariant I4 — Identical inputs produce identical RS_hash.
# Runs the kernel's snapshot hashing and compiler determinism tests.
#
# @see docs/specs/formal_governance.md §10 (snapshot determinism)
# @see tools/ci/invariant-checks.md (IC-2 specification)
# ---------------------------------------------------------------------------
set -euo pipefail

echo "IC-2: Snapshot determinism — running property tests"
echo ""

pnpm --filter @archon/kernel test -- \
  --reporter=verbose \
  snapshot-hashing \
  restriction-compiler \
  dsl-parser-compiler

echo ""
echo "IC-2 PASSED"
