// ai/ai.router.js
import { log } from '../utils/log.js'; // ✅ Add this

export function routeDecision(aiContextOutput) {
  const intent = aiContextOutput.intent || "fallback";
  log(`[Router] Received intent: "${intent}"`, 'info');

  switch (intent) {
    case 'schedule':
      log('[Router] Routing to: schedule', 'debug');
      return { route: 'schedule', reason: 'User wants to schedule an appointment.' };
    case 'inquiry':
      log('[Router] Routing to: inquiry', 'debug');
      return { route: 'inquiry', reason: 'User has a general question or info request.' };
    case 'smalltalk':
      log('[Router] Routing to: smalltalk', 'debug');
      return { route: 'smalltalk', reason: 'User is engaging in small talk or casual conversation.' };
    default:
      log('[Router] Routing to: fallback', 'warn');
      return { route: 'fallback', reason: 'No clear or recognized intent.' };
  }
}
