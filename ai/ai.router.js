import { log } from '../utils/log.js';

export function routeDecision(aiContextOutput) {
  /* ---------- guard missing keys ---------- */
  if (!aiContextOutput.response_text) {
    log('[Router] Missing response_text – forcing apology fallback', 'error');
    aiContextOutput.response_text = "I'm sorry, I didn’t catch that. Could you please repeat?";
    aiContextOutput.intent        = 'fallback';
  }

  const intent = aiContextOutput.intent || 'fallback';
  log(`[Router] Received intent: "${intent}"`, 'info');

  switch (intent) {
    case 'schedule':
      log('[Router] Routing to: schedule', 'debug');
      return { route: 'schedule', reason: 'User wants to schedule an appointment.' };

    case 'inquiry':
      log('[Router] Routing to: inquiry', 'debug');
      return { route: 'inquiry', reason: 'User has a question or info request.' };

    case 'smalltalk':
      log('[Router] Routing to: smalltalk', 'debug');
      return { route: 'smalltalk', reason: 'User is engaging in small talk.' };

    default:
      log('[Router] Routing to: fallback', 'warn');
      return { route: 'fallback', reason: 'No clear or recognized intent.' };
  }
}
