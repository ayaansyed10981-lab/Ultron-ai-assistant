import fs from 'node:fs';
import readline from 'node:readline';
import { AudioOutputWorker, LocalSpeechRecognizer, WakeWordListener } from './audio.js';
import { loadConfig } from './config.js';
import {
  VOICE_PROFILE_PATH,
  VoiceProfileManager,
  dtwDistance,
  extractVoiceFeatures,
  normalizePhrase,
} from './voice_profile.js';

const AGENT_CONFIGS = {
  ultron: {
    key: 'ultron',
    name: 'Ultron',
    title: 'Supreme Commander',
    wakeWord: 'Hey Ultron',
    voice: 'Mark',
    startPrompt: 'Ultron voice calibration ready, sir. Please say Hey Ultron clearly {N} times when prompted.',
    completePrompt: 'Commander Ultron voice profile calibrated and secured, sir.',
    defaultSamples: 4,
  },
  vision: {
    key: 'vision',
    name: 'Vision',
    title: 'Chief Software Engineer & SQL Architect',
    wakeWord: 'Hey Vision',
    voice: 'David',
    startPrompt: 'Vision software intelligence calibration ready. Please say Hey Vision clearly {N} times when prompted.',
    completePrompt: 'Vision voice profile calibrated and online.',
    defaultSamples: 4,
  },
  friday: {
    key: 'friday',
    name: 'Friday',
    title: 'Executive Document Architect (Word & PDF)',
    wakeWord: 'Hey Friday',
    voice: 'Zira',
    startPrompt: 'Friday document architect calibration ready, sir. Please say Hey Friday clearly {N} times when prompted.',
    completePrompt: 'Friday voice profile calibrated and ready at your service, sir.',
    defaultSamples: 4,
  },
  jarvis: {
    key: 'jarvis',
    name: 'Jarvis',
    title: 'Chief Quality Assurance Engineer & Inspector',
    wakeWord: 'Hey Jarvis',
    voice: 'David',
    startPrompt: 'Jarvis quality assurance calibration ready, sir. Please say Hey Jarvis clearly {N} times when prompted.',
    completePrompt: 'Jarvis voice profile calibrated and standing by for inspection, sir.',
    defaultSamples: 4,
  },
  veronica: {
    key: 'veronica',
    name: 'Veronica',
    title: 'Chief Visual Media & Creative Generative Director',
    wakeWord: 'Hey Veronica',
    voice: 'Zira',
    startPrompt: 'Veronica visual media and creative calibration ready, sir. Please say Hey Veronica clearly {N} times when prompted.',
    completePrompt: 'Veronica voice profile calibrated and standing by for visual direction, sir.',
    defaultSamples: 4,
  },
  edith: {
    key: 'edith',
    name: 'Edith',
    title: 'Chief Media & Content Editor',
    wakeWord: 'Hey Edith',
    voice: 'Zira',
    startPrompt: 'Edith media and content editing calibration ready, sir. Please say Hey Edith clearly {N} times when prompted.',
    completePrompt: 'Edith voice profile calibrated and standing by for editing direction, sir.',
    defaultSamples: 4,
  },
};

function parseArgs() {
  const args = process.argv.slice(2);
  let agent = null;
  let samples = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i].toLowerCase();
    if (a === '--agent' && args[i + 1]) {
      agent = args[i + 1].toLowerCase();
      i++;
    } else if (a.startsWith('--agent=')) {
      agent = a.split('=')[1].toLowerCase();
    } else if (a === '--samples' && args[i + 1]) {
      samples = parseInt(args[i + 1], 10);
      i++;
    } else if (a.startsWith('--samples=')) {
      samples = parseInt(a.split('=')[1], 10);
    } else if (['ultron', 'vision', 'friday', 'jarvis', 'all'].includes(a)) {
      agent = a;
    }
  }

  return { agent, samples: Number.isFinite(samples) && samples > 0 ? samples : null };
}

async function promptMenu() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log('\n============================================================');
    console.log('   ULTRON MULTI-AGENT VOICE TRAINING WIZARD (Windows ARM64)');
    console.log('============================================================');
    console.log('  Calibrate personalized voice recognition for your agents:\n');
    console.log('    [1] Train All Operatives (Ultron -> Vision -> Friday -> Jarvis) [Recommended]');
    console.log('    [2] Train Commander Ultron only ("Hey Ultron")');
    console.log('    [3] Train Agent Vision only     ("Hey Vision" - Coding & SQL)');
    console.log('    [4] Train Agent Friday only     ("Hey Friday" - Word & PDF)');
    console.log('    [5] Train Agent Jarvis only     ("Hey Jarvis" - QA & Inspection)\n');

    rl.question('  Select an option [1-5] (default: 1): ', (ans) => {
      rl.close();
      const choice = (ans || '').trim();
      if (choice === '2') resolve('ultron');
      else if (choice === '3') resolve('vision');
      else if (choice === '4') resolve('friday');
      else if (choice === '5') resolve('jarvis');
      else resolve('all');
    });
  });
}

async function enrollAgent(agentDef, numSamples, mic, audioOut, stt) {
  console.log('\n------------------------------------------------------------');
  console.log(`  CALIBRATING: ${agentDef.name.toUpperCase()} (${agentDef.title})`);
  console.log(`  Wake Phrase : "${agentDef.wakeWord}"`);
  console.log(`  Voice Tutor : Microsoft ${agentDef.voice} (${agentDef.key === 'friday' ? 'Female' : 'Male'})`);
  console.log(`  Samples     : ${numSamples} clean voice recordings`);
  console.log('------------------------------------------------------------\n');

  const greeting = agentDef.startPrompt.replace('{N}', String(numSamples));
  await audioOut.speakWindows(greeting, agentDef.voice);

  const templates = [];
  const learnedSet = new Set();

  for (let i = 1; i <= numSamples; i++) {
    let accepted = false;
    while (!accepted) {
      console.log(`  [${i}/${numSamples}] Say "${agentDef.wakeWord}" now...`);
      await audioOut.chime('wake');

      const rec = await mic.recordCommand({
        waitSpeechMs: 6500,
        silenceMs: 650,
        maxDurationMs: 4000,
        vadThreshold: 135,
      });

      if (!rec.ok || !rec.heardSpeech || !fs.existsSync(rec.path)) {
        console.log('  -> Did not hear speech. Let us try that one again...');
        continue;
      }

      const transcript = stt.transcribeWav(rec.path) || '';
      const wavBuf = fs.readFileSync(rec.path);
      try {
        fs.unlinkSync(rec.path);
      } catch {
        // ignore
      }

      const pcm = wavBuf.subarray(44);
      const n = Math.floor(pcm.length / 2);
      const samples = new Float32Array(n);
      for (let k = 0; k < n; k++) samples[k] = pcm.readInt16LE(k * 2) / 32768.0;

      const feats = extractVoiceFeatures(samples);
      if (!feats) {
        console.log('  -> Recording was too short or quiet. Please speak up and try again...');
        continue;
      }

      templates.push(feats);
      const norm = normalizePhrase(transcript);
      if (norm && norm.length >= 3 && !/^(blank audio|static|music|inaudible|singing)$/.test(norm)) {
        learnedSet.add(norm);
      }

      console.log(`  -> Captured sample ${i}/${numSamples}! (Whisper heard: "${transcript || '...'}")\n`);
      accepted = true;
    }
  }

  // Calculate pairwise DTW intra-distances to establish calibration threshold
  let sumDist = 0;
  let pairCount = 0;
  let maxIntra = 0;
  for (let i = 0; i < templates.length; i++) {
    for (let j = i + 1; j < templates.length; j++) {
      const d = dtwDistance(templates[i], templates[j]);
      if (d < 10) {
        sumDist += d;
        pairCount++;
        if (d > maxIntra) maxIntra = d;
      }
    }
  }

  const avgIntra = pairCount > 0 ? sumDist / pairCount : 0.09;
  const threshold = Math.max(0.09, Math.min(0.138, avgIntra * 1.25));
  const learnedPhrases = Array.from(learnedSet);

  await audioOut.speakWindows(agentDef.completePrompt, agentDef.voice);

  return {
    name: agentDef.name,
    title: agentDef.title,
    wakeWord: agentDef.wakeWord,
    sampleCount: templates.length,
    avgIntraDistance: Number(avgIntra.toFixed(4)),
    threshold: Number(threshold.toFixed(4)),
    learnedPhrases,
    templates,
    createdAt: new Date().toISOString(),
  };
}

async function main() {
  const cliArgs = parseArgs();
  let targetAgent = cliArgs.agent;

  if (!targetAgent) {
    if (process.stdin.isTTY) {
      targetAgent = await promptMenu();
    } else {
      targetAgent = 'all';
    }
  }

  let agentsToTrain = [];
  if (targetAgent === 'all') {
    agentsToTrain = [AGENT_CONFIGS.ultron, AGENT_CONFIGS.vision, AGENT_CONFIGS.friday];
  } else if (AGENT_CONFIGS[targetAgent]) {
    agentsToTrain = [AGENT_CONFIGS[targetAgent]];
  } else {
    console.error(`Unknown agent: "${targetAgent}". Valid options: ultron, vision, friday, all.`);
    process.exit(1);
  }

  const config = loadConfig();
  const audioOut = new AudioOutputWorker(config);
  const stt = new LocalSpeechRecognizer();
  const mic = new WakeWordListener(config);
  const profileMgr = new VoiceProfileManager();

  profileMgr.load();

  console.log('\n============================================================');
  console.log('   ULTRON MULTI-AGENT VOICE CALIBRATION (Windows ARM64)');
  console.log('============================================================');
  console.log(`  Training Queue : ${agentsToTrain.map((a) => a.name).join(' -> ')}`);
  console.log(`  Samples/Agent  : ${cliArgs.samples || 4}`);
  console.log('  Microphone     : 16kHz winmm low-latency stream');
  console.log('  Acoustics      : Banded Dynamic Time Warping (DTW) + Mel Log-Filterbank');
  console.log('  Transcription  : Neural Whisper Base EN');
  console.log('============================================================\n');

  console.log('[*] Initializing audio output worker & speech recognizer...');
  await audioOut.start();
  stt.init();
  mic.start();
  mic.pause();

  await new Promise((resolve) => {
    mic.once('ready', resolve);
    setTimeout(resolve, 2500);
  });

  const enrolledData = {};

  for (const agentDef of agentsToTrain) {
    const numSamples = cliArgs.samples || agentDef.defaultSamples;
    const data = await enrollAgent(agentDef, numSamples, mic, audioOut, stt);
    enrolledData[agentDef.key] = data;
    profileMgr.saveAgent(agentDef.key, data);
  }

  console.log('\n============================================================');
  console.log('  ALL REQUESTED VOICE PROFILES SAVED SUCCESSFULLY!');
  console.log(`  Profile File: ${VOICE_PROFILE_PATH}`);
  for (const [key, data] of Object.entries(enrolledData)) {
    console.log(`   [+] ${data.name}:`);
    console.log(`       - Wake Word : "${data.wakeWord}"`);
    console.log(`       - Samples   : ${data.sampleCount}`);
    console.log(`       - Threshold : ${data.threshold}`);
    console.log(`       - Phrases   : ${data.learnedPhrases.join(', ') || '(acoustic DTW only)'}`);
  }
  console.log('============================================================\n');

  mic.stop();
  await audioOut.stop();
  setTimeout(() => process.exit(0), 400);
}

main().catch((err) => {
  console.error('Enrollment error:', err);
  process.exit(1);
});
