// sessions.js
import { SessionManager } from './websocket/session.manager.js';

/**
 * Map<callSid, SessionManager>
 * Ensures exactly one SessionManager per Twilio call.
 */
const sessions = new Map();

export function getSession(callSid) {
  if (!sessions.has(callSid)) {
    sessions.set(callSid, new SessionManager(callSid));
  }
  return sessions.get(callSid);
}
