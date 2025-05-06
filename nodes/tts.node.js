// nodes/tts.node.js — v4   ← use this version
import fs   from 'fs';
import path from 'path';
import axios from 'axios';

export async function generateSpeech(text, outPath) {
  // pull env vars at call‑time (dotenv already ran in index.js)
  const XI_KEY   = process.env.ELEVENLABS_API_KEY;
  const VOICE_ID = process.env.ELEVENLABS_VOICE_ID;

  console.log(
    '[DEBUG] XI_KEY len:', XI_KEY?.length ?? 'undef',
    '| VOICE_ID:', VOICE_ID ?? 'undef'
  );

  if (!XI_KEY)   throw new Error('ELEVENLABS_API_KEY is undefined — check .env');
  if (!VOICE_ID) throw new Error('ELEVENLABS_VOICE_ID is undefined — check .env');

  const ELEVEN_URL =
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream?optimize_streaming_latency=1`;

  try {
    const response = await axios.post(
      ELEVEN_URL,
      { text, model_id: 'eleven_turbo_v2' },
      {
        responseType: 'arraybuffer',
        headers: { 'xi-api-key': XI_KEY, 'Content-Type': 'application/json' },
        timeout: 10000
      }
    );

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, Buffer.from(response.data));
    return outPath;
  } catch (err) {
    const status = err.response?.status ?? '—';
    const body = typeof err.response?.data === 'object'
                   ? JSON.stringify(err.response.data)
                   : err.response?.data ?? err.message;
    console.error('ElevenLabs error body:', body);
    throw new Error(`ElevenLabs ${status} ${err.response?.statusText ?? ''}`);
  }
}
