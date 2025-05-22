// ========================= websocket/audio.capture.js =========================
// 200 ms jitter-buffer + forwards to streaming Whisper
// v2.0 – first-frame ws_start marker

import { log } from '../utils/log.js';
import { AudioState } from '../audio.state.machine.js';   // NEW
import fs from 'fs';

const KEEP_RAW     = process.env.DEBUG_AUDIO === '1';
const FRAME_BYTES  = 160;      // 20 ms μ-law @8 kHz mono
const CHUNK_FRAMES = 10;       // 10×20 ms = 200 ms
const CHUNK_BYTES  = FRAME_BYTES * CHUNK_FRAMES;

export class AudioCapture {
  constructor () {
    this._buf      = Buffer.alloc(0);
    this._inTurn   = false;         // have we marked ws_start for this user utterance?
  }

  /* ------------------------ INGRESS ------------------------ */
  startCapturing (ws, whisper) {    // whisper carries the session reference
    ws.on('message', (msg) => {
      let data;
      try { data = JSON.parse(msg); } catch { return; }
      if (data.event !== 'media' || !data.media?.payload) return;

      const frame = Buffer.from(data.media.payload, 'base64');

      /* -------- Per-turn latency mark -------- */
      const session = whisper?.session;
      if (session && session.getState?.() === AudioState.LISTENING) {
        if (!this._inTurn) {
          session.mark('ws_start');       // FIRST frame of this utterance
          this._inTurn = true;
        }
      } else {
        this._inTurn = false;             // AI is talking / processing
      }

      /* push straight to Whisper */
      whisper?.sendFrame(frame);

      /* keep small rolling buffer (optional) */
      this._buf = Buffer.concat([this._buf, frame]);
      if (this._buf.length > CHUNK_BYTES) {
        this._buf = this._buf.subarray(this._buf.length - CHUNK_BYTES);
      }

      if (KEEP_RAW) fs.appendFileSync('raw_dump.ulaw', frame);
    });

    ws.on('close', () => log('[AudioCapture] socket closed', 'info'));
  }

  /* ------------------------ utility ------------------------ */
  reset () {
    this._buf = Buffer.alloc(0);
    this._inTurn = false;
    log('[AudioCapture] buffer reset', 'debug');
  }
}
