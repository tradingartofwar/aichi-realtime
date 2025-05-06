// ai/ai.context.js
import OpenAI from 'openai';
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { log } from '../utils/log.js'; // remains correct if "utils" is sibling

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Now we use local path from __dirname, not process.cwd()
const infoPath = path.join(__dirname, '../data/info.json');
const businessData = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));

const systemPrompt = `
You are "Aichi," an AI phone assistant for a massage business.

Below is relevant business context (prices, hours, staff, location) and suggested responses. You may use them verbatim or adapt them:

${JSON.stringify(businessData, null, 2)}

Current date: ${new Date().toISOString().slice(0, 10)}

Primary Goals:
1. Maintain conversation context: date, time, duration, staff.
2. Figure out user's intent (schedule, inquiry, smalltalk, fallback, etc.).
3. Return a structured JSON that includes the recommended reply and updated context.

Always respond ONLY with valid JSON in this format:
{
  "intent": "schedule | inquiry | smalltalk | fallback | etc.",
  "response_text": "...",
  "nextState": "...",
  "check_availability": false,
  "appointment_details": { "date": "", "time": "", "duration": "", "staff": "" },
  "collectedDetails": { "date": "", "time": "", "duration": "", "staff": "" },
  "bookingConfirmed": false,
  "updatedContext": {
    "currentState": "...",
    "collectedDetails": { "date": "", "time": "", "duration": "", "staff": "" },
    "bookingConfirmed": false,
    "userIntention": "..."
  }
}
`;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function analyzeContext(userSpeech, callContext = {}) {
  log(`[AI Context] User said: "${userSpeech}"`, 'info');
  log(`[AI Context] Call context: ${JSON.stringify(callContext)}`, 'debug');

  const userPrompt = `
Current conversational state: "${callContext.currentState || 'Unknown'}"
Details collected so far:
- Date: ${callContext.collectedDetails?.date || 'not provided'}
- Time: ${callContext.collectedDetails?.time || 'not provided'}
- Duration: ${callContext.collectedDetails?.duration || 'not provided'}
- Staff: ${callContext.collectedDetails?.staff || 'Any'}
Booking confirmed: ${callContext.bookingConfirmed ? 'Yes' : 'No'}

User speech: "${userSpeech}"

Please update the conversation context and clarify the user's intent.
  `;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3
    });

    const rawOutput = response.choices[0].message.content.trim();
    log(`[AI Context] GPT output: ${rawOutput}`, 'info');

    const parsed = JSON.parse(rawOutput);

    if (parsed.updatedContext?.userIntention === 'inquire about well-being') {
      parsed.intent = 'smalltalk';
      parsed.response_text = "I'm doing great, thank you! How can I help you today?";
      parsed.updatedContext.userIntention = 'smalltalk';
    }

    return parsed;

  } catch (error) {
    log(`[AI Context] Error during GPT call: ${error.message}`, 'error');
    return {
      intent: "fallback",
      response_text: "I'm experiencing issues. Could you try again shortly?",
      nextState: callContext.currentState || "Initial Greeting",
      check_availability: false,
      appointment_details: {},
      collectedDetails: callContext.collectedDetails || {},
      bookingConfirmed: false,
      updatedContext: {
        ...callContext,
        userIntention: "fallback"
      }
    };
  }
}
