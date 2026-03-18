#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# IC-5: No Module Auto-Enables Itself
#
# Invariant I1 — All modules start Disabled. No module can enable itself.
#
# This script statically scans all module source files under modules/ for
# any occurrence of `default_enabled: true` or `default_enabled:true`.
#
# The module loader also rejects this at runtime — this is the static CI
# check that catches violations before code reaches the loader.
#
# Scope:
#   modules/first-party/*/src/**/*.ts
#   modules/providers/*/src/**/*.ts
#
# Usage (from repo root):
#   bash tools/ci/check-ic5-no-self-enable.sh
#
# Exits 0 (PASS) — no violations found.
# Exits 1 (FAIL) — one or more violations found; file:line diagnostics printed.
#
# @see docs/specs/formal_governance.md §5 (I1: deny-by-default)
# @see docs/specs/module_api.md §9.1 (module loading)
# @see tools/ci/invariant-checks.md (IC-5 specification)
# ---------------------------------------------------------------------------
set -euo pipefail

echo "IC-5: No module manifest may set default_enabled: true"
echo ""

VIOLATIONS=0

# ---------------------------------------------------------------------------
# Check 1: Scan all module TypeScript source for default_enabled: true
#
# Matches patterns like:
#   default_enabled: true
#   default_enabled:true
#   "default_enabled": true
#
# Covers manifest.ts files and any other source that might construct
# capability descriptors.
# ---------------------------------------------------------------------------

MODULE_DIRS=()

# Collect module directories that exist
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

# Search for default_enabled set to true in any form
HITS=$(grep -rn "default_enabled[\"']\?[[:space:]]*:[[:space:]]*true" \
  "${MODULE_DIRS[@]}" 2>/dev/null || true)

if [ -n "$HITS" ]; then
  echo "FAIL — default_enabled: true found in module source:"
  echo "$HITS"
  echo ""
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# ---------------------------------------------------------------------------
# Check 2: Scan module package.json files for default_enabled
#
# If any module package.json somehow contains default_enabled, flag it.
# This is a belt-and-suspenders check — manifests are in .ts files, but
# someone could try to sneak it into package.json metadata.
# ---------------------------------------------------------------------------

PKG_HITS=$(grep -rn "default_enabled" \
  modules/first-party/*/package.json \
  modules/providers/*/package.json 2>/dev/null || true)

if [ -n "$PKG_HITS" ]; then
  echo "FAIL — default_enabled reference found in module package.json:"
  echo "$PKG_HITS"
  echo ""
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# ---------------------------------------------------------------------------
# Result
# ---------------------------------------------------------------------------
if [ "$VIOLATIONS" -gt 0 ]; then
  echo "IC-5 FAILED: ${VIOLATIONS} violation(s) found"
  echo ""
  echo "All capability descriptors must set default_enabled: false (Invariant I1)."
  echo "The module loader also enforces this at runtime, but this static check"
  echo "catches violations before code reaches the loader."
  exit 1
fi

echo "Scanned ${#MODULE_DIRS[@]} module source directories"
echo "PASS — no default_enabled: true found"
