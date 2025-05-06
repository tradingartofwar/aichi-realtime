// websocket/tts.handler.js — v16 (fix track ➜ "outbound")
import fs   from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

import { generateSpeech } from '../nodes/tts.node.js';
import { log }            from '../utils/log.js';

export class TTSHandler {
  constructor () {
    this.__dirname = path.dirname(fileURLToPath(import.meta.url));
  }

  /**
   * Render TTS → μ-law, then send a *single* outbound media frame.
   * While ElevenLabs / ffmpeg run we ping every 2 s so Twilio keeps
   * the WebSocket alive.
   */
  async speakViaWebSocket (ws, streamSid, text) {
    log(`[TTS] ⇒ "${text}"`, 'info');

    const ts       = Date.now();
    const base     = `resp-${ts}`;
    const mp3Path  = path.join(this.__dirname, `../audio/${base}.mp3`);
    const ulawPath = path.join(this.__dirname, `../audio/${base}.ulaw`);

    /* keep-alive (empty payload, correct track) */
    const ping = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({
          event : 'media',
          streamSid,
          media : { track: 'outbound', payload: '' }   // ← fixed
        }));
      }
    }, 2000);

    try {
      /* 1️⃣  ElevenLabs */
      await generateSpeech(text, mp3Path);

      /* 2️⃣  mp3 → 8 kHz μ-law  (+6 dB gain) */
      await this.toMulaw(mp3Path, ulawPath);
      const ulaw = await fs.readFile(ulawPath);

      clearInterval(ping);                   // stop keep-alive pings

      /* 3️⃣  single outbound frame (required track) */
      if (ws.readyState === ws.OPEN) {
        ws.isAiSpeaking = true;

        ws.send(JSON.stringify({
          event : 'media',
          streamSid,
          media : {
            track   : 'outbound',            // ← fixed
            payload : ulaw.toString('base64')
          }
        }));
        log('[TTS] ▶️  outbound payload sent');

        /* optional mark so we know Twilio finished playback */
        ws.send(JSON.stringify({
          event : 'mark',
          streamSid,
          mark  : { name: 'endOfTTS' }
        }));

        const durMs = Math.ceil(ulaw.length / 8) + 100;
        setTimeout(() => { ws.isAiSpeaking = false; }, durMs);
      } else {
        log('[TTS] WebSocket closed before send', 'warn');
      }
    } catch (err) {
      clearInterval(ping);
      log(`[TTS] ❌ ${err.message}`, 'error');
    } finally {
      await Promise.allSettled([fs.unlink(mp3Path), fs.unlink(ulawPath)]);
    }
  }

  /** mp3 → μ-law 8 kHz mono (+6 dB) */
  toMulaw (mp3, ulaw) {
    return new Promise((resolve, reject) => {
      const ff = spawn('ffmpeg', [
        '-y', '-i', mp3,
        '-af', 'volume=2.0',
        '-f', 'mulaw', '-ar', '8000', '-ac', '1', ulaw
      ]);
      ff.on('close', c => c === 0 ? resolve()
                                  : reject(new Error(`ffmpeg exit ${c}`)));
      ff.stderr.on('data', d =>
        log('[ffmpeg] ' + d.toString().trim(), 'warn'));
    });
  }
}
