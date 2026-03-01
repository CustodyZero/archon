/**
 * Archon Runtime Host — Context Module (ACM-001)
 *
 * Barrel re-export for all context types, functions, and constants.
 *
 * The context module provides the runtime attribution data (device, user,
 * session, agent) that is embedded in every emitted governance event.
 */

export { ARCHON_VERSION } from './version.js';
export { SCHEMA_VERSION, buildEventEnvelope, makeTestContext } from './event-envelope.js';
export type { RuntimeContext, EventEnvelope } from './event-envelope.js';
export { loadOrCreateDevice } from './device.js';
export type { DeviceContext } from './device.js';
export { loadOrCreateUser } from './user.js';
export type { UserContext } from './user.js';
export { createSession, endSession } from './session.js';
export type { SessionContext } from './session.js';
export { loadOrCreateOperatorAgent } from './agent.js';
export type { AgentContext, AgentRecord } from './agent.js';
