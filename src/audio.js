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

  const tokenizeWord = (word) => {
    const clean = word.replace(/[^a-zA-Z]/g, '').toUpperCase();
    if (!clean) return null;
    const s = `▁${clean}`;
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
  for (const phrase of wakeWords) {
    const parts = phrase
      .trim()
      .split(/\s+/)
      .map(tokenizeWord)
      .filter(Boolean);
    if (parts.length > 0) {
      const label = phrase.trim().replace(/\s+/g, '_');
      lines.add(`${parts.join(' ')} @${label}`);
    }
  }

  // Always include high-recall Ultron phonetic BPE variants
  lines.add('▁HE Y ▁ UL T RO N @Hey_Ultron');
  lines.add('▁ UL T RO N @Ultron');
  lines.add('▁A L T RO N @Ultron');
  lines.add('▁HE Y ▁A L T RO N @Hey_Ultron');
  lines.add('▁OKAY ▁ UL T RO N @Okay_Ultron');

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

  async playWavFile(filePath) {
    await this._send({ action: 'play', path: filePath });
  }

  async playWavBuffer(wavBuffer) {
    const tmpPath = path.join(TEMP_DIR, `tts_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.wav`);
    fs.writeFileSync(tmpPath, wavBuffer);
    try {
      await this.playWavFile(tmpPath);
    } finally {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  async speakWindows(text, voice = this.config.windowsTtsVoice) {
    if (!text || !text.trim()) return;
    await this._send({ action: 'speak', text, voice });
  }

  async wakeReply() {
    await this._send({ action: 'wake_reply' });
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

    // Standby pre-roll + speech-burst buffer for Whisper + Personal Voice Fingerprint wake spotting
    this.preRollChunks = [];
    this.standbyBurst = null;
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

    // Mode 1: Recording a user command with adaptive RMS VAD + silence trimming
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

      const isSpeech = rms >= rec.effectiveThreshold;
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

    // Mode 2: Paused or muted (discard audio so Jarvis never hears itself)
    if (this.paused || this.muted || !this.kws || !this.kwsStream) {
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
        if (now - this.lastWakeAt > 1200) {
          this.lastWakeAt = now;
          this.paused = true;
          this.standbyBurst = null;
          triggeredByKws = true;
          this.emit('wake', {
            text: res.keyword.replace(/_/g, ' '),
            inlineCommand: '',
            engine: 'kws',
          });
          break;
        }
      }
    }
    if (triggeredByKws) return;

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

      // Decode burst once user pauses for 360ms (or reaches 4.5s max)
      if (this.standbyBurst.silenceMs >= 360 || this.standbyBurst.totalMs >= 4500) {
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
              // 1. Check built-in Ultron + Indian-English phonetic patterns (tuned from real logs)
              const wakeMatch = transcript.match(
                /\b(?:ultron|altron|eltron|oltron|antron|electron|ultram|altram|a[\s-]+a[\s-]+tron|ultra\s*on|all\s*tron|alt\s*ron|(?:hey|here|ok|okay|we\s+are)\s*,?\s*(?:ultron|altron|tron|anton|antron|ultra\w*)|altern\w*)\b/i,
              );
              if (wakeMatch) {
                matched = true;
                const afterIdx = wakeMatch.index + wakeMatch[0].length;
                const trailing = transcript
                  .slice(afterIdx)
                  .replace(/^[\s,.:!?-]+/, '')
                  .trim();
                if (trailing.length >= 4) inlineCommand = trailing;
              }
            }

            // 2. Check Personal Enrolled Voice Profile (Acoustic Voice Fingerprint DTW + Learned Spellings)
            if (!matched && this.voiceProfile.profile) {
              const vp = this.voiceProfile.matchUtterance(f32, isNonSpeech ? '' : transcript);
              if (vp.matched) {
                matched = true;
                inlineCommand = vp.inlineCommand || '';
                matchEngine = vp.reason || 'voice-profile';
              }
            }

            if (matched) {
              const now = Date.now();
              if (now - this.lastWakeAt > 1200) {
                this.lastWakeAt = now;
                this.paused = true;
                try {
                  this.kws.reset(this.kwsStream);
                } catch {
                  // ignore
                }
                this.emit('wake', {
                  text: isNonSpeech ? 'Hey Ultron (Voice Match)' : transcript,
                  inlineCommand,
                  engine: matchEngine,
                });
              }
            } else if (!isNonSpeech && transcript.length >= 2) {
              logger.info(`[STANDBY] Heard (no wake word): "${transcript}"`);
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
      650,
      Math.max(vadThreshold, Math.round(this.ambientRms * 2.2 + 120)),
    );

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
      // Trim leading and trailing silence (keep 3 chunks = ~240ms padding)
      let firstIdx = rec.chunks.findIndex((c) => c.isSpeech);
      let lastIdx = rec.chunks.length - 1;
      while (lastIdx > firstIdx && !rec.chunks[lastIdx].isSpeech) {
        lastIdx--;
      }
      if (firstIdx < 0) firstIdx = 0;
      const start = Math.max(0, firstIdx - 3);
      const end = Math.min(rec.chunks.length, lastIdx + 4);
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
