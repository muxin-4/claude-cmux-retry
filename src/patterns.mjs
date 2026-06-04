const CSI_REGEX = /\x1b\[[\x20-\x3f]*[\x40-\x7e]/g;
const OSC_REGEX = /\x1b\][\s\S]*?(?:\x07|\x1b\\)/g;
const DCS_REGEX = /\x1bP[\s\S]*?(?:\x07|\x1b\\)/g;
const OTHER_ESC_REGEX = /\x1b[_X^][\s\S]*?(?:\x07|\x1b\\)/g;

export function stripAnsi(text) {
  return text
    .replace(OSC_REGEX, '')
    .replace(DCS_REGEX, '')
    .replace(OTHER_ESC_REGEX, '')
    .replace(CSI_REGEX, '');
}

const LIMIT_PATTERNS = [
  /(?:hit|exceeded|reached).*(?:your|the)\s*(?:\d+-hour\s+)?limit/i,
  /\d+-hour limit/i,
  /limit reached/i,
  /usage limit/i,
  /out of.*usage/i,
  /rate limit/i,
  /try again in/i,
];

const RESET_PATTERNS = [
  /resets?\s+(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)?/i,
  /resets?\s+in[:\s]\s*\d/i,
  /try again in \d+\s*(?:hours?|minutes?|h|m)/i,
];

const WINDOW = 6;

function hasNearbyMatch(lines, idx, patterns) {
  const start = Math.max(0, idx - WINDOW);
  const end = Math.min(lines.length, idx + WINDOW + 1);
  for (let j = start; j < end; j++) {
    if (patterns.some(p => p.test(lines[j]))) return true;
  }
  return false;
}

export function isRateLimited(text, customPatterns = []) {
  const lines = stripAnsi(text).split('\n');

  if (customPatterns.length > 0) {
    const full = lines.join('\n');
    const custom = customPatterns.map(p => typeof p === 'string' ? new RegExp(p, 'i') : p);
    if (custom.some(p => p.test(full))) return true;
  }

  for (let i = 0; i < lines.length; i++) {
    if (LIMIT_PATTERNS.some(p => p.test(lines[i]))) {
      if (hasNearbyMatch(lines, i, RESET_PATTERNS)) return true;
    }
  }

  return false;
}

export function findRateLimitMessage(text, customPatterns = []) {
  const lines = stripAnsi(text).split('\n');

  for (const line of lines) {
    if (RESET_PATTERNS.some(p => p.test(line))) return line.trim();
  }

  for (const line of lines) {
    if (LIMIT_PATTERNS.some(p => p.test(line))) return line.trim();
  }

  return null;
}
