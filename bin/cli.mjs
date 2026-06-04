#!/usr/bin/env node

import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { execFileSync, fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SRC_DIR = join(__dirname, '..', 'src');
const MONITOR_PATH = join(SRC_DIR, 'monitor.mjs');
const PID_DIR = join(homedir(), '.claude-cmux-retry');
const PID_FILE = join(PID_DIR, 'monitor.pid');

// --- PID 管理 ---

async function savePid(pid) {
  await mkdir(PID_DIR, { recursive: true });
  await writeFile(PID_FILE, String(pid));
}

async function readPid() {
  try {
    const pid = parseInt(await readFile(PID_FILE, 'utf-8'), 10);
    if (isNaN(pid)) return null;
    try { process.kill(pid, 0); return pid; } catch { return null; }
  } catch {
    return null;
  }
}

async function clearPid() {
  try { await unlink(PID_FILE); } catch {}
}

// --- cmux hooks ---

function findCmuxJson() {
  const paths = [
    join(homedir(), '.config', 'cmux', 'cmux.json'),
    join(homedir(), 'Library', 'Application Support', 'com.cmuxterm.app', 'settings.json'),
  ];
  for (const p of paths) {
    if (existsSync(p)) return p;
  }
  return paths[0];
}

const HOOK_MARKER = '/* claude-cmux-retry */';

async function cmdInstall() {
  const configPath = findCmuxJson();
  console.log(`cmux 配置文件: ${configPath}`);

  let config = {};
  try {
    config = JSON.parse(await readFile(configPath, 'utf-8'));
  } catch {
    await mkdir(dirname(configPath), { recursive: true });
  }

  if (!config.hooks) config.hooks = {};
  if (!config.hooks.claude) config.hooks.claude = {};

  const monitorCmd = `node "${MONITOR_PATH}"`;

  config.hooks.claude.onStart = {
    command: monitorCmd,
    description: HOOK_MARKER + ' 限额自动重试监控',
    enabled: true,
    background: true,
  };

  const backup = configPath + `.bak.${Date.now()}`;
  if (existsSync(configPath)) {
    await writeFile(backup, await readFile(configPath));
    console.log(`已备份: ${backup}`);
  }

  await writeFile(configPath, JSON.stringify(config, null, 2));
  console.log('已安装 cmux hook');
  console.log('Claude Code 启动时将自动开启限额监控');
  console.log('');
  console.log('手动启停:');
  console.log('  claude-cmux-retry start');
  console.log('  claude-cmux-retry stop');
}

async function cmdUninstall() {
  const configPath = findCmuxJson();

  try {
    const config = JSON.parse(await readFile(configPath, 'utf-8'));
    if (config.hooks?.claude?.onStart?.description?.includes(HOOK_MARKER)) {
      delete config.hooks.claude.onStart;
      if (Object.keys(config.hooks.claude).length === 0) delete config.hooks.claude;
      if (Object.keys(config.hooks).length === 0) delete config.hooks;
      await writeFile(configPath, JSON.stringify(config, null, 2));
      console.log('已卸载 cmux hook');
    } else {
      console.log('未找到已安装的 hook');
    }
  } catch {
    console.log('未找到 cmux 配置文件');
  }

  await cmdStop();
}

// --- start/stop ---

async function cmdStart() {
  const running = await readPid();
  if (running) {
    console.log(`监控已在运行 (PID: ${running})`);
    return;
  }

  const surfaceId = process.env.CMUX_SURFACE_ID || null;

  const monitor = fork(MONITOR_PATH, surfaceId ? [surfaceId] : [], {
    detached: true,
    stdio: 'ignore',
  });

  if (!monitor.pid) {
    console.error('启动失败');
    process.exit(1);
  }

  monitor.unref();
  await savePid(monitor.pid);

  const today = new Date().toISOString().slice(0, 10);
  console.log(`监控已启动 (PID: ${monitor.pid}, surface: ${surfaceId || 'current'})`);
  console.log(`日志: cat ~/.claude-cmux-retry/logs/${today}.log`);
}

async function cmdStop() {
  const pid = await readPid();
  if (!pid) {
    console.log('监控未在运行');
    return;
  }

  try {
    process.kill(pid, 'SIGTERM');
    console.log(`已停止 (PID: ${pid})`);
  } catch {
    console.log('进程已不存在');
  }
  await clearPid();
}

async function cmdStatus() {
  const pid = await readPid();
  if (pid) {
    console.log(`运行中 (PID: ${pid})`);
  } else {
    console.log('未运行');
  }
}

async function cmdLogs() {
  const { getLogDir, getTodayLogPath } = await import(join(SRC_DIR, 'logger.mjs'));
  const logPath = getTodayLogPath();

  if (!existsSync(logPath)) {
    console.log('今天没有日志');
    return;
  }

  const content = await readFile(logPath, 'utf-8');
  process.stdout.write(content);
}

async function cmdVersion() {
  const pkg = JSON.parse(await readFile(join(__dirname, '..', 'package.json'), 'utf-8'));
  console.log(pkg.version);
}

function cmdHelp() {
  console.log(`claude-cmux-retry — cmux 用户的 Claude Code 限额自动重试工具

命令:
  install     安装 cmux hook（Claude 启动时自动监控）
  uninstall   卸载 cmux hook
  start       手动启动监控
  stop        停止监控
  status      查看监控状态
  logs        查看今天的日志
  version     版本号
  help        帮助

配置文件（可选）:
  ~/.claude-cmux-retry.json

  {
    "maxRetries": 5,
    "pollIntervalSeconds": 5,
    "marginSeconds": 60,
    "retryMessage": "Continue where you left off."
  }
`);
}

// --- main ---

const cmd = process.argv[2];

switch (cmd) {
  case 'install':   await cmdInstall(); break;
  case 'uninstall': await cmdUninstall(); break;
  case 'start':     await cmdStart(); break;
  case 'stop':      await cmdStop(); break;
  case 'status':    await cmdStatus(); break;
  case 'logs':      await cmdLogs(); break;
  case 'version':   await cmdVersion(); break;
  case 'help': case '--help': case '-h': case undefined:
    cmdHelp(); break;
  default:
    console.error(`未知命令: ${cmd}`);
    console.error('运行 claude-cmux-retry help 查看帮助');
    process.exit(1);
}
