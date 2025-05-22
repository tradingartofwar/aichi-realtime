// websocket/whisper.stream.js — v1.3
// Adds 300 ms debounce so stt_done fires after *last* final transcript

import WebSocket from 'ws';
import { log }   from '../utils/log.js';

const FINAL_DEBOUNCE_MS = 300;   // wait this long for another final

export class WhisperStream {
  /**
   * @param {(text:string)=>void} onFinal
   * @param {object|null}         session   SessionManager for latency marks
   */
  constructor(onFinal, session = null) {
    this.onFinal     = onFinal;
    this.session     = session;
    this.ws          = null;

    /* debounce state */
    this._finalTimer = null;
    this._pendingTxt = '';
  }

  /** open the WS connection */
  async connect() {
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
          const txt = (msg.text || '').trim();
          if (!txt) return;

          /* accumulate & debounce */
          this._pendingTxt = this._pendingTxt
            ? `${this._pendingTxt} ${txt}`.trim()
            : txt;

          clearTimeout(this._finalTimer);
          this._finalTimer = setTimeout(() => {
            /* last final for this turn */
            this.session?.mark?.('stt_done');
            log(`[Whisper] ✔ final: "${this._pendingTxt}"`, 'info');
            this.onFinal(this._pendingTxt);

            /* reset for next turn */
            this._pendingTxt = '';
            this._finalTimer = null;
          }, FINAL_DEBOUNCE_MS);
        }
      });

      this.ws.on('error', (e) => {
        log(`[Whisper] WS error ${e.message}`, 'error');
        rej(e);
      });
    });
  }

  /** send one raw μ-law frame (20 ms = 160 B) */
  sendFrame(frame) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(frame);
  }

  close() { this.ws?.close(); }
}
