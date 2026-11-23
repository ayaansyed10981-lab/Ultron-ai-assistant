import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.resolve(__dirname, '..');
export const ENV_PATH = path.join(ROOT_DIR, '.env');
export const LOGS_DIR = path.join(ROOT_DIR, 'logs');
export const TEMP_DIR = path.join(ROOT_DIR, '.tmp');

fs.mkdirSync(LOGS_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });

dotenv.config({ path: ENV_PATH });

function parseBool(val, fallback) {
  if (val === undefined || val === null || val === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(val).trim().toLowerCase());
}

function parseIntSafe(val, fallback) {
  const n = Number.parseInt(val, 10);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig() {
  dotenv.config({ path: ENV_PATH, override: true });

  const wakeWordsRaw = process.env.WAKE_WORDS || 'Hey Ultron,Ultron,Okay Ultron';
  const wakeWords = wakeWordsRaw
    .split(',')
    .map((w) => w.trim())
    .filter(Boolean);

  return {
    apiKey: (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim(),
    model: (process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim(),
    sttEngine: (process.env.STT_ENGINE || 'hybrid').trim().toLowerCase(),
    transcribeModel: (process.env.GEMINI_TRANSCRIBE_MODEL || 'gemini-2.5-flash').trim(),
    ttsModel: (process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-lite-tts').trim(),
    ttsEngine: (process.env.TTS_ENGINE || 'windows').trim().toLowerCase(),
    geminiTtsVoice: (process.env.GEMINI_TTS_VOICE || 'Charon').trim(),
    geminiTtsStyle: (
      process.env.GEMINI_TTS_STYLE || 'calm, articulate, subtly witty British AI butler'
    ).trim(),
    windowsTtsVoice: (process.env.WINDOWS_TTS_VOICE || 'Mark').trim(),
    wakeWords: wakeWords.length > 0 ? wakeWords : ['Hey Ultron', 'Ultron', 'Okay Ultron'],
    wakeConfidence: (process.env.WAKE_CONFIDENCE || 'high').trim().toLowerCase(),
    mediaReelGuard: parseBool(process.env.MEDIA_REEL_GUARD, true),
    speakerPlaybackGuard: parseBool(process.env.SPEAKER_PLAYBACK_GUARD, true),
    voiceVerification: parseBool(process.env.VOICE_VERIFICATION, true),
    recordWaitSpeechMs: parseIntSafe(process.env.RECORD_WAIT_SPEECH_MS, 4000),
    recordSilenceMs: parseIntSafe(process.env.RECORD_SILENCE_MS, 700),
    recordMaxMs: parseIntSafe(process.env.RECORD_MAX_MS, 20000),
    vadThreshold: parseIntSafe(process.env.VAD_THRESHOLD, 220),
    followUpSeconds: parseIntSafe(process.env.FOLLOW_UP_SECONDS, 3),
    sessionResetMinutes: parseIntSafe(process.env.SESSION_RESET_MINUTES, 20),
    allowShell: parseBool(process.env.ALLOW_SHELL, true),
    enableTray: parseBool(process.env.ENABLE_TRAY, true),
    enableChimes: parseBool(process.env.ENABLE_CHIMES, true),
    greetOnStart: parseBool(process.env.GREET_ON_START, true),
    hudPort: parseIntSafe(process.env.HUD_PORT, 3800),
    enableHud: parseBool(process.env.ENABLE_HUD, true),
  };
}

export function saveApiKeyToEnv(apiKey) {
  const cleanKey = apiKey.trim();
  let content = '';
  if (fs.existsSync(ENV_PATH)) {
    content = fs.readFileSync(ENV_PATH, 'utf8');
  } else if (fs.existsSync(path.join(ROOT_DIR, '.env.example'))) {
    content = fs.readFileSync(path.join(ROOT_DIR, '.env.example'), 'utf8');
  }

  if (/^GEMINI_API_KEY=.*$/m.test(content)) {
    content = content.replace(/^GEMINI_API_KEY=.*$/m, `GEMINI_API_KEY=${cleanKey}`);
  } else {
    content = `GEMINI_API_KEY=${cleanKey}\n${content}`;
  }

  fs.writeFileSync(ENV_PATH, content, 'utf8');
  process.env.GEMINI_API_KEY = cleanKey;
}
