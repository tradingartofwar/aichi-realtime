export function log(message, level = 'info', sessionId = '', callSid = '') {
  const levelPriority = { debug: 0, info: 1, warn: 2, error: 3 };
  const currentLevel = process.env.LOG_LEVEL || 'info';

  if (levelPriority[level] >= levelPriority[currentLevel]) {
    const timestamp = new Date().toISOString();
    const tagMatch = message.match(/^\[([^\]]+)\]/);
    const tag = tagMatch ? tagMatch[1] : '';
    const cleanMessage = tagMatch ? message.replace(/^\[[^\]]+\]\s*/, '') : message;
    const formattedMessage = `${timestamp} [${tag || level.toUpperCase()}] ${cleanMessage}` +
      (sessionId || callSid ? ` (sessionId: ${sessionId}, callSid: ${callSid})` : '');
    console.log(formattedMessage);
  }
}