// ============================ websocket/session.manager.js ============================
import { log }         from '../utils/log.js';
import { AudioState }  from '../audio.state.machine.js';

export class SessionManager {
  constructor () {
    this.sessionId       = `aichi-${Date.now()}`;
    this.callSid         = '';
    this.callStartTime   = null;
    this.speechSegments  = [];
    this.transcription   = '';
    this.routedToAI      = false;
    this.finalPrompt     = '';

    /* explicit finite-state tracker */
    this.state           = AudioState.LISTENING;

    this.context = {
      previousQuestions   : [],
      userIntention       : null,
      userName            : null,
      lastInteractionTime : Date.now(),
      streamSid           : null,
      currentState        : 'Initial Greeting',
      collectedDetails    : { date: null, time: null, duration: null, staff: 'Any' },
      bookingConfirmed    : false,
    };

    this.lastTranscription     = null;
    this.lastTranscriptionTime = 0;

    /* ---- latency marks ---- */
    this.marks = {};
  }

  /* ---------------- latency helpers ---------------- */
  /** record a timestamp for later diffing */
  mark(label) { this.marks[label] = performance.now(); }

  /** log the timings and clear the slate */
  dumpTimingAndReset () {
    if (!this.marks.ws_start) { this.marks.ws_start = performance.now(); }
    const base = this.marks.ws_start;
    const msg  = Object.entries(this.marks)
      .map(([k,v]) => `${k}: ${(v - base).toFixed(0)} ms`)
      .join(' | ');
    log(`[TIMING] ${msg}`, 'info', this.sessionId, this.callSid);
    this.marks = {};
  }

  /* --------------------------- STATE HELPERS --------------------------- */
  getState ()               { return this.state; }
  setState (next) {
    const prev = this.state;
    if (prev === next) return;
    this.state = next;
    log(`[STATE] ${prev} → ${next}`,'debug', this.sessionId, this.callSid);
  }

  /* -------------------------- CALL LIFECYCLE -------------------------- */
  startCall (callSid) {
    this.callSid       = callSid;
    this.callStartTime = Date.now();
    this.setState(AudioState.LISTENING);
    log(`[CALL] Started call`, 'info', this.sessionId, this.callSid);
  }

  addSpeechSegment (startTime, endTime, text) {
    const duration = (endTime - startTime) / 1000;
    this.speechSegments.push({ start: startTime / 1000, end: endTime / 1000, duration, text });
    log(`[CALL] Added speech segment (${duration}s)`, 'info', this.sessionId, this.callSid);
  }

  setTranscription (text) {
    this.transcription = text;
    log(`[CALL] Transcription set: "${text}"`, 'info', this.sessionId, this.callSid);
  }

  setRoutedToAI (status) {
    this.routedToAI = status;
    log(`[CALL] Routed to AI: ${status}`, 'info', this.sessionId, this.callSid);
  }

  setFinalPrompt (prompt) {
    this.finalPrompt = prompt;
    log(`[CALL] Final prompt: "${prompt}"`, 'info', this.sessionId, this.callSid);
  }

  updateContext (newContext) {
    log(`[CALL] Updating context: ${JSON.stringify(newContext)}`, 'debug', this.sessionId, this.callSid);
    this.context = { ...this.context, ...newContext };
  }
  getContext   () { return this.context; }

  setStreamSid (streamSid) {
    this.context.streamSid = streamSid;
    log(`[CALL] Stream SID set: ${streamSid}`, 'debug', this.sessionId, this.callSid);
  }

  /* ------------- duplicate-transcript suppression ------------- */
  checkDuplicateTranscription (txt) {
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
  endCallSummary () {
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
