import { stripAnsi, isRateLimited, findRateLimitMessage } from './patterns.mjs';
import { parseResetTime, calculateWaitMs } from './time-parser.mjs';
import { readScreen, send, sendKey } from './cmux.mjs';
import { loadConfig } from './config.mjs';
import { createLogger, cleanOldLogs } from './logger.mjs';

export function createMonitorState() {
  return { status: 'monitoring', waitUntil: 0, attempts: 0, lastRateLimitMessage: null };
}

export async function processOneTick(state, adapter, config) {
  const raw = await adapter.readScreen();

  if (state.status === 'waiting') {
    if (Date.now() < state.waitUntil) return 'waiting';

    if (!isRateLimited(raw, config.customPatterns)) {
      state.status = 'monitoring';
      state.attempts = 0;
      return 'cleared';
    }

    if (state.attempts >= config.maxRetries) {
      state.waitUntil = Date.now() + (config.pollIntervalSeconds * 1000 * 12);
      return 'max-retries';
    }

    state.attempts++;
    state.waitUntil = Date.now() + 30_000;
    await adapter.send(config.retryMessage);
    await adapter.sendKey('enter');
    return 'retried';
  }

  if (isRateLimited(raw, config.customPatterns)) {
    const message = findRateLimitMessage(raw, config.customPatterns);
    state.lastRateLimitMessage = message;
    const parsed = message ? parseResetTime(message) : null;
    const waitMs = calculateWaitMs(parsed, config.marginSeconds, config.fallbackWaitHours);
    state.waitUntil = Date.now() + waitMs;
    state.status = 'waiting';
    return 'rate-limited';
  }

  return 'monitoring';
}

export async function startMonitor(surfaceId) {
  const config = await loadConfig();
  const logger = createLogger();
  const state = createMonitorState();
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 20;

  await cleanOldLogs();
  await logger.info(`监控启动 (surface: ${surfaceId || 'current'})`);

  const adapter = {
    readScreen: () => readScreen(surfaceId),
    send: (text) => send(text, surfaceId),
    sendKey: (key) => sendKey(key, surfaceId),
  };

  const tick = async () => {
    try {
      const result = await processOneTick(state, adapter, config);
      consecutiveErrors = 0;

      if (result === 'rate-limited') {
        const waitMin = Math.round((state.waitUntil - Date.now()) / 60000);
        await logger.info(`检测到限额: "${state.lastRateLimitMessage}". 等待 ${waitMin} 分钟...`);
        state.lastRateLimitMessage = null;
      }
      if (result === 'retried') {
        await logger.info(`已发送重试 (第 ${state.attempts}/${config.maxRetries} 次)`);
      }
      if (result === 'cleared') {
        await logger.info('限额已解除，恢复监控');
      }
      if (result === 'max-retries') {
        await logger.warn(`已达最大重试次数 (${config.maxRetries})，继续监控但暂不重试`);
      }
    } catch (err) {
      consecutiveErrors++;
      await logger.error(`监控错误: ${err.message}`);
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        await logger.error(`连续 ${MAX_CONSECUTIVE_ERRORS} 次错误，退出监控`);
        process.exit(1);
      }
    }
  };

  const loop = () => {
    setTimeout(async () => {
      await tick();
      loop();
    }, config.pollIntervalSeconds * 1000);
  };

  await tick();
  loop();
}

// 直接运行: node monitor.mjs [surface-id]
const isDirectRun = process.argv[1]?.endsWith('monitor.mjs') && !process.argv[1]?.endsWith('cli.mjs');
if (isDirectRun) {
  startMonitor(process.argv[2] || process.env.CMUX_SURFACE_ID || null);
}
