#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# IC-4: No Module Alters Kernel Enforcement Logic
#
# Invariant: Modules are declarative only. Modules cannot modify the
# validation algorithm, snapshot hashing, tier ordering, or approval workflow.
#
# This script statically verifies that no module package imports from
# kernel internals that control enforcement:
#   - packages/kernel/src/validation/  (ValidationEngine, ExecutionGate)
#   - packages/kernel/src/snapshot/    (SnapshotBuilder)
#   - packages/kernel/src/restrictions/ (evaluator)
#   - packages/kernel/src/logging/     (DecisionLogger)
#
# Modules MAY import from the kernel's public type surface:
#   - @archon/kernel (re-exports from src/index.ts)
#   - @archon/restriction-dsl (types, CapabilityType)
#
# Modules MUST NOT:
#   - Import kernel internals via deep paths
#   - Import from @archon/module-loader (which contains enforcement APIs)
#   - Import from @archon/runtime-host (which contains adapters + runtime)
#
# Scope:
#   modules/first-party/*/src/**/*.ts
#   modules/providers/*/src/**/*.ts
#
# Usage (from repo root):
#   bash tools/ci/check-ic4-kernel-boundary.sh
#
# Exits 0 (PASS) — no violations found.
# Exits 1 (FAIL) — one or more violations found.
#
# @see docs/specs/formal_governance.md §11 (module contract)
# @see docs/specs/module_api.md §10 (security and integrity constraints)
# @see tools/ci/invariant-checks.md (IC-4 specification)
# ---------------------------------------------------------------------------
set -euo pipefail

echo "IC-4: No module may import kernel enforcement internals"
echo ""

VIOLATIONS=0

# ---------------------------------------------------------------------------
# Collect module directories
# ---------------------------------------------------------------------------

MODULE_DIRS=()

for dir in modules/first-party/*/src modules/providers/*/src; do
  if [ -d "$dir" ]; then
    MODULE_DIRS+=("$dir")
  fi
done

if [ ${#MODULE_DIRS[@]} -eq 0 ]; then
  echo "WARNING: No module directories found under modules/"
  echo "PASS — nothing to check"
  exit 0
fi

# ---------------------------------------------------------------------------
# Check 1: No deep imports into kernel internals
#
# Forbidden patterns (deep path imports that bypass the public API):
#   from '@archon/kernel/src/validation/...'
#   from '@archon/kernel/src/snapshot/...'
#   from '@archon/kernel/src/restrictions/...'
#   from '@archon/kernel/src/logging/...'
#   from '@archon/kernel/src/configuration/...'
#
# Allowed:
#   from '@archon/kernel'            (public re-exports)
#   from '@archon/restriction-dsl'   (types only)
# ---------------------------------------------------------------------------

DEEP_IMPORTS=$(grep -rn "from ['\"]@archon/kernel/src/" \
  "${MODULE_DIRS[@]}" 2>/dev/null || true)

if [ -n "$DEEP_IMPORTS" ]; then
  echo "FAIL — Deep imports into @archon/kernel internals found:"
  echo "$DEEP_IMPORTS"
  echo ""
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# ---------------------------------------------------------------------------
# Check 2: No imports from @archon/module-loader
#
# module-loader contains enforcement APIs (CapabilityGovernance,
# ProposalQueue, ModuleLoader, SnapshotFactory, GateExecutionSurface).
# Modules must not import from it.
# ---------------------------------------------------------------------------

ML_IMPORTS=$(grep -rn "from ['\"]@archon/module-loader['\"/]" \
  "${MODULE_DIRS[@]}" 2>/dev/null || true)

if [ -n "$ML_IMPORTS" ]; then
  echo "FAIL — Imports from @archon/module-loader found in modules:"
  echo "$ML_IMPORTS"
  echo ""
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# ---------------------------------------------------------------------------
# Check 3: No imports from @archon/runtime-host
#
# runtime-host contains adapters, state I/O, ProjectRuntime,
# RuntimeSupervisor. Modules must not import from it — they receive
# adapters via injection, not direct import.
# ---------------------------------------------------------------------------

RH_IMPORTS=$(grep -rn "from ['\"]@archon/runtime-host['\"/]" \
  "${MODULE_DIRS[@]}" 2>/dev/null || true)

if [ -n "$RH_IMPORTS" ]; then
  echo "FAIL — Imports from @archon/runtime-host found in modules:"
  echo "$RH_IMPORTS"
  echo ""
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# ---------------------------------------------------------------------------
# Check 4: No imports from @archon/cli or @archon/desktop
#
# Application packages must not be imported by modules.
# ---------------------------------------------------------------------------

APP_IMPORTS=$(grep -rn "from ['\"]@archon/\(cli\|desktop\)['\"/]" \
  "${MODULE_DIRS[@]}" 2>/dev/null || true)

if [ -n "$APP_IMPORTS" ]; then
  echo "FAIL — Imports from application packages found in modules:"
  echo "$APP_IMPORTS"
  echo ""
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# ---------------------------------------------------------------------------
# Check 5: No direct node: imports for gated resources
#
# Modules must use kernel adapters, not direct node: APIs.
# Forbidden: node:fs, node:child_process, node:net
# Allowed: node:crypto (for internal hashing), node:path, node:url
# ---------------------------------------------------------------------------

DIRECT_IO=$(grep -rn "from ['\"]node:\(fs\|child_process\|net\)['\"/]" \
  "${MODULE_DIRS[@]}" 2>/dev/null || true)

if [ -n "$DIRECT_IO" ]; then
  echo "FAIL — Direct node: I/O imports found in modules:"
  echo "$DIRECT_IO"
  echo ""
  echo "Modules must use kernel adapters for filesystem, process, and network access."
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# ---------------------------------------------------------------------------
# Check 6: Module package.json must not declare kernel internals as deps
#
# modules/*/package.json may depend on:
#   @archon/kernel (public API)
#   @archon/restriction-dsl (types)
#
# Must NOT depend on:
#   @archon/module-loader
#   @archon/runtime-host
#   @archon/cli
#   @archon/desktop
# ---------------------------------------------------------------------------

for pkg_file in modules/first-party/*/package.json modules/providers/*/package.json; do
  if [ ! -f "$pkg_file" ]; then
    continue
  fi

  for forbidden in "@archon/module-loader" "@archon/runtime-host" "@archon/cli" "@archon/desktop"; do
    if grep -q "\"${forbidden}\"" "$pkg_file" 2>/dev/null; then
      echo "FAIL — ${forbidden} declared as dependency in ${pkg_file}"
      echo ""
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  done
done

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
if [ "$VIOLATIONS" -gt 0 ]; then
  echo "IC-4 FAILED: ${VIOLATIONS} violation(s) found"
  echo ""
  echo "Modules are declarative extensions. They must not import kernel"
  echo "enforcement internals, runtime-host adapters, module-loader APIs,"
  echo "application packages, or direct node: I/O modules."
  echo ""
  echo "Allowed imports for modules:"
  echo "  @archon/kernel         (public re-exports: types, constants)"
  echo "  @archon/restriction-dsl (CapabilityType, types)"
  echo ""
  echo "@see docs/specs/formal_governance.md §11"
  echo "@see docs/specs/module_api.md §10"
  exit 1
fi

echo "Scanned ${#MODULE_DIRS[@]} module source directories"
echo "PASS — no kernel boundary violations found"
