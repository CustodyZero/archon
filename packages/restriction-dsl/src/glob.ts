/**
 * Archon Restriction DSL — Glob Matching
 *
 * Pure, deterministic glob-to-regex conversion for DRR path conditions.
 *
 * Supported glob syntax (v0.1):
 * - `*`  — matches any character sequence within a single path segment
 * - `**` — matches any character sequence including path separators
 * - All other characters are treated as literals
 *
 * Normalization: leading `./` is stripped from both pattern and path before
 * matching so that `./docs/**` and `docs/**` behave identically.
 *
 * This module has no dependencies and no side effects.
 *
 * @see docs/specs/reestriction-dsl-spec.md §9.1 (glob semantics)
 */

/**
 * Test whether a path satisfies a glob pattern.
 *
 * Glob semantics:
 * - `**` matches zero or more path components (crosses `/` boundaries).
 * - `*` matches zero or more characters within one path component (stops at `/`).
 * - All other characters are matched literally.
 *
 * Leading `./` is normalized away from both arguments before matching.
 *
 * @param pattern - Glob pattern, e.g. `'./docs/**'` or `'src/*.ts'`
 * @param path    - The path to test, e.g. `'./docs/specs/capabilities.md'`
 * @returns true if path matches pattern, false otherwise
 *
 * @example
 * matchesGlob('./docs/**',  './docs/specs/capabilities.md') // true
 * matchesGlob('./docs/**',  './package.json')               // false
 * matchesGlob('src/*.ts',   'src/index.ts')                 // true
 * matchesGlob('src/*.ts',   'src/sub/index.ts')             // false
 */
export function matchesGlob(pattern: string, path: string): boolean {
  const strip = (s: string): string => (s.startsWith('./') ? s.slice(2) : s);
  const normPattern = strip(pattern);
  const normPath = strip(path);

  // Build a regex from the glob pattern by splitting on '**'.
  // Segments between '**' delimiters are escaped and single-'*' expanded.
  // '**' delimiters become '.*' in the regex (match anything including '/').
  const segments = normPattern.split('**');
  let regexStr = '';
  for (let i = 0; i < segments.length; i++) {
    if (i > 0) {
      // '**' between this segment and the previous
      regexStr += '.*';
    }
    const seg = segments[i] ?? '';
    // Escape all regex metacharacters in this literal segment,
    // then replace single '*' with [^/]* (does not cross directory boundaries).
    const escaped = seg
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // escape regex metacharacters
      .replace(/\*/g, '[^/]*');               // glob * → within-segment match
    regexStr += escaped;
  }

  return new RegExp(`^${regexStr}$`).test(normPath);
}
