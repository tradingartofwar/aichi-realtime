import 'dotenv/config';

import { log } from '../utils/log.js';              // utils is sibling to /ai
import infoCache from '../utils/infoCache.js';      // cached business data
import { request as gpt } from '../utils/gptClient.js';

/* -------------------------------------------------------------------------- */
/*  Static system prompt (interpolates cached JSON + current date)            */
/* -------------------------------------------------------------------------- */
const systemPrompt = `
You are "Aichi," an AI phone assistant for a massage business.

Below is relevant business context (prices, hours, staff, location) and suggested responses.
You may quote or adapt them freely:

${JSON.stringify(infoCache, null, 2)}

Current date: ${new Date().toISOString().slice(0, 10)}

Primary Goals:
1. Maintain conversation context: date, time, duration, staff.
2. Figure out user's intent (schedule, inquiry, smalltalk, fallback, etc.).
3. Return a structured JSON that includes the recommended reply and updated context.
4. **Use EXACT keys** → intent, response_text, updatedContext.  
   Do **NOT** invent keys such as recommended_reply or user_intent.
`.trim();

/* -------------------------------------------------------------------------- */
/*  Main dialogue-management entry point                                      */
/* -------------------------------------------------------------------------- */
export async function analyzeContext(
  userSpeech,
  callContext = {},
  session = null
) {
  /* ---- crude filler-word cleanup ---- */
  const cleanSpeech = userSpeech
    .replace(/^(?:uh+|um+|er+|the)\b[\s,]*/i, '')
    .replace(/\b(?:uh+|um+|er+)\b/gi, '')
    .trim();

  log(`[AI Context] User said: "${cleanSpeech}"`, 'info');
  log(`[AI Context] Call context: ${JSON.stringify(callContext)}`, 'debug');

  /* ---------- Build user prompt ---------- */
  const userPrompt = `
Current conversational state: "${callContext.currentState || 'Unknown'}"
Details collected so far:
- Date:     ${callContext.collectedDetails?.date     || 'not provided'}
- Time:     ${callContext.collectedDetails?.time     || 'not provided'}
- Duration: ${callContext.collectedDetails?.duration || 'not provided'}
- Staff:    ${callContext.collectedDetails?.staff    || 'Any'}
Booking confirmed: ${callContext.bookingConfirmed ? 'Yes' : 'No'}

User speech: "${cleanSpeech}"

Please update the conversation context and clarify the user's intent.
  `.trim();

  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt }
    ];

    const { reply, delta_ms } = await gpt(messages, {
      model: 'gpt-4o-mini',
      temperature: 0.3,
      session
    });

    const rawOutput = reply.trim();
    log(`[LATENCY] AI Context GPT (${delta_ms} ms)`, 'debug');
    log(`[AI Context] GPT output: ${rawOutput}`, 'info');

    /* ---------- Parse + normalize keys ---------- */
    const parsed = JSON.parse(rawOutput);

    if (parsed.recommended_reply && !parsed.response_text) {
      parsed.response_text = parsed.recommended_reply;
    }
    if (parsed.user_intent && !parsed.intent) {
      parsed.intent = parsed.user_intent;
    }

    /* ---------- Post-processing tweak ---------- */
    if (parsed.updatedContext?.userIntention === 'inquire about well-being') {
      parsed.intent         = 'smalltalk';
      parsed.response_text  = "I'm doing great, thank you! How can I help you today?";
      parsed.updatedContext.userIntention = 'smalltalk';
    }

    return parsed;

  } catch (error) {
    log(`[AI Context] Error during GPT call: ${error.message}`, 'error');
    return {
      intent:            'fallback',
      response_text:     "I'm experiencing issues. Could you try again shortly?",
      nextState:         callContext.currentState || 'Initial Greeting',
      check_availability:false,
      appointment_details:{},
      collectedDetails:  callContext.collectedDetails || {},
      bookingConfirmed:  false,
      updatedContext:    { ...callContext, userIntention: 'fallback' }
    };
  }
}
