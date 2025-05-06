/** backend/node.server/index.js */
import express          from 'express';
import dotenv           from 'dotenv';
import cors             from 'cors';
import morgan           from 'morgan';
import path             from 'path';
import { fileURLToPath } from 'url';
import fs               from 'fs';

import sentheinRouter       from '../routers/senthein.router.js';
import { generateSpeech }   from '../nodes/tts.node.js';
import { setupTwilioWebSocket } from '../websocket/twilio.websocket.js';

/* ------------------------------------------------------------------
   Resolve the backend root and load ../.env even when we run from the
   node.server/ folder
------------------------------------------------------------------- */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

console.log('[Startup] NGROK_URL:',     process.env.NGROK_URL);
console.log('[Startup] WEBSOCKET_URL:', process.env.WEBSOCKET_URL);

const app = express();
app.use(express.json());
app.use(cors());
app.use(morgan('dev'));

/* Log incoming requests (optional, can disable in prod) */
app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.url} - Body:`,
    req.body
  );
  next();
});

/* Static audio (greeting, responses) */
app.use('/audio', express.static(path.join(__dirname, '../audio')));

/* Twilio webhook */
app.use('/api/calls/webhook', sentheinRouter);

/* -------------------------------------------------------- */
/* Greeting generation (runs once at startup if missing)    */
const greetingAudioPath = path.join(__dirname, '../audio', 'greeting.mp3');

async function createGreeting() {
  console.log('[Startup] Checking for greeting audio...');
  if (!fs.existsSync(greetingAudioPath)) {
    console.log('[Startup] Generating greeting audio...');
    const greetingText =
      "Thank you for calling. All our therapists are currently busy. I'm Aichi, an advanced AI created to help. Would you like to schedule or ask a question?";
    await generateSpeech(greetingText, greetingAudioPath);
    console.log('[Startup] Greeting audio generation complete.');
  } else {
    console.log('[Startup] Greeting audio found, skipping generation.');
  }
}

/* Catch‑all 404 */
app.use((req, res) => {
  console.log(`[Server] Unhandled request: ${req.method} ${req.url}`);
  res.status(404).send('Not Found');
});

/* Boot the server + WebSocket */
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  await createGreeting();
  console.log(`[Server] Aichi backend running at http://localhost:${PORT}`);
  setupTwilioWebSocket();
});
