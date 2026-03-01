#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# DEP-GUARD: runtime-host must never import @archon/module-loader
#
# Package dependency order (strict):
#   restriction-dsl → kernel → runtime-host → module-loader → cli/desktop
#
# runtime-host sits below module-loader in the dep graph. Any ES module
# import of @archon/module-loader from runtime-host source or tests would
# create a circular dependency and violate this architectural invariant.
#
# Usage (from repo root):
#   bash tools/ci/check-dep-graph.sh
#
# Exits 0 (PASS) — no violations found.
# Exits 1 (FAIL) — one or more violations found; file:line diagnostics printed.
# ---------------------------------------------------------------------------
set -euo pipefail

PKG="@archon/module-loader"
TARGET="packages/runtime-host"
VIOLATIONS=0

echo "DEP-GUARD: ${TARGET} must not import ${PKG}"
echo ""

# ---------------------------------------------------------------------------
# Check 1: no ES module import/export-from in source or test files
#
# Pattern matches:
#   import type { ... } from '@archon/module-loader'
#   import { ... } from '@archon/module-loader'
#   export { ... } from '@archon/module-loader'
#   export type { ... } from '@archon/module-loader'
#
# Does NOT match JSDoc comment references (which lack the quoted `from` form).
# ---------------------------------------------------------------------------
IMPORT_HITS=$(grep -rn "from ['\"]${PKG}['\"]" \
  "${TARGET}/src" "${TARGET}/test" 2>/dev/null || true)

if [ -n "$IMPORT_HITS" ]; then
  echo "FAIL — ES module import statements found:"
  echo "$IMPORT_HITS"
  echo ""
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# ---------------------------------------------------------------------------
# Check 2: not listed in package.json as a declared dependency
#
# Covers: dependencies, devDependencies, peerDependencies.
# package.json is pure JSON (no comments), so any quoted occurrence of the
# package name is a declared dependency — which would violate dep order.
# ---------------------------------------------------------------------------
if grep -q "\"${PKG}\"" "${TARGET}/package.json" 2>/dev/null; then
  echo "FAIL — ${PKG} declared as a dependency in ${TARGET}/package.json"
  echo ""
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
if [ "$VIOLATIONS" -gt 0 ]; then
  echo "DEP-GUARD FAILED: ${VIOLATIONS} violation(s) found"
  echo "Required dep order: restriction-dsl → kernel → runtime-host → module-loader"
  exit 1
fi

echo "PASS — no violations found"
