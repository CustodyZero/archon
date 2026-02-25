/**
 * Archon Runtime Host — ULID Generator
 *
 * Universally Unique Lexicographically Sortable Identifier.
 *
 * ULID format: 26 characters, Crockford Base32 encoded.
 *   - 10 chars: 48-bit millisecond timestamp (lexicographically sortable)
 *   - 16 chars: 80-bit cryptographic random
 *
 * Properties:
 *   - Lexicographically sortable by creation time
 *   - Globally unique with high probability (2^80 random bits per ms)
 *   - URL-safe (no special characters)
 *   - Case-insensitive by design (uses uppercase)
 *
 * Used as event_id in append-only log entries (decisions.jsonl,
 * proposal-events.jsonl) to enable per-session deduplication when log
 * files are synchronized from multiple sources.
 *
 * Implementation uses only node:crypto (no external dependencies).
 * The random component uses cryptographically secure randomness.
 *
 * @see https://github.com/ulid/spec
 */

import { randomBytes } from 'node:crypto';

// ---------------------------------------------------------------------------
// Crockford Base32 Encoding
// ---------------------------------------------------------------------------

/**
 * Crockford's Base32 character set.
 *
 * Excludes I, L, O, U to avoid visual ambiguity with digits and other letters.
 * The 32 characters provide exactly 5 bits per character.
 */
const CROCKFORD_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Number of bits encoded per character (log2(32) = 5). */
const BITS_PER_CHAR = 5;

/** Number of characters for the 48-bit time component. ceil(48/5) = 10. */
const TIME_CHARS = 10;

/** Number of characters for the 80-bit random component. ceil(80/5) = 16. */
const RANDOM_CHARS = 16;

/**
 * Encode a fixed-precision unsigned integer as Crockford Base32.
 *
 * Encodes exactly `length` characters, zero-padding on the left.
 * Works on BigInt to handle values wider than 32 bits without precision loss.
 *
 * @param value - Non-negative BigInt value to encode
 * @param length - Exact number of output characters
 */
function encodeCrockford(value: bigint, length: number): string {
  const chars: string[] = new Array<string>(length);
  let v = value;
  for (let i = length - 1; i >= 0; i--) {
    const idx = Number(v & BigInt(0x1f)); // last 5 bits
    chars[i] = CROCKFORD_ALPHABET[idx] as string;
    v >>= BigInt(BITS_PER_CHAR);
  }
  return chars.join('');
}

// ---------------------------------------------------------------------------
// ULID Generator
// ---------------------------------------------------------------------------

/**
 * Generate a new ULID string.
 *
 * Time component: 48-bit millisecond timestamp from Date.now().
 * Random component: 80 bits from crypto.randomBytes(10).
 *
 * The random component is NOT monotonically incremented within the same
 * millisecond. This is acceptable for Archon log entries where lexicographic
 * ordering is informational, not a strict requirement.
 *
 * Note: The random component does not wrap at 2^80 - this is a
 * non-issue in practice (2^80 ULIDs per millisecond exceeds all
 * realistic write rates by many orders of magnitude).
 *
 * @returns A 26-character ULID string (uppercase Crockford Base32).
 *
 * @example
 * const id = ulid();
 * // e.g. '01JDKPF8X7M4VQN3BGHST6RWYZ'
 */
export function ulid(): string {
  // 48-bit timestamp: milliseconds since epoch
  const nowMs = BigInt(Date.now());
  const timePart = encodeCrockford(nowMs, TIME_CHARS);

  // 80-bit random: 10 bytes = 80 bits
  const randBuf = randomBytes(10);
  let randValue = BigInt(0);
  for (const byte of randBuf) {
    randValue = (randValue << BigInt(8)) | BigInt(byte);
  }
  const randomPart = encodeCrockford(randValue, RANDOM_CHARS);

  return timePart + randomPart;
}
