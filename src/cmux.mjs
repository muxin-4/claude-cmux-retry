import { execFile as execFileCb } from 'node:child_process';
import { existsSync } from 'node:fs';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

const CANDIDATES = [
  '/Applications/cmux.app/Contents/Resources/bin/cmux',
  '/usr/local/bin/cmux',
];

let cmuxBin = null;

function getCmux() {
  if (cmuxBin) return cmuxBin;
  for (const path of CANDIDATES) {
    if (existsSync(path)) { cmuxBin = path; return path; }
  }
  cmuxBin = 'cmux';
  return 'cmux';
}

export async function readScreen(surfaceId, lines = 30) {
  const args = ['read-screen', '--lines', String(lines)];
  if (surfaceId) args.push('--surface', surfaceId);
  const { stdout } = await execFile(getCmux(), args);
  return stdout;
}

export async function capturePane(surfaceId, lines = 30) {
  const args = ['capture-pane', '--lines', String(lines)];
  if (surfaceId) args.push('--surface', surfaceId);
  const { stdout } = await execFile(getCmux(), args);
  return stdout;
}

export async function send(text, surfaceId) {
  const args = ['send'];
  if (surfaceId) args.push('--surface', surfaceId);
  args.push(text);
  await execFile(getCmux(), args);
}

export async function sendKey(key, surfaceId) {
  const args = ['send-key'];
  if (surfaceId) args.push('--surface', surfaceId);
  args.push(key);
  await execFile(getCmux(), args);
}

export async function ping() {
  try {
    await execFile(getCmux(), ['ping']);
    return true;
  } catch {
    return false;
  }
}

export function isInsideCmux() {
  return !!process.env.CMUX_SURFACE_ID;
}

export function getCurrentSurface() {
  return process.env.CMUX_SURFACE_ID || null;
}
