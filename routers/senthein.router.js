/* routers/senthein.router.js — 28 Apr 2025 (v5) */
import express from 'express';
import path    from 'path';
import { fileURLToPath } from 'url';

import { analyzeContext } from '../ai/ai.context.js';
import { routeDecision   } from '../ai/ai.router.js';
import { SessionManager  } from '../websocket/session.manager.js';
import { generateSpeech  } from '../nodes/tts.node.js';

const router    = express.Router();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessions  = new SessionManager();

/* ───────── initial webhook ───────── */
router.post('/', (req, res) => {
  console.log('\n[Senthein] ===== Incoming Twilio webhook =====');
  console.log('[Headers]', JSON.stringify(req.headers, null, 2));
  console.log('[Body]',    JSON.stringify(req.body,    null, 2));

  const wsURL   = process.env.WEBSOCKET_URL;              // wss://…
  const greetMP3= `${process.env.NGROK_URL}/audio/greeting.mp3`;

  /*  one-line, validator-safe TwiML  – NO track attribute  */
  const twiml =
    `<Response>` +
      `<Play>${greetMP3}</Play>` +
      `<Connect><Stream url="${wsURL}" maxIdleTime="30000"/></Connect>` +
    `</Response>`;

  console.log('[Senthein] TwiML sent:\n', twiml);

  res.type('text/xml').send(twiml);
});

/* ───────── /handle-response endpoint (unchanged) ───────── */
router.post('/handle-response', async (req, res) => {
  console.log('\n[Senthein] ===== /handle-response =====');
  console.log('[Payload]', JSON.stringify(req.body, null, 2));

  try {
    const userSpeech = req.body.SpeechResult ?? '';
    console.log('[User Speech]', userSpeech);

    const ctx    = sessions.getContext();
    const ctxOut = await analyzeContext(userSpeech, ctx);
    sessions.updateContext(ctxOut.updatedContext);

    const routing = routeDecision(ctxOut);
    console.log('[Routing]', routing);

    const file = 'conv_response.mp3';
    await generateSpeech(
      ctxOut.response_text,
      path.join(__dirname, '../audio', file)
    );

    const url = `${process.env.NGROK_URL}/audio/${file}`;
    const follow = `<Response><Play>${url}</Play></Response>`;
    res.type('text/xml').send(follow);
    console.log('[Senthein] Follow-up TwiML:\n', follow);
  } catch (err) {
    console.error('[Senthein] /handle-response error:', err);
    res.status(500)
       .type('text/xml')
       .send('<Response><Say>Error occurred.</Say></Response>');
  }
});

export default router;
