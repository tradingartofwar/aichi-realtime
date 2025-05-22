import 'dotenv/config';
import { request as gpt } from '../../utils/gptClient.js';

/**
 * gpt-4o-mini helper.
 * @param {Array<Object>} messages
 * @param {SessionManager} [session=null]
 */
export async function runGPT4OMini(messages, session = null) {
  const fullMessages = [
    {
      role: 'system',
      content:
        "You are Aichi, a multilingual AI assistant. Respond in the same language as the user's query. You can respond in Chinese if asked to respond in Chinese."
    },
    ...messages
  ];

  try {
    const { reply, delta_ms } = await gpt(fullMessages, {
      model: 'gpt-4o-mini',
      temperature: 0.5,
      session
    });

    console.info(`[GPT4OMini] completed in ${delta_ms} ms`);
    return reply.trim();
  } catch (err) {
    console.error('[GPT4OMini Error]:', err);
    return 'Could not complete GPT-4o-mini request.';
  }
}
