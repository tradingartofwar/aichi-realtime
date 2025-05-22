import OpenAI from 'openai';
const openai = new OpenAI();

/**
 * Central GPT wrapper with retry + latency hooks.
 * @param {Array<Object>} messages
 * @param {Object}        opts
 * @param {string}        [opts.model='gpt-4o-mini']
 * @param {number}        [opts.temperature=0.7]
 * @param {Object}        [opts.extra]      – extra OpenAI params
 * @param {Object}        [opts.session]    – SessionManager instance
 * @param {number}        [opts.retry=1]    – # of automatic 5xx retries
 */
export async function request(messages, opts = {}) {
  const {
    model        = 'gpt-4o-mini',
    temperature  = 0.7,
    extra        = {},
    session,
    retry        = 1
  } = opts;

  session?.markGPTStart();
  const start = Date.now();

  let resp;
  try {
    resp = await openai.chat.completions.create({
      model,
      messages,
      temperature,
      ...extra
    });
  } catch (err) {
    if (retry > 0 && err.status >= 500) {
      // single recursive retry
      return request(messages, { model, temperature, extra, session, retry: retry - 1 });
    }
    throw err;
  }

  const end = Date.now();
  const usage = resp.usage ?? { prompt_tokens: 0, completion_tokens: 0 };

  const result = {
    reply: resp.choices[0].message.content,
    delta_ms: end - start,
    tokens_in:  usage.prompt_tokens,
    tokens_out: usage.completion_tokens
  };

  session?.markGPTDone(result);
  return result;
}
