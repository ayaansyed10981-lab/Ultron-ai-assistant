import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import {
  AudioOutputWorker,
  LocalSpeechRecognizer,
  SystemTrayController,
  WakeWordListener,
} from './audio.js';
import { ENV_PATH, TEMP_DIR, loadConfig, saveApiKeyToEnv } from './config.js';
import { tryFastPath } from './fastpath.js';
import { GeminiEngine } from './gemini.js';
import { logger } from './logger.js';
import { ComputerController } from './tools.js';

const NO_CLI = process.argv.includes('--no-cli');
const PID_FILE = path.join(TEMP_DIR, 'jarvis.pid');

function enforceSingleInstance() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const oldPid = Number.parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (Number.isFinite(oldPid) && oldPid > 0 && oldPid !== process.pid) {
        try {
          process.kill(oldPid, 0);
          logger.info(`Stopping previous Jarvis instance (PID ${oldPid})...`);
          execFileSync('taskkill.exe', ['/PID', String(oldPid), '/T', '/F'], {
            stdio: 'ignore',
            windowsHide: true,
          });
        } catch {
          // Process already exited
        }
      }
    }
    fs.writeFileSync(PID_FILE, String(process.pid), 'utf8');
  } catch {
    // Best-effort single-instance guard
  }
}

function cleanupPidFile() {
  try {
    if (fs.existsSync(PID_FILE)) {
      const stored = Number.parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
      if (stored === process.pid) fs.unlinkSync(PID_FILE);
    }
  } catch {
    // ignore
  }
}

function stripMarkdownForSpeech(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, 'code snippet')
    .replace(/[*_`#>-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function promptForApiKey() {
  if (NO_CLI || !process.stdin.isTTY) {
    logger.error(
      `Missing GEMINI_API_KEY in ${ENV_PATH}. Open .env, paste your key from https://aistudio.google.com/apikey, and restart Jarvis.`,
    );
    process.exit(1);
  }

  console.log('\n============================================================');
  console.log('  JARVIS AI ASSISTANT - FIRST-TIME SETUP (Windows ARM64)');
  console.log('============================================================');
  console.log('  Get a Gemini API key at: https://aistudio.google.com/apikey');
  console.log(`  Your key will be saved locally to: ${ENV_PATH}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const key = await new Promise((resolve) => {
    rl.question('  Paste your GEMINI_API_KEY and press Enter: ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });

  if (!key) {
    logger.error('No API key provided. Exiting.');
    process.exit(1);
  }
  saveApiKeyToEnv(key);
  logger.info('Saved GEMINI_API_KEY to .env!');
}

class JarvisDaemon {
  constructor(config) {
    this.config = config;
    this.audioOut = new AudioOutputWorker(config);
    this.wakeListener = new WakeWordListener(config);
    this.localStt = new LocalSpeechRecognizer();
    this.tray = new SystemTrayController(config);
    this.gemini = new GeminiEngine(config);
    this.controller = new ComputerController(config, (label) => this.handleTimerFired(label));
    this.controller.setGeminiEngine(this.gemini);

    this.activeAgent = 'ultron';
    this.busy = false;
    this.muted = false;
    this.shuttingDown = false;
    this.permissionWarned = false;
  }

  async start() {
    logger.info('============================================================');
    logger.info(`Starting Jarvis AI Assistant (Windows ${process.arch.toUpperCase()} / Node ${process.version})`);
    logger.info(`Model: ${this.config.model} | STT: ${this.config.sttEngine} | TTS: ${this.config.ttsEngine}`);
    logger.info(`Wake words: ${this.config.wakeWords.join(', ')} (Offline Neural ARM64 ONNX)`);
    logger.info('============================================================');

    await this.audioOut.start();
    await this.controller.start();
    if (this.localStt.isAvailable()) {
      this.localStt.init();
      this.wakeListener.setLocalStt(this.localStt);
    }
    this.wakeListener.loadVoiceProfile();

    // Wire System Tray events
    this.tray.on('ready', () => {
      this.tray.setStatus('idle', 'Ultron - Listening for "Hey Ultron"');
      if (NO_CLI) {
        this.tray.notify(
          'Ultron AI Active 24/7',
          'Say "Hey Ultron" anytime, or double-click this tray icon to talk.',
        );
      }
    });
    this.tray.on('listen_now', () => {
      this.triggerVoiceInteraction('Tray Click');
    });
    this.tray.on('toggle_mute', () => {
      this.toggleMute();
    });
    this.tray.on('exit', () => {
      this.shutdown();
    });
    this.tray.start();

    // Wire 24/7 Offline Neural Wake-Word Listener events
    this.wakeListener.on('ready', (info) => {
      logger.info(
        `Offline neural wake-word engine active (${info.words.join(', ')}). Standing by 24/7 for Ultron, Vision, and Friday.`,
      );
      this.tray.setStatus('idle', 'Ultron Team - Listening (Ultron, Vision, Friday, Jarvis)');
    });

    this.wakeListener.on('wake', (info) => {
      const targetAgent = info.targetAgent || 'ultron';
      logger.wake(`Detected "${info.text}" (${info.engine || 'kws'}) [Target: ${targetAgent}]`);
      this.triggerVoiceInteraction(`Wake Word "${info.text}"`, info.inlineCommand || '', targetAgent);
    });

    this.wakeListener.on('permission_error', (info) => {
      if (!this.permissionWarned) {
        this.permissionWarned = true;
        logger.error(info.message);
        this.tray.notify('Jarvis Microphone Permission Needed', info.message);
      }
    });

    this.wakeListener.start();

    if (this.config.greetOnStart) {
      this.busy = true;
      this.wakeListener.pause();
      await this.speak('Ultron and operative team online, sir.');
      this.busy = false;
      if (!this.muted) this.wakeListener.resume();
    }

    if (!NO_CLI && process.stdin.isTTY) {
      this.startInteractiveCli();
    }
  }

  async speak(text, agent = this.activeAgent) {
    const clean = stripMarkdownForSpeech(text);
    if (!clean) return;

    const voices = this.audioOut.getVoiceForAgent(agent);
    logger.info(`Speaking [${agent || 'ultron'} | Voice: ${voices.windowsVoice}]: ${clean}`);

    if (this.config.ttsEngine === 'gemini') {
      try {
        // Hard 6s cap so Gemini TTS 429 retries can NEVER freeze wake-word listening
        const wavBuf = await Promise.race([
          this.gemini.synthesizeSpeech(clean, voices.geminiVoice),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Gemini TTS timed out (>6s)')), 6000),
          ),
        ]);
        if (wavBuf) {
          await this.audioOut.playWavBuffer(wavBuf);
          return;
        }
      } catch (err) {
        logger.warn(`Gemini TTS skipped (${err.message}); using instant native Windows voice.`);
        if (String(err.message).includes('429') || String(err.message).includes('timed out')) {
          this.gemini.ttsUnavailable = true;
        }
      }
    }

    try {
      await this.audioOut.speakWindows(clean, voices.windowsVoice);
    } catch (err) {
      logger.error(`Windows TTS failed: ${err.message}`);
    }
  }

  async handleTimerFired(label) {
    logger.info(`TIMER FIRED: ${label}`);
    this.tray.notify('Jarvis Reminder', label);
    const wasBusy = this.busy;
    if (!wasBusy) this.wakeListener.pause();
    await this.audioOut.chime('timer');
    await this.speak(`Reminder: ${label}`);
    if (!wasBusy && !this.muted) this.wakeListener.resume();
  }

  toggleMute() {
    this.muted = !this.muted;
    this.wakeListener.setMuted(this.muted);
    if (this.muted) {
      logger.info('Wake-word listening PAUSED.');
      this.tray.setStatus('muted', 'Jarvis - Paused (Muted)');
    } else {
      logger.info('Wake-word listening RESUMED.');
      this.tray.setStatus('idle', 'Ultron - Listening for "Hey Ultron"');
    }
  }

  async triggerVoiceInteraction(source = 'Wake Word', initialCommand = '', targetAgent = null) {
    if (this.busy || this.shuttingDown) return;
    this.busy = true;
    this.wakeListener.pause();

    if (targetAgent) {
      this.activeAgent = targetAgent;
    }

    const agentLabel =
      this.activeAgent === 'vision' || this.activeAgent === 'coder'
        ? 'Vision (Code & SQL)'
        : this.activeAgent === 'friday' || this.activeAgent === 'writer'
          ? 'Friday (Word & PDF)'
          : this.activeAgent === 'jarvis' || this.activeAgent === 'inspector' || this.activeAgent === 'qa'
            ? 'Jarvis (QA & Inspector)'
            : 'Ultron';
    this.tray.setStatus('active', `${agentLabel} - Listening...`);

    try {
      let isFollowUp = false;
      let pendingInlineCommand = (initialCommand || '').trim();

      while (!this.shuttingDown) {
        let transcript = '';
        let sttMs = 0;

        if (pendingInlineCommand) {
          // One-shot command already spoken right after "Hey Jarvis ..." (e.g., "Hey Jarvis open Chrome")
          transcript = pendingInlineCommand;
          pendingInlineCommand = '';
          logger.user(`${transcript} (one-shot wake)`);
        } else {
          if (!isFollowUp) {
            // Instant wake reply matching whichever agent was called!
            await this.audioOut.wakeReplyForAgent(this.activeAgent);
            logger.info(`Listening for command (${source}) [Active: ${this.activeAgent}]...`);
          } else {
            logger.info(`Listening for follow-up (${this.config.followUpSeconds}s window) [Active: ${this.activeAgent}]...`);
          }

          const waitSpeechMs = isFollowUp
            ? this.config.followUpSeconds * 1000
            : this.config.recordWaitSpeechMs;

          const rec = await this.wakeListener.recordCommand({ waitSpeechMs });

          if (!rec.ok) {
            logger.error(`Recording failed: ${rec.error}`);
            if (!isFollowUp) {
              await this.audioOut.chime('error');
            }
            break;
          }

          if (!rec.heardSpeech || !fs.existsSync(rec.path)) {
            if (!isFollowUp) {
              logger.info(
                `No speech detected (peak RMS ${rec.peakRms}, threshold ${rec.threshold}). Returning to standby.`,
              );
              await this.audioOut.chime('done');
            }
            break;
          }

          const t0 = Date.now();
          try {
            this.tray.setStatus('active', `${agentLabel} - Understanding...`);
            if (this.config.sttEngine === 'local' && this.localStt.isAvailable()) {
              transcript = this.localStt.transcribeWav(rec.path) || '';
            } else {
              transcript = await this.gemini.transcribeAudio(rec.path);
            }
          } catch (err) {
            logger.error(`Transcription error: ${err.message}`);
            await this.speak('Sorry sir, I could not transcribe that.');
            break;
          } finally {
            try {
              fs.unlinkSync(rec.path);
            } catch {
              // ignore
            }
          }
          sttMs = Date.now() - t0;

          const trimmedTranscript = (transcript || '').trim();
          const lettersOnly = trimmedTranscript.replace(/[^a-zA-Z0-9]/g, '');
          const isNoiseTag =
            !trimmedTranscript ||
            lettersOnly.length < 3 ||
            /^[\[\(]/.test(trimmedTranscript) ||
            /(?:\b\w+\b(?:\s+\b\w+\b)?)(?:\s+\1){4,}/i.test(trimmedTranscript); // Whisper hallucination loop guard!

          if (isNoiseTag) {
            if (!isFollowUp) await this.audioOut.chime('done');
            break;
          }

          logger.user(`${transcript} (STT ${sttMs}ms)`);
        }

        const lower = transcript.toLowerCase().replace(/[.!?,]/g, '').trim();
        if (/^(?:cancel|never\s*mind|nothing|stop\s+listening|go\s+to\s+sleep|sleep|bye(?:\s+bye)*|goodbye|thats\s+all|that\s+is\s+all)(?:\s+.*)?$/i.test(lower)) {
          await this.speak('Standing by, sir.');
          break;
        }
        if (/^(?:ok(?:ay)?\s+)?(?:thank you|thanks|thank you very much|thanks a lot|good night|goodnight)(?:\s+(?:ultron|vision|friday|coder|writer|buddy))?$/.test(lower)) {
          await this.speak('You are welcome, sir. Let me know if you need anything else.');
          break; // Immediately return to standby so follow-up doesn't capture your next conversation!
        }
        if (/^(?:hey|here|ok|okay)?\s*(?:ultron|altron|tron|drone|prawn|john|anton|turn)$/.test(lower)) {
          this.activeAgent = 'ultron';
          await this.audioOut.wakeReplyForAgent('ultron');
          isFollowUp = true;
          continue;
        }
        if (/^(?:hey|ok|okay)?\s*(?:vision|vizion|vishon|vison|vishan|region|legion|vyram|revision|coder|cypher|code)$/i.test(lower)) {
          this.activeAgent = 'vision';
          await this.audioOut.wakeReplyForAgent('vision');
          isFollowUp = true;
          continue;
        }
        if (/^(?:hey|ok|okay)?\s*(?:friday|fryday|fry\s*day)$/i.test(lower)) {
          this.activeAgent = 'friday';
          await this.audioOut.wakeReplyForAgent('friday');
          isFollowUp = true;
          continue;
        }
        if (/^(?:hey|ok|okay)?\s*(?:jarvis|charvis|jarviss|jarviz|service)$/i.test(lower)) {
          this.activeAgent = 'jarvis';
          await this.audioOut.wakeReplyForAgent('jarvis');
          isFollowUp = true;
          continue;
        }
        if (['shut down ultron', 'exit ultron', 'quit ultron', 'shut down jarvis', 'exit jarvis', 'quit jarvis'].includes(lower)) {
          await this.speak('Shutting down. Goodbye, sir.');
          this.shutdown();
          return;
        }

        this.tray.setStatus('active', `${this.activeAgent} - Acting...`);
        const tThink = Date.now();
        let reply = '';
        try {
          const fastReply = await tryFastPath(transcript, this.controller, this.activeAgent);
          if (fastReply) {
            if (typeof fastReply === 'object' && fastReply.isRollCall) {
              this.tray.setStatus('active', 'Avengers Assembling...');
              logger.info('[AVENGERS] Executing full operative roll call...');
              await this.audioOut.playRollCall();
              this.activeAgent = 'ultron';
              if (this.config.followUpSeconds > 0) {
                isFollowUp = true;
                continue;
              }
              break;
            }
            if (typeof fastReply === 'object' && fastReply.switchAgent) {
              this.activeAgent = fastReply.switchAgent;
              reply = fastReply.text;
            } else {
              reply = fastReply;
            }
            logger.info(`[SPEED] Fast-path executed in ${Date.now() - tThink}ms [Agent: ${this.activeAgent}]`);
          } else {
            // Instant verbal acknowledgment for code, document, inspection, or multi-agent tasks
            const isBuildTask =
              /\b(?:build|make|create|code|write|program|engineer|draft|generate|check|audit|inspect|verify|test)\b.*\b(?:app|game|calculator|tracker|script|website|page|sql|schema|database|table|query|report|document|doc|pdf|code)\b/i.test(
                transcript,
              );
            const isMultiAgentTask =
              /\b(?:simultaneous|at\s+the\s+same\s+time|together|all\s+agents)\b/i.test(transcript) ||
              (/\b(?:friday|vision|jarvis)\b/i.test(transcript) &&
                /\b(?:and|also|while)\b/i.test(transcript) &&
                /\b(?:friday|vision|jarvis|website|pdf|doc|app|sql)\b/i.test(transcript));

            if (isMultiAgentTask) {
              this.speak('Coordinating operatives simultaneously in parallel now, sir.').catch(() => {});
            } else if (isBuildTask) {
              const ack =
                this.activeAgent === 'vision'
                  ? 'On it, sir. Engineering that now.'
                  : this.activeAgent === 'friday'
                    ? 'On it, sir. Preparing your document now.'
                    : this.activeAgent === 'jarvis'
                      ? 'On it, sir. Inspecting and verifying now.'
                      : 'On it, sir. Processing your request now.';
              this.speak(ack).catch(() => {});
            }

            reply = await this.gemini.processCommand(transcript, this.controller, this.activeAgent);
            logger.info(`[SPEED] Gemini replied in ${Date.now() - tThink}ms [Agent: ${this.activeAgent}]`);
          }
        } catch (err) {
          logger.error(`Gemini error: ${err.message}`);
          const msg = String(err.message || '').toLowerCase();
          if (msg.includes('401') || msg.includes('403') || msg.includes('api key')) {
            reply = 'Your Gemini API key appears invalid, sir. Please check dot env.';
          } else if (msg.includes('429') || msg.includes('quota') || msg.includes('rate limit')) {
            reply = 'Gemini free tier rate limit reached for a moment, sir. Please try again in a few seconds.';
          } else {
            reply = 'Gemini servers took too long to respond, sir. Please try that again.';
          }
        }

        this.tray.setStatus('active', `${this.activeAgent} - Speaking...`);
        await this.speak(reply);

        if (this.config.followUpSeconds > 0) {
          isFollowUp = true;
        } else {
          break;
        }
      }
    } finally {
      this.busy = false;
      if (!this.shuttingDown) {
        if (this.muted) {
          this.tray.setStatus('muted', 'Ultron Team - Paused (Muted)');
        } else {
          this.wakeListener.resume();
          this.tray.setStatus('idle', 'Ultron Team - Listening (Ultron, Vision, Friday, Jarvis)');
        }
      }
    }
  }

  async handleTextCommand(text) {
    const trimmed = text.trim();
    if (!trimmed) return;

    const lower = trimmed.toLowerCase();
    if (lower === 'quit' || lower === 'exit') {
      await this.shutdown();
      return;
    }
    if (lower === 'listen' || lower === 'wake') {
      await this.triggerVoiceInteraction('CLI Command');
      return;
    }
    if (lower === 'mute' || lower === 'unmute') {
      this.toggleMute();
      return;
    }
    if (lower === 'reset') {
      this.gemini.resetConversation();
      logger.info('Conversation memory cleared.');
      return;
    }
    if (lower === 'voice gemini') {
      this.config.ttsEngine = 'gemini';
      this.gemini.ttsUnavailable = false;
      logger.info('Switched voice engine to Gemini 3.8 TTS.');
      return;
    }
    if (lower === 'voice windows') {
      this.config.ttsEngine = 'windows';
      logger.info('Switched voice engine to native Windows WinRT TTS.');
      return;
    }

    if (this.busy) {
      logger.warn('Jarvis is currently busy with another request.');
      return;
    }

    this.busy = true;
    this.wakeListener.pause();
    this.tray.setStatus('active', 'Jarvis - Thinking...');
    try {
      logger.user(trimmed);
      const tThink = Date.now();
      const fastReply = await tryFastPath(trimmed, this.controller);
      let reply;
      if (fastReply) {
        reply = fastReply;
        logger.info(`[SPEED] Fast-path executed in ${Date.now() - tThink}ms`);
      } else {
        logger.info('Thinking...');
        reply = await this.gemini.processCommand(trimmed, this.controller);
        logger.info(`[SPEED] Gemini replied in ${Date.now() - tThink}ms`);
      }
      this.tray.setStatus('active', 'Jarvis - Speaking...');
      await this.speak(reply);
    } catch (err) {
      logger.error(`Error: ${err.message}`);
      await this.speak('Sorry, I hit an error reaching Gemini. Check the console for details.');
    } finally {
      this.busy = false;
      if (!this.muted) {
        this.wakeListener.resume();
        this.tray.setStatus('idle', 'Jarvis - Listening for "Jarvis"');
      }
    }
  }

  startInteractiveCli() {
    console.log('\n  Say "Hey Ultron" anytime, OR type a command below.');
    console.log('  Shortcuts: [listen] trigger mic | [mute] pause/resume | [voice gemini|windows] | [reset] | [quit]\n');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.on('line', async (line) => {
      await this.handleTextCommand(line);
    });
  }

  async shutdown() {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    logger.info('Shutting down Jarvis...');
    cleanupPidFile();
    this.wakeListener.stop();
    this.tray.stop();
    this.controller.stop();
    await this.audioOut.stop();
    setTimeout(() => process.exit(0), 500);
  }
}

async function main() {
  let config = loadConfig();
  if (!config.apiKey) {
    await promptForApiKey();
    config = loadConfig();
  }

  enforceSingleInstance();
  const jarvis = new JarvisDaemon(config);

  process.on('SIGINT', () => jarvis.shutdown());
  process.on('SIGTERM', () => jarvis.shutdown());
  process.on('exit', () => cleanupPidFile());
  process.on('uncaughtException', (err) => {
    logger.error(`Uncaught exception: ${err.stack || err.message}`);
  });
  process.on('unhandledRejection', (reason) => {
    logger.error(`Unhandled rejection: ${reason}`);
  });

  await jarvis.start();
}

main().catch((err) => {
  logger.error(`Fatal startup error: ${err.stack || err.message}`);
  cleanupPidFile();
  process.exit(1);
});
