import fs from 'node:fs';
import path from 'node:path';
import { LOGS_DIR } from './config.js';

const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB rotation
const LOG_FILE = path.join(LOGS_DIR, 'jarvis.log');

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

function rotateIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      const stat = fs.statSync(LOG_FILE);
      if (stat.size >= MAX_LOG_BYTES) {
        const backup = path.join(LOGS_DIR, 'jarvis.prev.log');
        if (fs.existsSync(backup)) fs.unlinkSync(backup);
        fs.renameSync(LOG_FILE, backup);
      }
    }
  } catch {
    // Best-effort log rotation
  }
}

function writeLogLine(level, message) {
  const ts = new Date().toISOString();
  try {
    rotateIfNeeded();
    fs.appendFileSync(LOG_FILE, `[${ts}] [${level}] ${message}\n`, 'utf8');
  } catch {
    // Ignore file logging errors
  }
}

function timeLabel() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

export const logger = {
  logFile: LOG_FILE,

  info(msg) {
    writeLogLine('INFO', msg);
    console.log(`${COLORS.dim}[${timeLabel()}]${COLORS.reset} ${COLORS.cyan}[JARVIS]${COLORS.reset} ${msg}`);
  },

  wake(msg) {
    writeLogLine('WAKE', msg);
    console.log(`${COLORS.dim}[${timeLabel()}]${COLORS.reset} ${COLORS.magenta}[WAKE]${COLORS.reset}   ${msg}`);
  },

  user(msg) {
    writeLogLine('USER', msg);
    console.log(`${COLORS.dim}[${timeLabel()}]${COLORS.reset} ${COLORS.green}[YOU]${COLORS.reset}    ${msg}`);
  },

  tool(msg) {
    writeLogLine('TOOL', msg);
    console.log(`${COLORS.dim}[${timeLabel()}]${COLORS.reset} ${COLORS.blue}[TOOL]${COLORS.reset}   ${msg}`);
  },

  warn(msg) {
    writeLogLine('WARN', msg);
    console.warn(`${COLORS.dim}[${timeLabel()}]${COLORS.reset} ${COLORS.yellow}[WARN]${COLORS.reset}   ${msg}`);
  },

  error(msg) {
    writeLogLine('ERROR', msg);
    console.error(`${COLORS.dim}[${timeLabel()}]${COLORS.reset} ${COLORS.red}[ERROR]${COLORS.reset}  ${msg}`);
  },
};
