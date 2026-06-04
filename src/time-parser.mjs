const RESET_TIME_REGEX = /resets?\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:\(([^)]+)\))?/i;
const RELATIVE_TIME_REGEX = /(?:try again|wait|resets?\s+in)[:\s]\s*(?:for\s+)?(?:in\s+)?(\d+)\s*(hours?|minutes?|mins?|h|m)\b/i;

export function parseResetTime(text) {
  const absMatch = text.match(RESET_TIME_REGEX);
  if (absMatch) {
    let hour = parseInt(absMatch[1], 10);
    const minute = absMatch[2] ? parseInt(absMatch[2], 10) : 0;
    const ampm = absMatch[3]?.toLowerCase() || null;
    const timezone = absMatch[4] || null;

    if (ampm === 'pm' && hour !== 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;

    const ambiguous = !ampm && hour >= 1 && hour <= 12;
    return { hour, minute, timezone, ambiguous };
  }

  const relMatch = text.match(RELATIVE_TIME_REGEX);
  if (relMatch) {
    const amount = parseInt(relMatch[1], 10);
    const unit = relMatch[2].toLowerCase();
    const ms = amount * (unit.startsWith('m') ? 60_000 : 3_600_000);
    return { relative: true, waitMs: ms };
  }

  return null;
}

export function calculateWaitMs(parsed, marginSeconds = 60, fallbackHours = 5, now = new Date()) {
  if (!parsed) return (fallbackHours * 3600 + marginSeconds) * 1000;

  if (parsed.relative) {
    return parsed.waitMs + marginSeconds * 1000;
  }

  let tz;
  try {
    tz = parsed.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    return (fallbackHours * 3600 + marginSeconds) * 1000;
  }

  function getTargetTimestamp(h, m) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour12: false,
    }).formatToParts(now);

    const y = parseInt(parts.find(p => p.type === 'year').value);
    const mo = parseInt(parts.find(p => p.type === 'month').value) - 1;
    const d = parseInt(parts.find(p => p.type === 'day').value);

    const targetStr = `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    let candidate = new Date(targetStr + 'Z').getTime();

    for (let i = 0; i < 3; i++) {
      const fp = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false,
      }).formatToParts(new Date(candidate));
      const ch = parseInt(fp.find(p => p.type === 'hour').value) % 24;
      const cm = parseInt(fp.find(p => p.type === 'minute').value);
      const diffMin = (h - ch) * 60 + (m - cm);
      if (diffMin === 0) break;
      candidate += diffMin * 60_000;
    }

    return candidate;
  }

  if (parsed.ambiguous) {
    const t1 = getTargetTimestamp(parsed.hour, parsed.minute);
    const t2 = getTargetTimestamp(parsed.hour + 12, parsed.minute);
    const d1 = t1 - now.getTime();
    const d2 = t2 - now.getTime();

    let target;
    if (d1 > 0 && d2 > 0) target = Math.min(d1, d2);
    else if (d1 > 0) target = d1;
    else if (d2 > 0) target = d2;
    else target = d1 + 86400_000;

    return Math.max(0, target) + marginSeconds * 1000;
  }

  let diff = getTargetTimestamp(parsed.hour, parsed.minute) - now.getTime();
  if (diff < 0) diff += 86400_000;
  return diff + marginSeconds * 1000;
}
