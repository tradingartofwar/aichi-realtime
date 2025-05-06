/* websocket/vad.processor.js — v7 (21 Apr 2025)
   ▸ tuned for 8 kHz telephony per DR findings
   ▸ flush after 500 ms silence  OR  10 s continuous speech
*/

import axios from 'axios';
import { spawn } from 'child_process';
import { AudioProcessor } from './audio.processor.js';
import { log } from '../utils/log.js';

let lastSileroErrorAt = 0;

export class VADProcessor {
  constructor(sessionManager = null, ws = null, sessionId = '', callSid = '') {
    /* ── DR‑recommended constants ─────────────────────────────────── */
    this.FRAMES_NEEDED     = 25;     // 0.5 s @ 20 ms frames
    this.silenceThreshold  = 500;    // 0.5 s silence → flush
    this.sileroThresh      = 0.8;    // 80 % prob = speech
    this.maxSpeechMs       = 10000;  // 10 s hard cap
    /* ---------------------------------------------------------------- */

    this.sessionManager = sessionManager;
    this.sessionId      = sessionId;
    this.callSid        = callSid;

    this.audioProcessor = new AudioProcessor();

    this.frameBuf   = [];
    this.segmentBuf = [];
    this.isSpeaking = false;
    this.speechStartTime = 0;
    this.lastSpeechTime  = 0;
  }

  /* =============================================================== */
  async handleAudioFrame(ulawFrame, onSpeechDetected = async () => {}) {
    this.frameBuf.push(ulawFrame);
    if (this.frameBuf.length < this.FRAMES_NEEDED) return;

    const block = Buffer.concat(this.frameBuf);
    this.frameBuf.length = 0;

    const pcm        = await this.convertToPCM(block);
    const isSpeech   = await this.querySilero(pcm);
    const now        = Date.now();

    /* ─── inside speech ─── */
    if (isSpeech) {
      if (!this.isSpeaking) {
        this.isSpeaking = true;
        this.speechStartTime = now;
        log('[VAD] 🟢 speech start', 'debug', this.sessionId, this.callSid);
      }
      this.lastSpeechTime = now;
      this.segmentBuf.push(block);
    }

    /* flush #1: silence gap */
    if (!isSpeech &&
        this.isSpeaking &&
        now - this.lastSpeechTime >= this.silenceThreshold) {
      await this.flush(onSpeechDetected);
    }

    /* flush #2: max speech length */
    if (this.isSpeaking &&
        now - this.speechStartTime >= this.maxSpeechMs) {
      log('[VAD] ⏰ max‑speech reached – flushing',
          'debug', this.sessionId, this.callSid);
      await this.flush(onSpeechDetected);
    }
  }

  /* =============================================================== */
  async flush(onSpeechDetected) {
    if (this.segmentBuf.length === 0) return;

    const segment = Buffer.concat(this.segmentBuf);
    const durSec  = (segment.length / 32000).toFixed(2);
    log(`[VAD] 🔔 flush ${durSec}s`, 'info', this.sessionId, this.callSid);

    const tx = await this.audioProcessor.processSpeechSegment(segment);
    log(`[VAD] 📝 "${tx}"`, 'info', this.sessionId, this.callSid);

    if (tx && this.sessionManager) {
      this.sessionManager.setTranscription(tx);
      await onSpeechDetected(tx);
    }

    /* reset for next utterance */
    this.segmentBuf.length = 0;
    this.isSpeaking = false;
  }

  /* ---------------- helpers ---------------- */
  async querySilero(pcm) {
    try {
      const r = await axios.post(
        'http://localhost:8001/vad',
        pcm,
        { headers:{'Content-Type':'application/octet-stream'},
          timeout:2000, params:{threshold:this.sileroThresh} }
      );
      return !!r.data.is_speech;
    } catch (e) {
      const now = Date.now();
      if (now - lastSileroErrorAt > 1000) {
        log(`[VAD] Silero ERR ${e.message}`,
            'error', this.sessionId, this.callSid);
        lastSileroErrorAt = now;
      }
      return false;
    }
  }

  convertToPCM(ulaw) {
    return new Promise((res, rej) => {
      const ff = spawn('ffmpeg', [
        '-f','mulaw','-ar','8000','-ac','1','-i','pipe:0',
        '-filter:a','volume=4.0',
        '-ar','16000','-ac','1','-f','s16le','pipe:1'
      ]);
      let out = Buffer.alloc(0);
      ff.stdout.on('data', d => out = Buffer.concat([out,d]));
      ff.on('close', c => c===0 ? res(out)
                                : rej(new Error(`ffmpeg ${c}`)));
      ff.stdin.end(ulaw);
    });
  }
}
