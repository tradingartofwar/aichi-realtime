import axios from 'axios';
import { spawn } from 'child_process';
import { log }   from '../utils/log.js';

export class AudioProcessor {
  constructor () {
    this.previousTranscriptionEnd = '';
  }

  /* ─────────────────────────────── called by VAD ─── */
  async processSpeechSegment (pcmBuf) {
    log(`[AudioProcessor] ⏩ segment ${pcmBuf.length} B`, 'info');
    return await this.transcribe(pcmBuf);
  }

  /* ─────────────────────────────── core ──────────── */
  async transcribe (rawBuf) {
    try {
      const pcm = await this.convertToPCM(rawBuf);        // ← always converts

      const dur = (pcm.length / 32000).toFixed(2);
      log(`[AudioProcessor] → Whisper  ${dur}s`, 'debug');

      const { data } = await axios.post(
        'http://localhost:8000/transcribe?language=en',
        pcm,
        { headers:{'Content-Type':'application/octet-stream'} }
      );

      let txt = (data.text || '').trim();
      txt     = this.deduplicate(txt);
      log(`[AudioProcessor] 📝 "${txt}"`, 'info');
      return txt || null;
    } catch (err) {
      log(`[AudioProcessor] ❌ ${err.message}`, 'error');
      return null;
    }
  }

  deduplicate (t) {
    const ov = this.previousTranscriptionEnd.split(' ').slice(-5).join(' ');
    if (ov && t.startsWith(ov)) t = t.slice(ov.length).trim();
    this.previousTranscriptionEnd = t.split(' ').slice(-5).join(' ');
    return t;
  }

  /* ─────────────────────────────── μ‑law → PCM ───── */
  convertToPCM (buf) {
    return new Promise((res,rej) => {
      const ff = spawn('ffmpeg', [
        '-f','mulaw','-ar','8000','-ac','1','-i','pipe:0',
        '-ar','16000','-ac','1','-f','s16le','pipe:1'
      ]);
      let out = Buffer.alloc(0);
      ff.stdout.on('data', d => out = Buffer.concat([out,d]));
      ff.stderr.on('data', d => log(`[ffmpeg] ${d}`, 'warn'));
      ff.on('close', c => c === 0 ? res(out) : rej(new Error(`ffmpeg ${c}`)));
      ff.stdin.end(buf);
    });
  }
}
