import fs from 'fs';
import path from 'path';

import { DATA_DIR } from './config.js';

const EVENTS_DIR = path.join(DATA_DIR, 'events');

export function emitEvent(event: Record<string, unknown>): void {
  try {
    fs.mkdirSync(EVENTS_DIR, { recursive: true });
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
    const filepath = path.join(EVENTS_DIR, filename);
    const tempPath = `${filepath}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(event));
    fs.renameSync(tempPath, filepath);
  } catch {
    // Silently fail — events are non-critical telemetry
  }
}
