// backend/utils/infoCache.js
/**
 * Loads ../data/info.json exactly once at start-up and exposes
 * convenience getters so callers never touch the filesystem again.
 */
import fs from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ---- read + parse synchronously once ----
const raw = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/info.json'), 'utf-8')
);

// ---- public helpers --------------------------------------------------------
export const hoursToday = () => {
  const idx = new Date().getDay();       // 0 = Sunday
  return raw.hours?.[idx] ?? 'Unavailable';
};

export const prices = () => raw.prices ?? {};

export default raw;  // full object if a caller really needs everything
