// ========================== backend/audio.state.machine.js ==========================
/**
 * Finite‑state model for a single phone‑call interaction.
 *   LISTENING   – waiting for caller speech
 *   PROCESSING  – running Whisper / GPT, preparing a reply
 *   RESPONDING  – playing TTS back to caller
 *   CANCELLING  – (optional) cancelling playback because caller barged‑in
 */
export const AudioState = Object.freeze({
  LISTENING  : 'LISTENING',
  PROCESSING : 'PROCESSING',
  RESPONDING : 'RESPONDING',
  CANCELLING : 'CANCELLING',
});