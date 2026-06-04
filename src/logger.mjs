import { appendFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LOG_DIR = join(homedir(), '.claude-cmux-retry', 'logs');
const MAX_AGE_DAYS = 7;

async function ensureDir() {
  await mkdir(LOG_DIR, { recursive: true });
}

function todayFile() {
  return join(LOG_DIR, `${new Date().toISOString().slice(0, 10)}.log`);
}

function formatLine(level, msg) {
  const time = new Date().toTimeString().slice(0, 8);
  return `[${time}] [${level}] ${msg}\n`;
}

export function createLogger() {
  const write = async (level, msg) => {
    const line = formatLine(level, msg);
    try {
      await ensureDir();
      await appendFile(todayFile(), line);
    } catch {}
  };

  return {
    info: (msg) => write('INFO', msg),
    warn: (msg) => write('WARN', msg),
    error: (msg) => write('ERROR', msg),
  };
}

export async function cleanOldLogs() {
  try {
    await ensureDir();
    const files = await readdir(LOG_DIR);
    const cutoff = Date.now() - MAX_AGE_DAYS * 86400_000;

    for (const file of files) {
      if (!file.endsWith('.log')) continue;
      const dateStr = file.replace('.log', '');
      const fileDate = new Date(dateStr).getTime();
      if (fileDate && fileDate < cutoff) {
        await unlink(join(LOG_DIR, file));
      }
    }
  } catch {}
}

export function getLogDir() {
  return LOG_DIR;
}

export function getTodayLogPath() {
  return todayFile();
}
