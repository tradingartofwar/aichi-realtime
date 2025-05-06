// ========================= websocket/audio.capture.js =========================
// 200 ms jitter-buffer + now forwards to streaming Whisper

import { log } from '../utils/log.js';
import fs       from 'fs';

const KEEP_RAW     = process.env.DEBUG_AUDIO === '1';
const FRAME_BYTES  = 160;      // 20 ms μ-law @8 kHz mono
const CHUNK_FRAMES = 10;       // 10×20 ms = 200 ms
const CHUNK_BYTES  = FRAME_BYTES * CHUNK_FRAMES;

export class AudioCapture {
  constructor () {
    this._buf = Buffer.alloc(0);
  }

  /* ------------------------ INGRESS ------------------------ */
  startCapturing (ws, whisper) {
    ws.on('message', (msg) => {
      let data;
      try { data = JSON.parse(msg); } catch { return; }
      if (data.event !== 'media' || !data.media?.payload) return;

      const frame = Buffer.from(data.media.payload, 'base64');

      /* NEW → push straight to Whisper */
      whisper?.sendFrame(frame);

      /* keep a small rolling buffer (optional, e.g., for re-sends) */
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
    log('[AudioCapture] buffer reset', 'debug');
  }
}
