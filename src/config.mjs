import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_PATH = join(homedir(), '.claude-cmux-retry.json');

const DEFAULTS = {
  maxRetries: 5,
  pollIntervalSeconds: 5,
  marginSeconds: 60,
  fallbackWaitHours: 5,
  retryMessage: 'Continue where you left off. The previous attempt was rate limited.',
  customPatterns: [],
};

export async function loadConfig() {
  try {
    const raw = await readFile(CONFIG_PATH, 'utf-8');
    const user = JSON.parse(raw);

    if (user.customPatterns) {
      user.customPatterns = user.customPatterns.filter(p => {
        try { new RegExp(p); return true; } catch { return false; }
      });
    }

    return { ...DEFAULTS, ...user };
  } catch {
    return { ...DEFAULTS };
  }
}
