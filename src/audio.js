import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import sherpa from 'sherpa-onnx-node';
import { ENV_PATH, ROOT_DIR, TEMP_DIR } from './config.js';
import { logger } from './logger.js';
import { VoiceProfileManager } from './voice_profile.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const NATIVE_DIR = path.join(__dirname, 'native');
const KWS_MODEL_DIR = path.join(ROOT_DIR, 'models', 'sherpa-onnx-kws-zipformer-gigaspeech-3.3M-2024-01-01');
const WHISPER_MODEL_DIR = path.join(ROOT_DIR, 'models', 'sherpa-onnx-whisper-base.en');
const STT_MODEL_DIR = path.join(ROOT_DIR, 'models', 'sherpa-onnx-moonshine-tiny-en-int8');

const PS_EXE = 'powershell.exe';
const SAMPLE_RATE = 16000;

function spawnPowerShell(scriptName, extraArgs = []) {
  const scriptPath = path.join(NATIVE_DIR, scriptName);
  return spawn(
    PS_EXE,
    ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...extraArgs],
    {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
}

function buildWavBuffer(pcmBuffer, sampleRate = SAMPLE_RATE) {
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * 2;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // Mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(2, 32); // BlockAlign
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write('data', 36);
  header.writeUInt32LE(pcmBuffer.length, 40);
  return Buffer.concat([header, pcmBuffer]);
}

function buildKeywordsFile(wakeWords) {
  const tokensPath = path.join(KWS_MODEL_DIR, 'tokens.txt');
  const tokens = fs
    .readFileSync(tokensPath, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.split(/\s+/)[0])
    .filter(Boolean);
  const tokenSet = new Set(tokens);
  const BPE = '\u2581';

  const tokenizeWord = (word) => {
    const clean = word.replace(/[^a-zA-Z]/g, '').toUpperCase();
    if (!clean) return null;
    const s = `${BPE}${clean}`;
    const out = [];
    let i = 0;
    while (i < s.length) {
      let matched = null;
      for (let len = Math.min(8, s.length - i); len >= 1; len--) {
        const sub = s.slice(i, i + len);
        if (tokenSet.has(sub)) {
          matched = sub;
          break;
        }
      }
      if (!matched) return null;
      out.push(matched);
      i += matched.length;
    }
    return out.join(' ');
  };

  const lines = new Set();
  const safeAdd = (line) => {
    const parts = line.split('@')[0].trim().split(/\s+/);
    for (const t of parts) {
      if (!tokenSet.has(t)) {
        return;
      }
    }
    lines.add(line);
  };

  for (const phrase of wakeWords) {
    const parts = phrase
      .trim()
      .split(/\s+/)
      .map(tokenizeWord)
      .filter(Boolean);
    if (parts.length > 0) {
      const label = phrase.trim().replace(/\s+/g, '_');
      safeAdd(`${parts.join(' ')} @${label}`);
    }
  }

  // Always include high-recall Ultron phonetic BPE variants
  safeAdd(`${BPE}HE Y ${BPE} UL T RO N @Hey_Ultron`);
  safeAdd(`${BPE} UL T RO N @Ultron`);
  safeAdd(`${BPE}A L T RO N @Ultron`);
  safeAdd(`${BPE}HE Y ${BPE}A L T RO N @Hey_Ultron`);
  safeAdd(`${BPE}OKAY ${BPE} UL T RO N @Okay_Ultron`);

  // Agent Vision (Coding & SQL Specialist) - Requires intentional prefix to prevent false triggers during calls
  safeAdd(`${BPE}HE Y ${BPE}VI S ION @Hey_Vision`);
  safeAdd(`${BPE}OKAY ${BPE}VI S ION @Okay_Vision`);

  // Agent Friday (Word & PDF Specialist) - Requires intentional prefix so weekday "Friday" in calls never triggers
  safeAdd(`${BPE}HE Y ${BPE}F RI DAY @Hey_Friday`);
  safeAdd(`${BPE}OKAY ${BPE}F RI DAY @Okay_Friday`);

  // Agent Jarvis (QA & System Inspector Specialist)
  safeAdd(`${BPE}HE Y ${BPE}JA R VI S @Hey_Jarvis`);
  safeAdd(`${BPE}OKAY ${BPE}JA R VI S @Okay_Jarvis`);

  // Agent Veronica (Visual Media & Video Specialist)
  safeAdd(`${BPE}HE Y ${BPE}VER ON IC A @Hey_Veronica`);
  safeAdd(`${BPE}OKAY ${BPE}VER ON IC A @Okay_Veronica`);

  // Instant Interruption & Barge-in Keywords (Immediate speech cutoff when user says Stop, Wait, Cancel, Listen)
  safeAdd(`${BPE}ST O P @Stop`);
  safeAdd(`${BPE}WA IT @Wait`);
  safeAdd(`${BPE}CAN CE L @Cancel`);
  safeAdd(`${BPE}LI S TE N @Listen`);
  safeAdd(`${BPE}PA US E @Pause`);
  safeAdd(`${BPE}QU I ET @Quiet`);
  safeAdd(`${BPE}HA L T @Halt`);

  const kwFile = path.join(TEMP_DIR, 'ultron_keywords.txt');
  fs.writeFileSync(kwFile, `${Array.from(lines).join('\n')}\n`, 'utf8');
  return kwFile;
}

/**
 * Persistent Audio Output Worker (WAV playback, WinRT TTS fallback, synthesized chimes)
 */
export class AudioOutputWorker {
  constructor(config) {
    this.config = config;
    this.proc = null;
    this.pending = new Map();
    this.nextId = 1;
    this.readyPromise = null;
    this.stopping = false;
    this.isSpeaking = false;
  }

  async start() {
    if (this.proc) return;
    this.stopping = false;

    this.readyPromise = new Promise((resolve, reject) => {
      const proc = spawnPowerShell('audio_out.ps1', [
        '-DefaultVoice',
        this.config.windowsTtsVoice || 'Mark',
      ]);
      this.proc = proc;
      let resolved = false;

      const rl = readline.createInterface({ input: proc.stdout });
      rl.on('line', (line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const msg = JSON.parse(trimmed);
          if (msg.type === 'ready') {
            resolved = true;
            resolve();
            return;
          }
          if (msg.id !== undefined && this.pending.has(msg.id)) {
            const { resolve: res, reject: rej } = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            if (msg.ok) res(msg);
            else rej(new Error(msg.error || 'Audio worker error'));
          }
        } catch {
          // Ignore non-JSON diagnostic lines
        }
      });

      proc.stderr.on('data', (chunk) => {
        const errText = chunk.toString('utf8').trim();
        if (errText) logger.warn(`AudioOut stderr: ${errText}`);
      });

      proc.on('exit', (code) => {
        this.proc = null;
        for (const [, { reject: rej }] of this.pending) {
          rej(new Error(`Audio worker exited with code ${code}`));
        }
        this.pending.clear();
        if (!resolved) {
          reject(new Error(`Audio worker exited before ready (code ${code})`));
        } else if (!this.stopping) {
          logger.warn(`AudioOut worker exited unexpectedly (code ${code}); will respawn on next use.`);
        }
      });
    });

    await this.readyPromise;
  }

  async _send(payload) {
    if (!this.proc) {
      await this.start();
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.proc.stdin.write(`${JSON.stringify({ id, ...payload })}\n`, 'utf8');
      } catch (err) {
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  async stopPlayback() {
    this.isSpeaking = false;
    for (const [id, { resolve }] of this.pending) {
      resolve({ id, ok: true, interrupted: true });
    }
    this.pending.clear();

    const oldProc = this.proc;
    this.proc = null;
    this.readyPromise = null;

    if (oldProc) {
      oldProc.removeAllListeners('exit');
      try {
        oldProc.stdin.write(`${JSON.stringify({ id: 0, action: 'stop' })}\n`, 'utf8');
      } catch {
        // ignore
      }
      try {
        oldProc.kill();
      } catch {
        // ignore
      }
    }

    // Immediately pre-warm replacement worker in background so it is ready when user finishes speaking
    this.start().catch(() => {});
  }

  async playWavFile(filePath) {
    this.isSpeaking = true;
    try {
      return await this._send({ action: 'play', path: filePath });
    } finally {
      this.isSpeaking = false;
    }
  }

  async playWavBuffer(wavBuffer) {
    const tmpPath = path.join(TEMP_DIR, `tts_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.wav`);
    fs.writeFileSync(tmpPath, wavBuffer);
    try {
      return await this.playWavFile(tmpPath);
    } finally {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  getVoiceForAgent(agent = 'ultron') {
    const norm = String(agent || 'ultron').toLowerCase();
    if (norm === 'vision' || norm === 'coder' || norm === 'cypher') {
      return { windowsVoice: 'David', geminiVoice: 'Puck' };
    }
    if (norm === 'friday' || norm === 'writer' || norm === 'scribe' || norm === 'doc') {
      return { windowsVoice: 'Zira', geminiVoice: 'Aoede' }; // Zira is Windows native female voice
    }
    if (norm === 'jarvis' || norm === 'inspector' || norm === 'qa') {
      return { windowsVoice: 'David', geminiVoice: 'Charon' }; // Jarvis: Articulate British quality auditor
    }
    if (norm === 'veronica' || norm === 'media' || norm === 'creative' || norm === 'video') {
      return { windowsVoice: 'Zira', geminiVoice: 'Kore' }; // Veronica: Generative visual media director
    }
    return {
      windowsVoice: this.config.windowsTtsVoice || 'Mark',
      geminiVoice: this.config.geminiTtsVoice || 'Fenrir',
    };
  }

  async speakWindows(text, voice = this.config.windowsTtsVoice) {
    if (!text || !text.trim()) return;
    this.isSpeaking = true;
    try {
      return await this._send({ action: 'speak', text, voice });
    } finally {
      this.isSpeaking = false;
    }
  }

  async wakeReply() {
    await this._send({ action: 'wake_reply', agent: 'ultron' });
  }

  async wakeReplyForAgent(agent = 'ultron') {
    const norm = String(agent || 'ultron').toLowerCase();
    const targetAgent =
      norm === 'vision' || norm === 'coder' || norm === 'cypher'
        ? 'vision'
        : norm === 'friday' || norm === 'writer' || norm === 'scribe' || norm === 'doc'
          ? 'friday'
          : norm === 'jarvis' || norm === 'inspector' || norm === 'qa'
            ? 'jarvis'
            : norm === 'veronica' || norm === 'media' || norm === 'creative' || norm === 'video'
              ? 'veronica'
              : 'ultron';
    await this._send({ action: 'wake_reply', agent: targetAgent });
  }

  async playRollCall() {
    await this._send({ action: 'roll_call' });
  }

  async chime(kind = 'wake') {
    if (!this.config.enableChimes) return;
    try {
      await this._send({ action: 'chime', kind });
    } catch (err) {
      logger.warn(`Chime failed: ${err.message}`);
    }
  }

  async stop() {
    this.stopping = true;
    if (this.proc) {
      try {
        this.proc.stdin.write(`${JSON.stringify({ id: 0, action: 'exit' })}\n`);
      } catch {
        // ignore
      }
      setTimeout(() => {
        if (this.proc) {
          try {
            this.proc.kill();
          } catch {
            // ignore
          }
        }
      }, 500);
    }
  }
}

/**
 * 24/7 Native Windows ARM64 Offline Neural Wake-Word Engine ("Jarvis") + Live VAD Command Recorder
 * Powered by winmm.dll continuous 16kHz PCM stream + sherpa-onnx-node (win32-arm64) KeywordSpotter
 */
export class WakeWordListener extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.proc = null;
    this.stopping = false;
    this.paused = false;
    this.muted = false;
    this.restartAttempts = 0;
    this.lastWakeAt = 0;
    this.leftoverByte = null;

    this.kws = null;
    this.kwsStream = null;
    this.localStt = null;
    this.voiceProfile = new VoiceProfileManager();
    this.activeRecording = null;
    this.ambientRms = 35;
    this.bargeIn = false;
    this.bargeInVoiceFrames = 0;

    // Standby pre-roll + speech-burst buffer for Whisper + Personal Voice Fingerprint wake spotting
    this.preRollChunks = [];
    this.standbyBurst = null;
  }

  setBargeIn(active) {
    this.bargeIn = Boolean(active);
    this.bargeInVoiceFrames = 0;
  }

  setLocalStt(localStt) {
    this.localStt = localStt;
  }

  loadVoiceProfile() {
    return this.voiceProfile.load();
  }

  _initKws() {
    if (this.kws) return;
    const kwFile = buildKeywordsFile(this.config.wakeWords);
    this.kws = new sherpa.KeywordSpotter({
      featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
      modelConfig: {
        transducer: {
          encoder: path.join(KWS_MODEL_DIR, 'encoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),
          decoder: path.join(KWS_MODEL_DIR, 'decoder-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),
          joiner: path.join(KWS_MODEL_DIR, 'joiner-epoch-12-avg-2-chunk-16-left-64.int8.onnx'),
        },
        tokens: path.join(KWS_MODEL_DIR, 'tokens.txt'),
        numThreads: 2,
        provider: 'cpu',
      },
      keywordsFile: kwFile,
      keywordsScore: 2.5,
      keywordsThreshold: 0.14,
    });
    this.kwsStream = this.kws.createStream();
  }

  start() {
    this.stopping = false;
    this._initKws();
    this._spawn();
  }

  _spawn() {
    if (this.stopping) return;
    this.leftoverByte = null;
    const proc = spawnPowerShell('mic_stream.ps1');
    this.proc = proc;

    proc.stdout.on('data', (chunk) => {
      this._handlePcmChunk(chunk);
    });

    proc.stderr.on('data', (d) => {
      const lines = d
        .toString('utf8')
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const line of lines) {
        if (line === 'STREAM_READY') {
          this.restartAttempts = 0;
          this.emit('ready', { words: this.config.wakeWords, engine: 'sherpa-onnx-arm64' });
        } else if (line.startsWith('NO_MIC_DETECTED') || line.startsWith('WAVEIN_OPEN_FAILED')) {
          this.emit('permission_error', {
            message: `Microphone stream error (${line}). Check Windows Settings > Privacy & security > Microphone.`,
          });
        } else {
          logger.warn(`MicStream: ${line}`);
        }
      }
    });

    proc.on('exit', (code) => {
      this.proc = null;
      if (this.activeRecording) {
        this._finishRecording(false, `Mic stream exited (code ${code})`);
      }
      if (this.stopping) return;
      this.restartAttempts++;
      const delayMs = Math.min(20000, 1500 * Math.pow(1.4, Math.min(this.restartAttempts, 6)));
      logger.warn(`Mic stream stopped (code ${code}). Restarting in ${Math.round(delayMs / 1000)}s...`);
      setTimeout(() => this._spawn(), delayMs);
    });
  }

  _handlePcmChunk(rawChunk) {
    if (!rawChunk || rawChunk.length === 0) return;

    // Ensure 16-bit sample alignment across arbitrary stdout chunk boundaries
    let buf = rawChunk;
    if (this.leftoverByte) {
      buf = Buffer.concat([this.leftoverByte, rawChunk]);
      this.leftoverByte = null;
    }
    if (buf.length % 2 !== 0) {
      this.leftoverByte = buf.subarray(buf.length - 1);
      buf = buf.subarray(0, buf.length - 1);
    }
    if (buf.length < 2) return;

    const sampleCount = buf.length / 2;

    // Mode 1: Recording a user command with dual-threshold hysteresis VAD + generous pause tolerance
    if (this.activeRecording) {
      const rec = this.activeRecording;

      let sumSq = 0;
      for (let i = 0; i < buf.length; i += 2) {
        const s = buf.readInt16LE(i);
        sumSq += s * s;
      }
      const rms = Math.sqrt(sumSq / sampleCount);
      if (rms > rec.peakRms) rec.peakRms = Math.round(rms);

      const chunkMs = (sampleCount / SAMPLE_RATE) * 1000;
      rec.elapsedMs += chunkMs;

      // Hysteresis VAD:
      // Start of speech requires effectiveThreshold (e.g. 200-240) to prevent background clicks.
      // Once speech has started, continueThreshold (~50% of threshold) keeps quiet words, unvoiced
      // consonants ('s', 'th', 'f'), and trailing syllables alive so they are never falsely treated as silence!
      const currentThreshold = rec.heardSpeech ? rec.continueThreshold : rec.effectiveThreshold;
      const isSpeech = rms >= currentThreshold;
      rec.chunks.push({ buf: Buffer.from(buf), isSpeech });

      if (isSpeech) {
        rec.speechFrames++;
        if (rec.speechFrames >= 2) {
          rec.heardSpeech = true;
        }
        rec.silentAfterSpeechMs = 0;
      } else if (rec.heardSpeech) {
        rec.silentAfterSpeechMs += chunkMs;
      }

      if (
        rec.elapsedMs >= rec.maxDurationMs ||
        (!rec.heardSpeech && rec.elapsedMs >= rec.waitSpeechMs) ||
        (rec.heardSpeech && rec.silentAfterSpeechMs >= rec.silenceMs)
      ) {
        this._finishRecording(true);
      }
      return;
    }

    // Mode 2: Muted, or paused WITHOUT barge-in (discard audio so Jarvis never hears itself)
    if (this.muted || (this.paused && !this.bargeIn) || !this.kws || !this.kwsStream) {
      return;
    }

    // Mode 3: 24/7 Dual-Engine Offline Wake-Word Detection (Zipformer KWS + Moonshine 35ms Burst Spotter)
    const rawSamples = new Float32Array(sampleCount);
    let standSq = 0;
    for (let i = 0; i < sampleCount; i++) {
      const s = buf.readInt16LE(i * 2);
      standSq += s * s;
      rawSamples[i] = s / 32768.0;
    }
    const standRms = Math.sqrt(standSq / sampleCount);

    // Update ambient room noise floor ONLY during quiet frames so speech never inflates threshold!
    if (standRms < 320) {
      this.ambientRms = this.ambientRms * 0.92 + standRms * 0.08;
    }

    const standbyVadThreshold = Math.min(
      450,
      Math.max(130, Math.round(this.ambientRms * 2.0 + 90)),
    );

    // Maintain a ~320ms pre-roll ring buffer so the start of "Hey Jarvis" is never clipped
    this.preRollChunks.push(Buffer.from(buf));
    if (this.preRollChunks.length > 4) {
      this.preRollChunks.shift();
    }

    // Engine A: Streaming Zipformer KWS (instant sub-150ms trigger)
    const kwsSamples = new Float32Array(rawSamples);
    const rmsNorm = standRms / 32768.0;
    if (rmsNorm > 0.0012) {
      const gain = Math.min(12.0, 0.22 / rmsNorm);
      if (gain > 1.05) {
        for (let i = 0; i < sampleCount; i++) {
          const boosted = kwsSamples[i] * gain;
          kwsSamples[i] = boosted > 1 ? 1 : boosted < -1 ? -1 : boosted;
        }
      }
    }

    let triggeredByKws = false;
    this.kwsStream.acceptWaveform({ sampleRate: SAMPLE_RATE, samples: kwsSamples });
    while (this.kws.isReady(this.kwsStream)) {
      this.kws.decode(this.kwsStream);
      const res = this.kws.getResult(this.kwsStream);
      if (res && res.keyword && res.keyword.trim() !== '') {
        this.kws.reset(this.kwsStream);
        const now = Date.now();
        if (now - this.lastWakeAt > 800) {
          this.lastWakeAt = now;
          let targetAgent = 'ultron';
          const kwLower = res.keyword.toLowerCase();
          if (kwLower.includes('vision')) targetAgent = 'vision';
          else if (kwLower.includes('friday')) targetAgent = 'friday';
          else if (kwLower.includes('jarvis')) targetAgent = 'jarvis';
          else if (kwLower.includes('veronica')) targetAgent = 'veronica';

          const isStopWord = /^(?:stop|wait|pause|quiet|cancel|listen|halt)$/i.test(res.keyword);

          if (this.bargeIn) {
            this.emit('barge_in', {
              text: res.keyword.replace(/_/g, ' '),
              isStopWord,
              targetAgent,
              engine: 'kws',
            });
            break;
          } else {
            this.paused = true;
            this.standbyBurst = null;
            triggeredByKws = true;
            this.emit('wake', {
              text: res.keyword.replace(/_/g, ' '),
              inlineCommand: '',
              engine: 'kws',
              targetAgent,
            });
            break;
          }
        }
      }
    }
    if (triggeredByKws) return;

    // Barge-in VAD Voice Activity: If user speaks clearly into mic (>450 RMS for 2 frames) while agent speaks
    if (this.bargeIn && standRms > 450) {
      this.bargeInVoiceFrames = (this.bargeInVoiceFrames || 0) + 1;
      if (this.bargeInVoiceFrames >= 2) {
        this.bargeInVoiceFrames = 0;
        const now = Date.now();
        if (now - this.lastWakeAt > 800) {
          this.lastWakeAt = now;
          this.emit('barge_in', {
            text: 'user_speaking',
            isVoiceActivity: true,
            targetAgent: 'ultron',
            engine: 'vad',
          });
        }
      }
    } else {
      this.bargeInVoiceFrames = 0;
    }

    // Engine B: Moonshine-Tiny 35ms Speech-Burst Wake Spotter (handles all accents + "Hey Jarvis <command>"!)
    if (!this.localStt) return;
    const chunkMs = (sampleCount / SAMPLE_RATE) * 1000;
    const isSpeech = standRms >= standbyVadThreshold;

    if (!this.standbyBurst) {
      if (isSpeech) {
        this.standbyBurst = {
          chunks: [...this.preRollChunks],
          speechMs: chunkMs,
          totalMs: this.preRollChunks.length * chunkMs,
          silenceMs: 0,
        };
      }
    } else {
      this.standbyBurst.chunks.push(Buffer.from(buf));
      this.standbyBurst.totalMs += chunkMs;
      if (isSpeech) {
        this.standbyBurst.speechMs += chunkMs;
        this.standbyBurst.silenceMs = 0;
      } else {
        this.standbyBurst.silenceMs += chunkMs;
      }

      // Decode burst once user pauses for 950ms (or reaches 14s max duration)
      // Increasing silence from 360ms to 950ms prevents mid-sentence breaths from prematurely splitting speech!
      if (this.standbyBurst.silenceMs >= 950 || this.standbyBurst.totalMs >= 14000) {
        const burst = this.standbyBurst;
        this.standbyBurst = null;

        // Ignore tiny 1-frame clicks/coughs (< 200ms of speech)
        if (burst.speechMs >= 200) {
          const pcm = Buffer.concat(burst.chunks);
          const n = Math.floor(pcm.length / 2);
          if (n > 1600) {
            // Normalize amplitude for crisp Whisper recognition even across a room
            let peak = 1;
            for (let i = 0; i < n * 2; i += 2) {
              const a = Math.abs(pcm.readInt16LE(i));
              if (a > peak) peak = a;
            }
            const gain = peak < 18000 ? Math.min(10.0, 22000 / peak) : 1.0;
            const f32 = new Float32Array(n);
            for (let i = 0; i < n; i++) {
              const v = (pcm.readInt16LE(i * 2) * gain) / 32768.0;
              f32[i] = v > 1 ? 1 : v < -1 ? -1 : v;
            }

            const transcript = this.localStt.transcribeSamples(f32);
            const isNonSpeech =
              !transcript ||
              /^[\[\(][^\]\)]+[\]\)]\s*\.?$/.test(transcript.trim());

            let matched = false;
            let inlineCommand = '';
            let matchEngine = this.localStt.engineName || 'whisper';

            if (!isNonSpeech) {
              let targetAgent = 'ultron';

              // 0. Check "Avengers assemble" / "Team assemble" / "Assemble" (Multi-Agent Roll Call)
              const assembleMatch = transcript.match(
                /\b(?:(?:hey|okay|ok|hi)?\s+)?(?:avengers?\s+assemble|assemble\s+the\s+team|team\s+assemble|assemble|roll\s*call)\b/i,
              );
              // 1. Check Agent Vision (Coding & SQL Specialist - strict intentional addressing)
              const visionMatch = transcript.match(
                /\b(?:(?:hey|okay|ok|hi|hello|yo)\s+)(?:vision|vizion|vishon|vison)\b|^(?:vision|vizion|vishon|vison)[\s,.:!?-]/i,
              );
              // 2. Check Agent Friday (Word & PDF Specialist - strict intentional addressing, never "on Friday" or "by Friday")
              const fridayMatch = transcript.match(
                /\b(?:(?:hey|okay|ok|hi|hello|yo)\s+)(?:friday|fryday)\b|^(?:friday|fryday)[\s,.:!?-]/i,
              );
              // 3. Check Agent Jarvis (QA & System Inspector Specialist - strict, no "service")
              const jarvisMatch = transcript.match(
                /\b(?:(?:hey|okay|ok|hi|hello|yo)\s+)(?:jarvis|charvis|jarviz)\b|^(?:jarvis|charvis|jarviz)[\s,.:!?-]/i,
              );
              // 4. Check Agent Veronica (Visual Media & Video Specialist - strict, no "media" or "creative")
              const veronicaMatch = transcript.match(
                /\b(?:(?:hey|okay|ok|hi|hello|yo)\s+)(?:veronica|varonica|veronika)\b|^(?:veronica|varonica|veronika)[\s,.:!?-]/i,
              );
              // 5. Check Commander Ultron (strict, no "electron" or "ultra on")
              const ultronMatch = transcript.match(
                /\b(?:(?:hey|okay|ok|hi|hello|yo)\s+)(?:ultron|altron|oltron|eltron)\b|^(?:ultron|altron|oltron|eltron)[\s,.:!?-]?/i,
              );

              // Intentional addressing check: Must be at the start of speech (<= 6 chars) or explicitly preceded by a greeting
              // This strictly prevents in-call conversational speech (e.g. "our vision", "by Friday") from false triggering!
              const isDirectlyAddressed = (m) => {
                if (!m) return false;
                if (m.index <= 6) return true;
                const prefix = transcript.slice(0, m.index).trim().toLowerCase();
                return /\b(hey|ok|okay|hi|hello|yo)$/.test(prefix);
              };

              // Rank matches by position so the wake word that appears earliest (at the start of speech) wins!
              const candidates = [];
              if (assembleMatch && isDirectlyAddressed(assembleMatch)) {
                candidates.push({ agent: 'ultron', match: assembleMatch, index: assembleMatch.index, minCommandLen: 0, forceCommand: 'avengers assemble' });
              }
              if (visionMatch && isDirectlyAddressed(visionMatch)) {
                candidates.push({ agent: 'vision', match: visionMatch, index: visionMatch.index, minCommandLen: 3 });
              }
              if (fridayMatch && isDirectlyAddressed(fridayMatch)) {
                candidates.push({ agent: 'friday', match: fridayMatch, index: fridayMatch.index, minCommandLen: 3 });
              }
              if (jarvisMatch && isDirectlyAddressed(jarvisMatch)) {
                candidates.push({ agent: 'jarvis', match: jarvisMatch, index: jarvisMatch.index, minCommandLen: 3 });
              }
              if (veronicaMatch && isDirectlyAddressed(veronicaMatch)) {
                candidates.push({ agent: 'veronica', match: veronicaMatch, index: veronicaMatch.index, minCommandLen: 3 });
              }
              if (ultronMatch && isDirectlyAddressed(ultronMatch)) {
                candidates.push({ agent: 'ultron', match: ultronMatch, index: ultronMatch.index, minCommandLen: 3 });
              }

              if (candidates.length > 0) {
                candidates.sort((a, b) => a.index - b.index);
                const winner = candidates[0];
                matched = true;
                targetAgent = winner.agent;
                if (winner.forceCommand) {
                  inlineCommand = winner.forceCommand;
                } else {
                  const afterIdx = winner.match.index + winner.match[0].length;
                  const trailing = transcript.slice(afterIdx).replace(/^[\s,.:!?-]+/, '').trim();
                  if (trailing.length >= winner.minCommandLen) {
                    // Check if trailing words look like an incomplete command / open-ended sentence
                    const isIncomplete =
                      /\b(and|then|to|that|saying|with|for|about|tell|message|text|search|write|create|send|or|in|at|on)$/i.test(
                        trailing,
                      ) ||
                      (/^(?:open\s+whatsapp\s+search|search|tell|message)\b/i.test(trailing) &&
                        trailing.split(/\s+/).length < 4);

                    if (!isIncomplete) {
                      inlineCommand = trailing;
                    } else {
                      logger.info(
                        `[BURST] Incomplete trailing phrase detected: "${trailing}". Waking up cleanly to record full command.`,
                      );
                    }
                  }
                }
              }

              this._lastTargetAgent = targetAgent;
            }

            // 2. Check Personal Enrolled Voice Profile (Acoustic Voice Fingerprint DTW + Learned Spellings)
            if (!matched && this.voiceProfile.profile) {
              const vp = this.voiceProfile.matchUtterance(f32, isNonSpeech ? '' : transcript);
              if (vp.matched) {
                matched = true;
                inlineCommand = vp.inlineCommand || '';
                matchEngine = vp.reason || 'voice-profile';
                this._lastTargetAgent = vp.targetAgent || 'ultron';
              }
            }

            if (matched) {
              const now = Date.now();
              if (now - this.lastWakeAt > 800) {
                this.lastWakeAt = now;
                const targetAgent = this._lastTargetAgent || 'ultron';
                const displayName = targetAgent.charAt(0).toUpperCase() + targetAgent.slice(1);
                if (this.bargeIn) {
                  this.emit('barge_in', {
                    text: isNonSpeech ? `Hey ${displayName}` : transcript,
                    inlineCommand,
                    isStopWord: false,
                    targetAgent,
                    engine: matchEngine,
                  });
                } else {
                  this.paused = true;
                  try {
                    this.kws.reset(this.kwsStream);
                  } catch {
                    // ignore
                  }
                  this.emit('wake', {
                    text: isNonSpeech ? `Hey ${displayName} (Voice Match)` : transcript,
                    inlineCommand,
                    engine: matchEngine,
                    targetAgent,
                  });
                }
              }
            } else if (!isNonSpeech && transcript.length >= 2) {
              if (this.bargeIn) {
                const now = Date.now();
                if (now - this.lastWakeAt > 800) {
                  this.lastWakeAt = now;
                  const isStop = /^(?:stop|wait|pause|quiet|cancel|nevermind|halt|hold on|shh|shut up)/i.test(transcript);
                  this.emit('barge_in', {
                    text: transcript,
                    inlineCommand: transcript,
                    isStopWord: isStop,
                    targetAgent: this._lastTargetAgent || 'ultron',
                    engine: matchEngine,
                  });
                }
              } else {
                logger.info(`[STANDBY] Heard (no wake word): "${transcript}"`);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Capture a spoken command directly from the live 16kHz PCM stream (zero mic reopen latency!)
   */
  recordCommand(overrides = {}) {
    const outPath = path.join(TEMP_DIR, `cmd_${Date.now()}.wav`);
    const waitSpeechMs = overrides.waitSpeechMs ?? this.config.recordWaitSpeechMs;
    const silenceMs = overrides.silenceMs ?? this.config.recordSilenceMs;
    const maxDurationMs = overrides.maxDurationMs ?? this.config.recordMaxMs;
    const vadThreshold = overrides.vadThreshold ?? this.config.vadThreshold;

    if (!this.proc) {
      return Promise.resolve({
        ok: false,
        heardSpeech: false,
        path: outPath,
        error: 'Microphone stream is not active.',
      });
    }

    const effectiveThreshold = Math.min(
      520,
      Math.max(vadThreshold, Math.round(this.ambientRms * 2.0 + 80)),
    );
    const continueThreshold = Math.max(70, Math.round(effectiveThreshold * 0.50));

    return new Promise((resolve) => {
      const safetyTimer = setTimeout(() => {
        this._finishRecording(true);
      }, maxDurationMs + 1500);

      this.activeRecording = {
        outPath,
        waitSpeechMs,
        silenceMs,
        maxDurationMs,
        vadThreshold,
        effectiveThreshold,
        continueThreshold,
        chunks: [],
        heardSpeech: false,
        speechFrames: 0,
        elapsedMs: 0,
        silentAfterSpeechMs: 0,
        peakRms: 0,
        safetyTimer,
        resolve,
      };
    });
  }

  _finishRecording(ok, error = null) {
    const rec = this.activeRecording;
    if (!rec) return;
    this.activeRecording = null;
    clearTimeout(rec.safetyTimer);

    if (ok && rec.heardSpeech && rec.chunks.length > 0) {
      // Trim leading and trailing silence (keep ~400ms leading, ~480ms trailing padding so final words are never clipped!)
      let firstIdx = rec.chunks.findIndex((c) => c.isSpeech);
      let lastIdx = rec.chunks.length - 1;
      while (lastIdx > firstIdx && !rec.chunks[lastIdx].isSpeech) {
        lastIdx--;
      }
      if (firstIdx < 0) firstIdx = 0;
      const start = Math.max(0, firstIdx - 4);
      const end = Math.min(rec.chunks.length, lastIdx + 6);
      const trimmedBuffers = rec.chunks.slice(start, end).map((c) => c.buf);
      const pcm = Buffer.concat(trimmedBuffers);

      // Gently normalize quiet desk-mic recordings so local & cloud STT both transcribe crisply
      const normPcm = Buffer.allocUnsafe(pcm.length);
      let peak = 1;
      for (let i = 0; i < pcm.length - 1; i += 2) {
        const a = Math.abs(pcm.readInt16LE(i));
        if (a > peak) peak = a;
      }
      const gain = peak < 18000 ? Math.min(8.0, 22000 / peak) : 1.0;
      for (let i = 0; i < pcm.length - 1; i += 2) {
        const v = Math.round(pcm.readInt16LE(i) * gain);
        normPcm.writeInt16LE(Math.max(-32767, Math.min(32767, v)), i);
      }

      const wav = buildWavBuffer(normPcm, SAMPLE_RATE);
      fs.writeFileSync(rec.outPath, wav);
    }

    rec.resolve({
      ok,
      heardSpeech: ok && rec.heardSpeech,
      path: rec.outPath,
      durationMs: Math.round(rec.elapsedMs),
      peakRms: rec.peakRms,
      threshold: rec.effectiveThreshold,
      error,
    });
  }

  pause() {
    this.paused = true;
    this.standbyBurst = null;
    this.preRollChunks = [];
    if (this.kws && this.kwsStream) {
      try {
        this.kws.reset(this.kwsStream);
      } catch {
        // ignore
      }
    }
  }

  resume() {
    if (this.muted) return;
    this.standbyBurst = null;
    this.preRollChunks = [];
    if (this.kws && this.kwsStream) {
      try {
        this.kws.reset(this.kwsStream);
      } catch {
        // ignore
      }
    }
    this.paused = false;
  }

  setMuted(muted) {
    this.muted = muted;
    if (muted) this.pause();
    else this.resume();
  }

  stop() {
    this.stopping = true;
    if (this.activeRecording) {
      this._finishRecording(false, 'Shutting down');
    }
    if (this.proc) {
      try {
        this.proc.stdin.end();
      } catch {
        // ignore
      }
      setTimeout(() => {
        if (this.proc) {
          try {
            this.proc.kill();
          } catch {
            // ignore
          }
        }
      }, 400);
    }
  }
}

/**
 * Windows System Tray Icon controller
 */
export class SystemTrayController extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.proc = null;
    this.stopping = false;
  }

  start() {
    if (!this.config.enableTray) return;
    this.stopping = false;

    const proc = spawnPowerShell('tray.ps1', [
      '-LogPath',
      logger.logFile,
      '-EnvPath',
      ENV_PATH,
    ]);
    this.proc = proc;

    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg = JSON.parse(trimmed);
        if (msg.type === 'tray' && msg.action) {
          this.emit(msg.action);
        }
      } catch {
        // ignore
      }
    });

    proc.on('exit', () => {
      this.proc = null;
      if (!this.stopping) {
        logger.warn('System tray icon exited.');
      }
    });
  }

  setStatus(state, label) {
    if (!this.proc || this.proc.killed) return;
    try {
      this.proc.stdin.write(`${JSON.stringify({ action: 'status', state, label })}\n`);
    } catch {
      // ignore
    }
  }

  notify(title, text) {
    if (!this.proc || this.proc.killed) return;
    try {
      this.proc.stdin.write(`${JSON.stringify({ action: 'notify', title, text })}\n`);
    } catch {
      // ignore
    }
  }

  stop() {
    this.stopping = true;
    if (this.proc) {
      try {
        this.proc.stdin.write(`${JSON.stringify({ action: 'exit' })}\n`);
      } catch {
        // ignore
      }
      setTimeout(() => {
        if (this.proc) {
          try {
            this.proc.kill();
          } catch {
            // ignore
          }
        }
      }, 400);
    }
  }
}

/**
 * High-accuracy, ultra-fast (~140ms) 100% Local Offline Snapdragon ARM64 Speech-to-Text
 * Prefers Whisper Base EN (int8) for strong global accent accuracy, falls back to Moonshine Tiny (int8)
 */
export class LocalSpeechRecognizer {
  constructor() {
    this.recognizer = null;
    this.engineName = 'none';
  }

  hasWhisper() {
    return fs.existsSync(path.join(WHISPER_MODEL_DIR, 'base.en-encoder.int8.onnx'));
  }

  hasMoonshine() {
    return fs.existsSync(path.join(STT_MODEL_DIR, 'encode.int8.onnx'));
  }

  isAvailable() {
    return this.hasWhisper() || this.hasMoonshine();
  }

  init() {
    if (this.recognizer || !this.isAvailable()) return false;
    const t0 = Date.now();
    if (this.hasWhisper()) {
      this.recognizer = new sherpa.OfflineRecognizer({
        featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
        modelConfig: {
          whisper: {
            encoder: path.join(WHISPER_MODEL_DIR, 'base.en-encoder.int8.onnx'),
            decoder: path.join(WHISPER_MODEL_DIR, 'base.en-decoder.int8.onnx'),
            language: 'en',
            task: 'transcribe',
            tailPaddings: -1,
          },
          tokens: path.join(WHISPER_MODEL_DIR, 'base.en-tokens.txt'),
          numThreads: 4,
          provider: 'cpu',
          debug: 0,
        },
      });
      this.engineName = 'whisper-base-en';
      logger.info(`Local ARM64 Whisper Base EN STT ready in ${Date.now() - t0}ms (offline ~140ms transcription).`);
      return true;
    }

    this.recognizer = new sherpa.OfflineRecognizer({
      featConfig: { sampleRate: SAMPLE_RATE, featureDim: 80 },
      modelConfig: {
        moonshine: {
          preprocessor: path.join(STT_MODEL_DIR, 'preprocess.onnx'),
          encoder: path.join(STT_MODEL_DIR, 'encode.int8.onnx'),
          uncachedDecoder: path.join(STT_MODEL_DIR, 'uncached_decode.int8.onnx'),
          cachedDecoder: path.join(STT_MODEL_DIR, 'cached_decode.int8.onnx'),
        },
        tokens: path.join(STT_MODEL_DIR, 'tokens.txt'),
        numThreads: 4,
        provider: 'cpu',
        debug: 0,
      },
    });
    this.engineName = 'moonshine-tiny';
    logger.info(`Local ARM64 Moonshine STT ready in ${Date.now() - t0}ms (offline ~35ms transcription).`);
    return true;
  }

  transcribeSamples(samples, sampleRate = SAMPLE_RATE) {
    if (!this.recognizer && !this.init()) {
      return '';
    }
    const stream = this.recognizer.createStream();
    stream.acceptWaveform({ sampleRate, samples });
    this.recognizer.decode(stream);
    const result = this.recognizer.getResult(stream);
    return (result?.text || '').trim();
  }

  transcribeWav(wavPath) {
    if (!this.recognizer && !this.init()) {
      return null;
    }
    const wav = sherpa.readWave(wavPath);
    return this.transcribeSamples(wav.samples, wav.sampleRate);
  }
}
