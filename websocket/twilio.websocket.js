/* v11 – per-turn latency marks + filler-clean GPT */
/* streaming Whisper + latency markers (fixed TTS arg order) */
import { WebSocketServer } from 'ws';
import path               from 'path';
import { fileURLToPath }  from 'url';
import dotenv             from 'dotenv';

import { AudioCapture  } from './audio.capture.js';
import { WhisperStream } from './whisper.stream.js';
import { getSession    } from '../sessions.js';
import { TTSHandler    } from './tts.handler.js';

import { analyzeContext } from '../ai/ai.context.js';
import { routeDecision  } from '../ai/ai.router.js';
import { AudioState     } from '../audio.state.machine.js';
import { log            } from '../utils/log.js';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

export function setupTwilioWebSocket () {
  const PORT = 8080;
  const wss  = new WebSocketServer({ port: PORT });
  log(`[WS] listening on :${PORT}`, 'info');

  wss.on('connection', (ws) => {
    let callSid   = '';
    let session   = null;
    let whisper   = null;                  // streaming STT helper

    const audioCap = new AudioCapture();
    const tts      = new TTSHandler();

    /* ---------- handler when Whisper returns final transcript ---------- */
    const handleTranscript = async (text) => {
      if (!text || session.checkDuplicateTranscription(text)) return;
      if (session.getState() !== AudioState.LISTENING) return;

      /* mark STT latency as soon as first final text arrives */
      session.mark('stt_done');

      session.setState(AudioState.PROCESSING);

      const ctxOut = await analyzeContext(text, session.getContext(), session);
      session.updateContext(ctxOut.updatedContext);
      session.setTranscription(text);
      routeDecision(ctxOut);

      session.setState(AudioState.RESPONDING);

      /* pass only (ws, streamSid, text) */
      await tts.speakViaWebSocket(
        ws,
        session.context.streamSid,
        ctxOut.response_text
      );
      session.setFinalPrompt(ctxOut.response_text);

      /* back to listening + dump latency summary */
      setTimeout(() => {
        session.setState(AudioState.LISTENING);
        session.dumpTimingAndReset();

        /* start next-turn latency baseline */
        session.mark('ws_start');
      }, 400);
    };

    /* ----------------- Twilio media WS events ----------------- */
    ws.on('message', async (raw) => {
      let data;
      try { data = JSON.parse(raw); } catch { return; }

      if (data.event === 'start') {
        callSid  = data.start.callSid;
        session  = getSession(callSid);

        session.mark('ws_start');             // first turn baseline
        session.startCall(callSid);
        session.setStreamSid(data.streamSid);

        /* start streaming Whisper and tie AudioCapture to it */
        whisper = new WhisperStream(handleTranscript, session);
        await whisper.connect();

        audioCap.startCapturing(ws, whisper); // forward μ-law frames
      }
    });

    ws.on('close', (c, r) => {
      whisper?.close();
      session?.endCallSummary();
      log(`[WS] closed ${c} — ${r}`, 'info', session?.sessionId, callSid);
    });

    ws.on('error', err =>
      log(`[WS] error: ${err.message}`, 'error', session?.sessionId, callSid));
  });
}
