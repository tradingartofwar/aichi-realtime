import 'dotenv/config';
import { request as gpt } from '../../utils/gptClient.js';   // ← corrected

/**
 * o3-mini helper.
 * @param {string} userPrompt
 * @param {SessionManager} [session=null]
 */
export async function runO3Mini(userPrompt, session = null) {
  const messages = [
    { role: 'system', content: 'You are a concise AI assistant.' },
    { role: 'user',   content: userPrompt }
  ];

  try {
    const { reply, delta_ms } = await gpt(messages, {
      model: 'o3-mini',
      temperature: 0.5,
      session
    });

    console.info(`[O3Mini] completed in ${delta_ms} ms`);
    return reply.trim();
  } catch (err) {
    console.error('[O3Mini Error]:', err);
    return 'Could not complete o3-mini request.';
  }
}
