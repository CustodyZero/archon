/**
 * Archon Runtime Host — Network Adapter Implementation
 *
 * Implements the NetworkAdapter interface from @archon/kernel.
 * Uses Node's global fetch for HTTP operations.
 *
 * NET ALLOWLIST ENFORCEMENT (P5):
 * Every request is checked against context.resource_config.net_allowlist
 * before any network I/O occurs.
 *
 * Allowlist semantics:
 *   - Empty allowlist → deny all (spec-defined default)
 *   - Exact hostname match: 'api.example.com' allows only that host
 *   - Leading wildcard: '*.example.com' allows any subdomain of example.com
 *     but NOT example.com itself (strict subdomain match)
 *   - Raw IP literals are denied unless explicitly listed in the allowlist
 *
 * Redirect policy:
 *   Automatic redirects are DISABLED (redirect: 'manual'). Following
 *   redirects automatically would allow a permitted host to redirect to
 *   a non-allowlisted host, bypassing the allowlist. Callers receive the
 *   3xx response and must handle redirects explicitly if needed.
 *
 * @see docs/specs/architecture.md §P5 (resource scoping — network layer)
 * @see docs/specs/formal_governance.md §5 (I1: deny-by-default)
 * @see docs/specs/capabilities.md §3.D (network capabilities)
 */

import type { NetworkAdapter, AdapterCallContext } from '@archon/kernel';

// ---------------------------------------------------------------------------
// Hostname validation
// ---------------------------------------------------------------------------

/**
 * IPv4 address pattern. Used to detect raw IP literals.
 * Matches dotted-quad notation (e.g. 192.168.1.1).
 */
const IPV4_PATTERN = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;

/**
 * IPv6 address pattern. Detects bracketed IPv6 (from URL.hostname)
 * and bare IPv6 literals.
 */
const IPV6_PATTERN = /^\[?[0-9a-fA-F:]+\]?$/;

/**
 * Check whether a string looks like a raw IP address (v4 or v6).
 */
function isRawIpLiteral(hostname: string): boolean {
  return IPV4_PATTERN.test(hostname) || IPV6_PATTERN.test(hostname);
}

/**
 * Check whether a hostname matches an allowlist entry.
 *
 * Matching rules:
 *   1. Exact match: 'api.example.com' === 'api.example.com'
 *   2. Leading wildcard: '*.example.com' matches 'sub.example.com',
 *      'a.b.example.com', but NOT 'example.com' itself.
 *
 * Comparison is case-insensitive (hostnames are case-insensitive per RFC 4343).
 */
function hostnameMatchesEntry(hostname: string, entry: string): boolean {
  const lowerHost = hostname.toLowerCase();
  const lowerEntry = entry.toLowerCase();

  if (lowerEntry.startsWith('*.')) {
    // Wildcard match: strip the '*' to get '.example.com',
    // then check if hostname ends with that suffix AND is longer
    // (i.e., has at least one subdomain label).
    const suffix = lowerEntry.slice(1); // '.example.com'
    return lowerHost.endsWith(suffix) && lowerHost.length > suffix.length;
  }

  return lowerHost === lowerEntry;
}

/**
 * Validate that a hostname is permitted by the allowlist.
 *
 * @throws {Error} If the allowlist is empty (deny-all default)
 * @throws {Error} If the hostname is a raw IP not explicitly allowlisted
 * @throws {Error} If no allowlist entry matches the hostname
 */
export function assertHostnameAllowed(
  hostname: string,
  allowlist: ReadonlyArray<string>,
): void {
  if (allowlist.length === 0) {
    throw new Error(
      `Network access denied: net_allowlist is empty (deny-all default). ` +
        `Add allowed hostnames via resource configuration to permit network access.`,
    );
  }

  // Check if any entry matches
  const matched = allowlist.some((entry) => hostnameMatchesEntry(hostname, entry));

  if (!matched) {
    if (isRawIpLiteral(hostname)) {
      throw new Error(
        `Network access denied: raw IP literal '${hostname}' is not explicitly allowlisted. ` +
          `Raw IP addresses must be listed explicitly in net_allowlist. ` +
          `Allowlisted hosts: [${allowlist.join(', ')}].`,
      );
    }

    throw new Error(
      `Network access denied: hostname '${hostname}' is not in the project allowlist. ` +
        `Allowlisted hosts: [${allowlist.join(', ')}]. ` +
        `Add the hostname via resource configuration to permit access.`,
    );
  }
}

// ---------------------------------------------------------------------------
// NodeNetworkAdapter
// ---------------------------------------------------------------------------

/**
 * Node.js network adapter with P5 allowlist enforcement.
 *
 * All module network I/O must flow through this adapter — modules must not
 * use fetch or http directly. This adapter enforces the NetworkAdapter contract
 * including P5 hostname allowlist checks.
 *
 * Redirects are disabled (redirect: 'manual') to prevent allowlist bypass.
 * The caller receives the raw 3xx response.
 *
 * @see docs/specs/module_api.md §6
 */
export class NodeNetworkAdapter implements NetworkAdapter {
  /**
   * Execute an HTTP request with allowlist enforcement.
   *
   * @throws {Error} If the URL is malformed
   * @throws {Error} If the hostname is not in the project's net_allowlist
   * @throws {Error} If maxBytes is specified and the response exceeds it
   */
  async fetchHttp(
    url: string,
    options: {
      readonly method: string;
      readonly headers?: Record<string, string> | undefined;
      readonly body?: Uint8Array | undefined;
      readonly maxBytes?: number | undefined;
    },
    context: AdapterCallContext,
  ): Promise<{
    readonly status: number;
    readonly headers: Record<string, string>;
    readonly body: Uint8Array;
  }> {
    // Step 1: Parse URL and extract hostname.
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(
        `Network access denied: malformed URL '${url}'. ` +
          `Provide a valid absolute URL including scheme (e.g. https://api.example.com/path).`,
      );
    }

    const hostname = parsed.hostname;

    // Step 2: Enforce allowlist BEFORE making any request.
    assertHostnameAllowed(hostname, context.resource_config.net_allowlist);

    // Step 3: Execute the request with redirects disabled.
    const fetchHeaders: Record<string, string> = { ...options.headers };
    const response = await fetch(parsed.toString(), {
      method: options.method,
      headers: fetchHeaders,
      body: options.body ?? null,
      redirect: 'manual',
    });

    // Step 4: Read response body.
    const responseBody = new Uint8Array(await response.arrayBuffer());

    // Step 5: Enforce maxBytes if specified.
    if (options.maxBytes !== undefined && responseBody.byteLength > options.maxBytes) {
      throw new Error(
        `Network response exceeded maxBytes limit: ` +
          `received ${responseBody.byteLength} bytes, limit is ${options.maxBytes} bytes. ` +
          `URL: ${url}`,
      );
    }

    // Step 6: Collect response headers into a plain object.
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return {
      status: response.status,
      headers: responseHeaders,
      body: responseBody,
    };
  }
}
