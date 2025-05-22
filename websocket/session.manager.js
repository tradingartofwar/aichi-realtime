// ============================ websocket/session.manager.js ============================
import { log }        from '../utils/log.js';
import { AudioState } from '../audio.state.machine.js';

export class SessionManager {
  constructor () {
    this.sessionId       = `aichi-${Date.now()}`;
    this.callSid         = '';
    this.callStartTime   = null;

    /* -------- conversation data -------- */
    this.speechSegments  = [];
    this.transcription   = '';
    this.turn            = 0;               // conversation turn counter
    this.history         = [];              // rolling [{role, content}]
    this.summary         = '';              // 1-3 sentence recap

    this.routedToAI      = false;
    this.finalPrompt     = '';

    /* explicit finite-state tracker */
    this.state           = AudioState.LISTENING;

    /* structured slots (will expand later) */
    this.context = {
      previousQuestions   : [],
      userIntention       : null,
      userName            : null,
      lastInteractionTime : Date.now(),
      streamSid           : null,
      currentState        : 'Initial Greeting',
      collectedDetails    : { date: null, time: null, duration: null, staff: 'Any' },
      bookingConfirmed    : false
    };

    this.lastTranscription     = null;
    this.lastTranscriptionTime = 0;

    /* ---- latency marks ---- */
    this.marks = {};
  }

  /* ---------------- latency helpers ---------------- */
  mark(label)            { this.marks[label] = performance.now(); }
  markGPTStart()         { this.mark('gpt_start'); }
  markGPTDone(meta) {
    this.mark('gpt_done');
    console.info(JSON.stringify({
      session:     this.sessionId,
      turn:        this.turn || 0,
      gpt_ms:      meta.delta_ms,
      tokens_in:   meta.tokens_in,
      tokens_out:  meta.tokens_out
    }));
  }

  dumpTimingAndReset () {
    if (!this.marks.ws_start) this.marks.ws_start = performance.now();
    const base = this.marks.ws_start;
    const msg  = Object.entries(this.marks)
      .map(([k,v]) => `${k}: ${(v - base).toFixed(0)} ms`).join(' | ');
    log(`[TIMING] ${msg}`, 'info', this.sessionId, this.callSid);
    this.marks = {};
  }

  /* --------------------------- STATE HELPERS --------------------------- */
  getState() { return this.state; }
  setState(next) {
    const prev = this.state;
    if (prev === next) return;
    this.state = next;
    log(`[STATE] ${prev} → ${next}`,'debug', this.sessionId, this.callSid);
  }

  /* -------------------------- CALL LIFECYCLE -------------------------- */
  startCall(callSid) {
    this.callSid       = callSid;
    this.callStartTime = Date.now();
    this.setState(AudioState.LISTENING);
    log(`[CALL] Started call`, 'info', this.sessionId, this.callSid);
  }

  addSpeechSegment(startTime, endTime, text) {
    const duration = (endTime - startTime) / 1000;
    this.speechSegments.push({ start: startTime / 1000, end: endTime / 1000, duration, text });
    log(`[CALL] Added speech segment (${duration}s)`, 'info', this.sessionId, this.callSid);
  }

  /* --------------------- NEW: transcription & history ------------------ */
  setTranscription(text) {
    this.transcription = text;
    this.turn += 1;
    this.history.push({ role: 'user', content: text });    // keep last utterance
    log(`[CALL] Transcription set: "${text}" (Turn: ${this.turn})`, 'info', this.sessionId, this.callSid);
  }

  /* ------------- history / summary getters (for contextBuilder) -------- */
  getHistory()       { return this.history; }
  getSummary()       { return this.summary; }
  setSummary(txt='') { this.summary = txt; }

  /* --------------------- misc call flags & context --------------------- */
  setRoutedToAI(status)      { this.routedToAI = status;  log(`[CALL] Routed to AI: ${status}`, 'info', this.sessionId, this.callSid); }
  setFinalPrompt(prompt)     { this.finalPrompt = prompt; log(`[CALL] Final prompt: "${prompt}"`, 'info', this.sessionId, this.callSid); }
  updateContext(newContext)  { log(`[CALL] Updating context: ${JSON.stringify(newContext)}`, 'debug', this.sessionId, this.callSid); this.context = { ...this.context, ...newContext }; }
  getContext()               { return this.context; }
  setStreamSid(streamSid)    { this.context.streamSid = streamSid; log(`[CALL] Stream SID set: ${streamSid}`, 'debug', this.sessionId, this.callSid); }

  /* ------------- duplicate-transcript suppression ------------- */
  checkDuplicateTranscription(txt) {
    const now = Date.now();
    if (txt === this.lastTranscription && now - this.lastTranscriptionTime < 3000) {
      log(`[CALL] Duplicate transcription ignored`, 'debug', this.sessionId, this.callSid);
      return true;
    }
    this.lastTranscription     = txt;
    this.lastTranscriptionTime = now;
    return false;
  }

  /* ------------------------- SUMMARY & END ------------------------- */
  endCallSummary() {
    const total = this.callStartTime ? (Date.now() - this.callStartTime) / 1000 : 0;
    const summary = [
      '[CALL] Call Summary:',
      `  Session ID         : ${this.sessionId}`,
      `  Total Duration     : ${total}s`,
      '  Speech Segments    :',
      ...this.speechSegments.map(s => `    • ${s.duration}s ("${s.text.slice(0,20)}…")`),
      `  Final Transcript   : "${this.transcription.slice(0,50)}…"`,
      `  Routed to AI       : ${this.routedToAI ? '✅' : '❌'}`,
      `  Final Prompt       : "${this.finalPrompt}"`,
    ].join('\n');
    log(summary,'info', this.sessionId, this.callSid);
  }
}
