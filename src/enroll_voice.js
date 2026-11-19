import fs from 'node:fs';
import { AudioOutputWorker, LocalSpeechRecognizer, WakeWordListener } from './audio.js';
import { loadConfig } from './config.js';
import {
  VOICE_PROFILE_PATH,
  VoiceProfileManager,
  dtwDistance,
  extractVoiceFeatures,
  normalizePhrase,
} from './voice_profile.js';

const NUM_SAMPLES = 5;

async function main() {
  const config = loadConfig();
  const audioOut = new AudioOutputWorker(config);
  const stt = new LocalSpeechRecognizer();
  const mic = new WakeWordListener(config);
  const profileMgr = new VoiceProfileManager();

  console.log('\n============================================================');
  console.log('   ULTRON PERSONAL VOICE ENROLLMENT (Windows ARM64)');
  console.log('============================================================');
  console.log('  This 15-second training teaches Ultron to lock onto YOUR');
  console.log('  exact voice and pronunciation of "Hey Ultron"!\n');

  await audioOut.start();
  stt.init();
  mic.start();
  mic.pause();

  // Wait for mic stream ready
  await new Promise((resolve) => {
    mic.once('ready', resolve);
    setTimeout(resolve, 2500);
  });

  await audioOut.speakWindows(
    'Voice training ready, sir. Please say Hey Ultron clearly five times when prompted.',
  );

  const templates = [];
  const learnedSet = new Set();

  for (let i = 1; i <= NUM_SAMPLES; i++) {
    let accepted = false;
    while (!accepted) {
      console.log(`\n  [${i}/${NUM_SAMPLES}] Say "Hey Ultron" now...`);
      await audioOut.chime('wake');

      const rec = await mic.recordCommand({
        waitSpeechMs: 6000,
        silenceMs: 650,
        maxDurationMs: 4000,
        vadThreshold: 140,
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
        console.log('  -> Recording was too short or quiet. Please try again...');
        continue;
      }

      templates.push(feats);
      const norm = normalizePhrase(transcript);
      // Only learn clean multi-char non-blank transcripts
      if (norm && norm.length >= 4 && !/^(blank audio|static|music|inaudible|singing)$/.test(norm)) {
        learnedSet.add(norm);
      }

      console.log(`  -> Captured sample ${i}/${NUM_SAMPLES}! (Whisper heard: "${transcript || '...'}")`);
      accepted = true;
    }
  }

  // Calibrate personal DTW threshold from pairwise distances across your own 5 samples
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
  // Keep acoustic voice-fingerprint threshold tight (<= 0.135) so normal speech never false-triggers
  const threshold = Math.max(0.09, Math.min(0.135, avgIntra * 1.25));

  const learnedPhrases = Array.from(learnedSet);
  profileMgr.save({
    wakeWord: 'Hey Ultron',
    createdAt: new Date().toISOString(),
    sampleCount: templates.length,
    avgIntraDistance: Number(avgIntra.toFixed(4)),
    threshold: Number(threshold.toFixed(4)),
    learnedPhrases,
    templates,
  });

  console.log('\n============================================================');
  console.log('  VOICE PROFILE SAVED SUCCESSFULLY!');
  console.log(`  File: ${VOICE_PROFILE_PATH}`);
  console.log(`  Learned voice spellings: ${learnedPhrases.join(', ') || '(acoustic only)'}`);
  console.log(`  Calibrated voice match threshold: ${threshold.toFixed(3)}`);
  console.log('============================================================\n');

  await audioOut.speakWindows(
    'Voice training complete, sir. I am now tuned specifically to your voice for Hey Ultron.',
  );

  mic.stop();
  await audioOut.stop();
  setTimeout(() => process.exit(0), 400);
}

main().catch((err) => {
  console.error('Enrollment error:', err);
  process.exit(1);
});
