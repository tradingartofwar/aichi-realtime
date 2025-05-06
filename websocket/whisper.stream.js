// websocket/whisper.stream.js — v1.2
//
// Opens a persistent WebSocket to the streaming-Whisper server,
// forwards 20-ms μ-law frames, and calls onFinal(text) whenever
// a final result arrives.
//
// • Uses env var **WHISPER_WS_URL** – falls back to
//   `ws://localhost:8002`  (matches faster_stt_server.py).

import WebSocket from 'ws';
import { log }   from '../utils/log.js';

export class WhisperStream {
  /**
   * @param {(text:string)=>void} onFinal
   * @param {object|null}         session   SessionManager for latency marks
   */
  constructor(onFinal, session = null) {
    this.onFinal = onFinal;
    this.session = session;
    this.ws      = null;
  }

  /** open the WS connection */
  async connect() {
    /* read from .env or default */
    const WS_URL = process.env.WHISPER_WS_URL || 'ws://localhost:8002';

    return new Promise((res, rej) => {
      this.ws = new WebSocket(WS_URL);

      this.ws.on('open', () => {
        log(`[Whisper] WS open → ${WS_URL}`, 'info');
        res();
      });

      this.ws.on('message', (buf) => {
        let msg;
        try { msg = JSON.parse(buf.toString()); } catch { return; }

        if (msg.is_final) {
          this.session?.mark?.('stt_done');          // latency mark
          const txt = (msg.text || '').trim();
          log(`[Whisper] ✔ final: "${txt}"`, 'info');
          if (txt) this.onFinal(txt);
        }
      });

      this.ws.on('error', (e) => {
        log(`[Whisper] WS error ${e.message}`, 'error');
        rej(e);                                      // fail connect()
      });
    });
  }

  /** send one raw μ-law frame (20 ms = 160 B) */
  sendFrame(frame) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(frame);
  }

  close() { this.ws?.close(); }
}
